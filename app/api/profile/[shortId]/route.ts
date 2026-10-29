import { getViewableProfile } from "@/lib/profile";
import { apiError, apiOk } from "@/lib/api-response";
import { getSession } from "@/lib/session";
import { shortIdSchema } from "@/lib/validation";
import { rateLimit } from "@/lib/rate-limit";

/** Permission-filtered profile lookup by short identifier. */
export async function GET(_req: Request, { params }: { params: Promise<{ shortId: string }> }) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const { shortId } = await params;
  const parsed = shortIdSchema.safeParse(shortId.toUpperCase());
  if (!parsed.success) return apiError("Invalid identifier.", 400);

  const rl = await rateLimit("profile-search", session.user.id, 30, "10 m");
  if (!rl.allowed) return apiError("Too many lookups. Please try again later.", 429);

  const profile = await getViewableProfile(session.user.id, parsed.data);
  if (!profile) return apiError("No user found with this identifier.", 404);
  return apiOk(profile);
}
