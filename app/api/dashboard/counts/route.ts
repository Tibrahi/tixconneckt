import { and, count, eq, isNull, ne, notInArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
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
  const session = await getSession();
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
  const [unreadChat] = await db
    .select({ n: count() })
    .from(messages)
    .where(
      and(
        sql`${messages.conversationId} IN (${myConversations})`,
        ne(messages.senderId, userId),
        notInArray(messages.id, readMessageIds),
      ),
    );

  const [unreadNotifications] = await db
    .select({ n: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));

  const [pendingConnections] = await db
    .select({ n: count() })
    .from(connections)
    .where(and(eq(connections.addresseeId, userId), eq(connections.status, "pending")));

  return apiOk({
    chat: unreadChat?.n ?? 0,
    notifications: unreadNotifications?.n ?? 0,
    conneckt: pendingConnections?.n ?? 0,
  });
}
