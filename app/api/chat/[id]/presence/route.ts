import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { conversationMembers } from "@/db/schema";
import { apiError, apiOk } from "@/lib/api-response";
import { requireConversationMembership } from "@/lib/chat";
import { fetchPresence } from "@/lib/realtime";
import { getSession } from "@/lib/session";

/**
 * Genuine presence for conversation members: backed by live socket
 * connections on the realtime server. Only co-members may query, and an
 * unreachable realtime server yields `available: false` — never a guess.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const { id } = await params;
  const membership = await requireConversationMembership(id, session.user.id);
  if (!membership) return apiError("You are not a member of this conversation.", 403);

  const db = getDb();
  const members = await db
    .select({ userId: conversationMembers.userId })
    .from(conversationMembers)
    .where(eq(conversationMembers.conversationId, id));
  const ids = members.map((m) => m.userId).filter((v) => v !== session.user.id);
  const online = await fetchPresence(ids);
  if (online === null) return apiOk({ available: false, online: {} });
  const map: Record<string, boolean> = {};
  for (const uid of ids) map[uid] = online.includes(uid);
  return apiOk({ available: true, online: map });
}
