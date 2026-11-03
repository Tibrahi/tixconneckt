import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, isDatabaseUnavailable } from "@/db";
import { profiles, users } from "@/db/schema";
import { apiError, apiOk, clientIp } from "@/lib/api-response";
import { createSessionForUser } from "@/lib/auth-session";
import { demoModeEnabled, getDemoPersona } from "@/lib/demo";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { generateUniqueShortId } from "@/lib/short-id";

const demoStartSchema = z.object({
  persona: z.string().min(1),
});

/**
 * Open demo entry: mint a session for a demo persona with no password, OTP,
 * or email step. Demo accounts carry no credentials row, so they can never
 * sign in through the normal login — only through this endpoint, which the
 * operator can disable with DEMO_MODE=false.
 */
export async function POST(req: Request) {
  if (!demoModeEnabled()) {
    return apiError("Demo mode is disabled.", 403);
  }
  try {
    return await startDemo(req);
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;
    return apiError("Service temporarily unavailable. Please try again shortly.", 503);
  }
}

async function startDemo(req: Request) {
  const rl = await rateLimit("demo-start", clientIp(req) ?? "unknown", 30, "1 h");
  if (!rl.allowed) {
    return apiError("Too many demo requests. Please try again later.", 429, undefined, rateLimitHeaders(rl, 30));
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body.");
  }
  const parsed = demoStartSchema.safeParse(body);
  const persona = parsed.success ? getDemoPersona(parsed.data.persona) : undefined;
  if (!persona) {
    return apiError("Choose a valid demo role.", 400);
  }

  const db = getDb();
  const existing = await db.select().from(users).where(eq(users.email, persona.email)).limit(1);
  let userId: string;
  if (existing.length > 0) {
    const row = existing[0];
    userId = row.id;
    // Demo accounts must just work: keep them active with their persona role.
    if (row.status !== "active" || row.role !== persona.role || row.category !== persona.category) {
      await db
        .update(users)
        .set({ status: "active", emailVerified: true, role: persona.role, category: persona.category, providerKind: persona.providerKind })
        .where(eq(users.id, row.id));
    }
  } else {
    const inserted = await db
      .insert(users)
      .values({
        name: persona.name,
        email: persona.email,
        emailVerified: true,
        shortId: await generateUniqueShortId(),
        category: persona.category,
        providerKind: persona.providerKind,
        role: persona.role,
        status: "active",
      })
      .returning({ id: users.id });
    userId = inserted[0].id;
    await db.insert(profiles).values({ userId });
  }

  await createSessionForUser(userId, {
    ipAddress: clientIp(req) ?? undefined,
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return apiOk({ redirectTo: persona.redirectTo, persona: persona.key, label: persona.label });
}
