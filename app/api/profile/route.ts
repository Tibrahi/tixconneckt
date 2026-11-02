import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { profiles, users } from "@/db/schema";
import { apiError, apiOk, clientIp } from "@/lib/api-response";
import { audit } from "@/lib/audit";
import { getOwnProfile } from "@/lib/profile";
import { getSession } from "@/lib/session";
import { profileUpdateSchema } from "@/lib/validation";
import { findCountry } from "@/lib/countries";
import { normalizePhone } from "@/lib/phone";

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
    const details: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".") || "form";
      (details[key] ??= []).push(issue.message);
    }
    return apiError("Please correct the highlighted fields.", 400, details);
  }
  const input = parsed.data;
  const db = getDb();

  let normalizedPhone: string | null | undefined;
  let selectedCallingCode: string | undefined;
  if (input.phone !== undefined) {
    if (!input.phone) normalizedPhone = null;
    else {
      const current = await getOwnProfile(session.user.id);
      const country = findCountry(input.country || current?.country || "");
      selectedCallingCode = country?.callingCode;
      const phone = country ? normalizePhone(input.phone, country.cca2) : null;
      if (!phone?.valid) {
        return apiError("The phone number is not valid for the selected country.", 400, {
          phone: ["Enter a valid local number for the selected country."],
        });
      }
      normalizedPhone = phone.e164;
    }
  }

  if (input.providerKind !== undefined && input.providerKind !== null && session.user.role !== "provider") {
    return apiError("Only provider accounts set a provider category.", 403);
  }
  if (input.providerKind !== undefined && session.user.role === "provider" && session.user.providerKind && input.providerKind !== session.user.providerKind) {
    return apiError("Provider service type cannot be changed after onboarding. Contact support for a reviewed update.", 403);
  }

  // ISO codes normalize to uppercase; legacy calling codes (+250) pass through.
  const normalizedCountryCode =
    input.countryCode === undefined || input.countryCode === ""
      ? input.countryCode === ""
        ? null
        : undefined
      : input.countryCode.startsWith("+")
        ? input.countryCode
        : input.countryCode.toUpperCase();

  await db.transaction(async (tx) => {
    if (input.name || input.phone !== undefined || input.country !== undefined || normalizedCountryCode !== undefined || input.providerKind !== undefined) {
      await tx
        .update(users)
        .set({
          ...(input.name ? { name: input.name } : {}),
          ...(normalizedPhone !== undefined ? { phone: normalizedPhone } : {}),
          ...(input.country !== undefined ? { country: input.country || null } : {}),
          ...(selectedCallingCode ? { countryCode: selectedCallingCode } : normalizedCountryCode !== undefined ? { countryCode: normalizedCountryCode } : {}),
          ...(input.providerKind && session.user.role === "provider" && !session.user.providerKind ? { providerKind: input.providerKind } : {}),
        })
        .where(eq(users.id, session.user.id));
    }

    await tx
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
      githubUrl: input.githubUrl || null,
        contactVisibility: input.contactVisibility ?? "connections",
        financialVisibility: input.financialVisibility ?? "private",
        profileVisibility: input.profileVisibility ?? "public",
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
        ...(input.githubUrl !== undefined ? { githubUrl: input.githubUrl || null } : {}),
        ...(input.contactVisibility ? { contactVisibility: input.contactVisibility } : {}),
        ...(input.financialVisibility ? { financialVisibility: input.financialVisibility } : {}),
        ...(input.profileVisibility ? { profileVisibility: input.profileVisibility } : {}),
      },
      });
  });

  await audit({
    actorId: session.user.id,
    action: "profile.update",
    targetType: "user",
    targetId: session.user.id,
    ipAddress: clientIp(req),
  });
  if (input.providerKind && session.user.role === "provider" && !session.user.providerKind) {
    await audit({
      actorId: session.user.id,
      action: "provider.service_kind.set",
      targetType: "user",
      targetId: session.user.id,
      ipAddress: clientIp(req),
      metadata: { providerKind: input.providerKind },
    });
  }

  const profile = await getOwnProfile(session.user.id);
  return apiOk(profile);
}
