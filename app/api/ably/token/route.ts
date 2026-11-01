import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { conversationMembers, groupMembers } from "@/db/schema";
import { createTokenRequest } from "@/lib/ably/server";
import { apiError, apiOk } from "@/lib/api-response";
import { getSession } from "@/lib/session";

/**
 * Issue a short-lived Ably token request for the current session.
 * Capability is scoped to the user's own personal channel, the global
 * presence channel, and exactly the conversations/groups they belong to.
 * Returns 503 when ABLY_API_KEY is not configured — clients then run on
 * API polling and must say so honestly in the UI.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  if (!process.env.ABLY_API_KEY) {
    return apiError("Realtime messaging is not configured on this deployment.", 503);
  }
  const db = getDb();
  const userId = session.user.id;
  const [convs, groups] = await Promise.all([
    db
      .select({ conversationId: conversationMembers.conversationId })
      .from(conversationMembers)
      .where(eq(conversationMembers.userId, userId))
      .limit(500),
    db
      .select({ groupId: groupMembers.groupId })
      .from(groupMembers)
      .where(and(eq(groupMembers.userId, userId), eq(groupMembers.status, "active")))
      .limit(500),
  ]);
  const tokenRequest = await createTokenRequest({
    userId,
    conversationIds: convs.map((c) => c.conversationId),
    groupIds: groups.map((g) => g.groupId),
  });
  if (!tokenRequest) return apiError("We couldn't start realtime messaging. Please try again.", 502);
  return apiOk({ tokenRequest });
}
