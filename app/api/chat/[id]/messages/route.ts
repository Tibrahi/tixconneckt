import { and, asc, desc, eq, lt } from "drizzle-orm";
import { getDb } from "@/db";
import {
  conversationMembers,
  conversations,
  messageReads,
  messages,
  users,
} from "@/db/schema";
import { apiError, apiOk } from "@/lib/api-response";
import { notify } from "@/lib/notify";
import { emitToRoom } from "@/lib/realtime";
import { getSession } from "@/lib/session";
import { messageSendSchema } from "@/lib/validation";

async function requireMembership(conversationId: string, userId: string) {
  const db = getDb();
  const rows = await db
    .select({ id: conversationMembers.id })
    .from(conversationMembers)
    .where(
      and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, userId),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/** Paginated history (newest page first; `before` cursor for older pages). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const { id } = await params;
  if (!(await requireMembership(id, session.user.id))) {
    return apiError("You are not a member of this conversation.", 403);
  }
  const url = new URL(req.url);
  const before = url.searchParams.get("before");
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? 30)));

  const db = getDb();
  const [conv] = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
  if (!conv) return apiError("Conversation not found.", 404);

  const rows = await db
    .select({
      id: messages.id,
      body: messages.body,
      senderId: messages.senderId,
      senderName: users.name,
      senderShortId: users.shortId,
      clientMessageId: messages.clientMessageId,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .innerJoin(users, eq(users.id, messages.senderId))
    .where(
      and(eq(messages.conversationId, id), before ? lt(messages.createdAt, new Date(before)) : undefined),
    )
    .orderBy(desc(messages.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit).reverse();

  const members = await db
    .select({ userId: conversationMembers.userId, name: users.name, shortId: users.shortId })
    .from(conversationMembers)
    .innerJoin(users, eq(users.id, conversationMembers.userId))
    .where(eq(conversationMembers.conversationId, id));

  return apiOk({
    conversation: { id: conv.id, type: conv.type, title: conv.title, groupId: conv.groupId },
    members,
    messages: page,
    hasMore,
    nextBefore: page.length > 0 ? page[0].createdAt : null,
  });
}

/**
 * Send a message: persist first, then fan out realtime + notifications.
 * clientMessageId makes retries safe (no duplicates).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const { id } = await params;
  if (!(await requireMembership(id, session.user.id))) {
    return apiError("You are not a member of this conversation.", 403);
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body.");
  }
  const parsed = messageSendSchema.safeParse({ ...(body as object), conversationId: id });
  if (!parsed.success) return apiError("Message is empty.", 400);

  const db = getDb();
  // Idempotent retry: return the existing message for this client id.
  const [dup] = await db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, id),
        eq(messages.clientMessageId, parsed.data.clientMessageId),
      ),
    )
    .limit(1);
  if (dup) return apiOk({ id: dup.id, duplicate: true });

  const inserted = await db
    .insert(messages)
    .values({
      conversationId: id,
      senderId: session.user.id,
      body: parsed.data.body.slice(0, 8000),
      clientMessageId: parsed.data.clientMessageId,
    })
    .returning({ id: messages.id, createdAt: messages.createdAt });
  const message = inserted[0];

  await db
    .update(conversations)
    .set({ updatedAt: new Date() })
    .where(eq(conversations.id, id));

  // Sender implicitly reads their own message.
  await db.insert(messageReads).values({ messageId: message.id, userId: session.user.id }).onConflictDoNothing();

  await emitToRoom(`conversation:${id}`, "message:new", {
    id: message.id,
    conversationId: id,
    senderId: session.user.id,
    senderName: session.user.name,
    body: parsed.data.body.slice(0, 8000),
    createdAt: message.createdAt,
  });

  // Notify other members.
  const members = await db
    .select({ userId: conversationMembers.userId, email: users.email, name: users.name })
    .from(conversationMembers)
    .innerJoin(users, eq(users.id, conversationMembers.userId))
    .where(eq(conversationMembers.conversationId, id));
  for (const m of members) {
    if (m.userId === session.user.id) continue;
    await notify({
      userId: m.userId,
      type: "chat",
      title: `New message from ${session.user.name}`,
      body: parsed.data.body.slice(0, 200),
      resourceType: "conversation",
      resourceId: id,
      emailTo: m.email,
    });
  }

  return apiOk({ id: message.id, createdAt: message.createdAt }, 201);
}

/** Mark a conversation as read up to now. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const { id } = await params;
  if (!(await requireMembership(id, session.user.id))) {
    return apiError("You are not a member of this conversation.", 403);
  }
  const db = getDb();
  const unread = await db
    .select({ id: messages.id })
    .from(messages)
    .where(eq(messages.conversationId, id))
    .orderBy(asc(messages.createdAt))
    .limit(500);
  for (const m of unread) {
    await db
      .insert(messageReads)
      .values({ messageId: m.id, userId: session.user.id })
      .onConflictDoNothing();
  }
  await db
    .update(conversationMembers)
    .set({ lastReadAt: new Date() })
    .where(
      and(
        eq(conversationMembers.conversationId, id),
        eq(conversationMembers.userId, session.user.id),
      ),
    );
  return apiOk({ read: true });
}
