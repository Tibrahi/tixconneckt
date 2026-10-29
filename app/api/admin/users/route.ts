import { count, desc, eq, ilike, or } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { securityEvents, users } from "@/db/schema";
import { apiError, apiOk } from "@/lib/api-response";
import { audit } from "@/lib/audit";
import { getSession } from "@/lib/session";

async function requireAdminSession() {
  const session = await getSession();
  if (!session || session.user.role !== "admin") return null;
  return session;
}

/** Paginated user directory (no passwords, no message content). */
export async function GET(req: Request) {
  const session = await requireAdminSession();
  if (!session) return apiError("Administrators only.", 403);
  const url = new URL(req.url);
  const search = url.searchParams.get("search")?.trim() ?? "";
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get("pageSize") ?? 20)));

  const db = getDb();
  const filter = search
    ? or(
        ilike(users.email, `%${search}%`),
        ilike(users.name, `%${search}%`),
        ilike(users.shortId, `%${search}%`),
      )
    : undefined;
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      shortId: users.shortId,
      country: users.country,
      category: users.category,
      role: users.role,
      status: users.status,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(filter)
    .orderBy(desc(users.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  const [total] = await db.select({ n: count() }).from(users).where(filter);
  return apiOk({ items: rows, page, pageSize, total: total?.n ?? 0 });
}

const updateSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(["user", "provider", "admin"]).optional(),
  status: z.enum(["pending_verification", "active", "deactivated", "deleted"]).optional(),
  reason: z.string().max(500).optional(),
});

/** Change a user's role or status. Every change is audit-recorded. */
export async function PATCH(req: Request) {
  const session = await requireAdminSession();
  if (!session) return apiError("Administrators only.", 403);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body.");
  }
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return apiError("Invalid update.", 400);
  if (parsed.data.userId === session.user.id) {
    return apiError("You cannot change your own role or status.", 400);
  }

  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, parsed.data.userId)).limit(1);
  if (!user) return apiError("User not found.", 404);

  await db
    .update(users)
    .set({
      ...(parsed.data.role ? { role: parsed.data.role } : {}),
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
    })
    .where(eq(users.id, user.id));

  await audit({
    actorId: session.user.id,
    action: "admin.user.update",
    targetType: "user",
    targetId: user.id,
    metadata: {
      from: { role: user.role, status: user.status },
      to: { role: parsed.data.role ?? user.role, status: parsed.data.status ?? user.status },
      reason: parsed.data.reason,
    },
  });
  await db.insert(securityEvents).values({
    userId: user.id,
    type: "admin_update",
    detail: `Administrator updated account: role=${parsed.data.role ?? user.role}, status=${parsed.data.status ?? user.status}`,
  });

  return apiOk({ updated: true });
}
