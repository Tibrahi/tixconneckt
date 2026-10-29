import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { profiles, users } from "@/db/schema";
import { apiError, apiOk, clientIp } from "@/lib/api-response";
import { audit } from "@/lib/audit";
import { getOwnProfile } from "@/lib/profile";
import { getSession } from "@/lib/session";
import { profileUpdateSchema } from "@/lib/validation";

export async function GET() {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const profile = await getOwnProfile(session.user.id);
  if (!profile) return apiError("Profile not found.", 404);
  return apiOk(profile);
}

/** Update the owner's profile. AI proposals are applied only after user review. */
export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body.");
  }
  const parsed = profileUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("Please correct the highlighted fields.", 400);
  }
  const input = parsed.data;
  const db = getDb();

  if (input.name || input.phone || input.country) {
    await db
      .update(users)
      .set({
        ...(input.name ? { name: input.name } : {}),
        ...(input.phone ? { phone: input.phone } : {}),
        ...(input.country ? { country: input.country } : {}),
      })
      .where(eq(users.id, session.user.id));
  }

  await db
    .insert(profiles)
    .values({
      userId: session.user.id,
      educationLevel: input.educationLevel,
      objectives: input.objectives,
      major: input.major,
      skills: input.skills ?? [],
      strengths: input.strengths ?? [],
      fields: input.fields ?? [],
      bio: input.bio,
      location: input.location,
      contactVisibility: input.contactVisibility ?? "connections",
      financialVisibility: input.financialVisibility ?? "private",
    })
    .onConflictDoUpdate({
      target: profiles.userId,
      set: {
        ...(input.educationLevel !== undefined ? { educationLevel: input.educationLevel } : {}),
        ...(input.objectives !== undefined ? { objectives: input.objectives } : {}),
        ...(input.major !== undefined ? { major: input.major } : {}),
        ...(input.skills !== undefined ? { skills: input.skills } : {}),
        ...(input.strengths !== undefined ? { strengths: input.strengths } : {}),
        ...(input.fields !== undefined ? { fields: input.fields } : {}),
        ...(input.bio !== undefined ? { bio: input.bio } : {}),
        ...(input.location !== undefined ? { location: input.location } : {}),
        ...(input.contactVisibility ? { contactVisibility: input.contactVisibility } : {}),
        ...(input.financialVisibility ? { financialVisibility: input.financialVisibility } : {}),
      },
    });

  await audit({
    actorId: session.user.id,
    action: "profile.update",
    targetType: "user",
    targetId: session.user.id,
    ipAddress: clientIp(req),
  });

  const profile = await getOwnProfile(session.user.id);
  return apiOk(profile);
}
