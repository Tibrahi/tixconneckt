import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { conversationMembers, conversations, groupMembers } from "@/db/schema";
import { apiError, apiOk } from "@/lib/api-response";
import { getSession } from "@/lib/session";
import { signRoomTicket } from "@/lib/tokens";

/**
 * Issue a per-room join ticket only after verifying the user is a member of
 * the requested conversation or group. Personal rooms are always allowed.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const url = new URL(req.url);
  const room = url.searchParams.get("room") ?? "";
  const userId = session.user.id;

  if (room === `user:${userId}`) {
    return apiOk({ ticket: await signRoomTicket(userId, room) });
  }

  const db = getDb();
  if (room.startsWith("conversation:")) {
    const conversationId = room.slice("conversation:".length);
    const membership = await db
      .select({ id: conversationMembers.id })
      .from(conversationMembers)
      .where(
        and(
          eq(conversationMembers.conversationId, conversationId),
          eq(conversationMembers.userId, userId),
        ),
      )
      .limit(1);
    if (membership.length === 0) return apiError("You are not a member of this conversation.", 403);
    const conv = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);
    if (conv.length === 0) return apiError("Conversation not found.", 404);
    return apiOk({ ticket: await signRoomTicket(userId, room) });
  }

  if (room.startsWith("group:")) {
    const groupId = room.slice("group:".length);
    const membership = await db
      .select({ id: groupMembers.id })
      .from(groupMembers)
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
      .limit(1);
    if (membership.length === 0) return apiError("You are not a member of this group.", 403);
    return apiOk({ ticket: await signRoomTicket(userId, room) });
  }

  return apiError("Unknown room.", 400);
}
