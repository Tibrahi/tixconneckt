import { and, count, eq, isNull, ne, notInArray, sql } from "drizzle-orm";
import { getDb, isDatabaseUnavailable } from "@/db";
import {
  connections,
  conversationMembers,
  messageReads,
  messages,
  notifications,
} from "@/db/schema";
import { apiError, apiOk } from "@/lib/api-response";
import { getSession } from "@/lib/session";

/** Real unread counts for Chat, Notifications, and pending Conneckt requests. */
export async function GET() {
  let session;
  try {
    session = await getSession({ throwOnDatabaseUnavailable: true });
  } catch (error) {
    if (isDatabaseUnavailable(error)) return apiError("Dashboard data is temporarily unavailable. Please retry in a moment.", 503);
    throw error;
  }
  if (!session) return apiError("Sign in required.", 401);
  const userId = session.user.id;
  const db = getDb();

  // Unread chat = messages in my conversations, not sent by me, not read by me.
  const myConversations = db
    .select({ id: conversationMembers.conversationId })
    .from(conversationMembers)
    .where(eq(conversationMembers.userId, userId));
  const readMessageIds = db
    .select({ id: messageReads.messageId })
    .from(messageReads)
    .where(eq(messageReads.userId, userId));
  try {
    const [[unreadChat], [unreadNotifications], [pendingConnections]] =
      await Promise.all([
      db
        .select({ n: count() })
        .from(messages)
        .where(
          and(
            sql`${messages.conversationId} IN (${myConversations})`,
            ne(messages.senderId, userId),
            notInArray(messages.id, readMessageIds),
          ),
        ),
      db
        .select({ n: count() })
        .from(notifications)
        .where(
          and(eq(notifications.userId, userId), isNull(notifications.readAt)),
        ),
      db
        .select({ n: count() })
        .from(connections)
        .where(
          and(
            eq(connections.addresseeId, userId),
            eq(connections.status, "pending"),
          ),
        ),
      ]);

  return apiOk({
    chat: unreadChat?.n ?? 0,
    notifications: unreadNotifications?.n ?? 0,
    conneckt: pendingConnections?.n ?? 0,
  });
  } catch (error) {
    if (isDatabaseUnavailable(error)) return apiError("Dashboard data is temporarily unavailable. Please retry in a moment.", 503);
    throw error;
  }
}
