import { and, desc, eq, inArray, notInArray, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  conversationMembers,
  conversations,
  messageHides,
  messages,
  users,
} from "@/db/schema";
import { apiError, apiOk } from "@/lib/api-response";
import { getSession } from "@/lib/session";

function likeEscape(q: string): string {
  return q.replace(/[%_\\]/g, "\\$&");
}

/**
 * Search my conversations: titles, member names, and message content.
 * Message results are restricted to conversations I belong to, excluding
 * my hidden messages and deleted content.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 200);
  if (q.length < 2) return apiOk({ conversations: [], messages: [] });

  const db = getDb();
  const mine = await db
    .select({ conversationId: conversationMembers.conversationId })
    .from(conversationMembers)
    .where(eq(conversationMembers.userId, session.user.id));
  if (mine.length === 0) return apiOk({ conversations: [], messages: [] });
  const ids = mine.map((m) => m.conversationId);
  const pattern = `%${likeEscape(q)}%`;

  const convMatches = await db
    .select({ id: conversations.id, type: conversations.type, title: conversations.title })
    .from(conversations)
    .where(
      and(
        inArray(conversations.id, ids),
        or(
          sql`${conversations.title} ILIKE ${pattern}`,
          sql`EXISTS (SELECT 1 FROM ${conversationMembers} cm INNER JOIN ${users} u ON u.id = cm.user_id WHERE cm.conversation_id = ${conversations.id} AND u.name ILIKE ${pattern})`,
        ),
      ),
    )
    .orderBy(desc(conversations.updatedAt))
    .limit(10);

  // Titles for member-name matches.
  const matchIds = convMatches.map((c) => c.id);
  const matchMembers =
    matchIds.length > 0
      ? await db
          .select({ conversationId: conversationMembers.conversationId, name: users.name, userId: users.id })
          .from(conversationMembers)
          .innerJoin(users, eq(users.id, conversationMembers.userId))
          .where(inArray(conversationMembers.conversationId, matchIds))
      : [];
  const othersByConv = new Map<string, string[]>();
  for (const m of matchMembers) {
    if (m.userId === session.user.id) continue;
    const list = othersByConv.get(m.conversationId) ?? [];
    list.push(m.name);
    othersByConv.set(m.conversationId, list);
  }

  const hiddenIds = db
    .select({ id: messageHides.messageId })
    .from(messageHides)
    .where(eq(messageHides.userId, session.user.id));
  const messageMatches = await db
    .select({
      id: messages.id,
      conversationId: messages.conversationId,
      body: messages.body,
      createdAt: messages.createdAt,
      senderName: users.name,
    })
    .from(messages)
    .leftJoin(users, eq(users.id, messages.senderId))
    .where(
      and(
        inArray(messages.conversationId, ids),
        sql`${messages.body} ILIKE ${pattern}`,
        notInArray(messages.id, hiddenIds),
      ),
    )
    .orderBy(desc(messages.createdAt))
    .limit(20);

  return apiOk({
    conversations: convMatches.map((c) => ({
      id: c.id,
      type: c.type,
      title: c.title ?? (othersByConv.get(c.id)?.slice(0, 3).join(", ") ?? "Conversation"),
    })),
    messages: messageMatches.map((m) => ({
      id: m.id,
      conversationId: m.conversationId,
      preview: m.body.slice(0, 140),
      senderName: m.senderName,
      createdAt: m.createdAt,
    })),
  });
}
