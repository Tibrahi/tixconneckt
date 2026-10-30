import { and, desc, eq, inArray, lt, ne, notInArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  conversationMembers,
  conversations,
  documents,
  messageHides,
  messageReads,
  messageReactions,
  messages,
  users,
} from "@/db/schema";
import { apiError, apiOk } from "@/lib/api-response";
import {
  DELETED_MESSAGE_BODY,
  messagePreview,
  normalizeSettings,
  requireConversationMembership,
  resolveReferenceSnapshot,
} from "@/lib/chat";
import { notify } from "@/lib/notify";
import { rateLimit } from "@/lib/rate-limit";
import { emitToRoom } from "@/lib/realtime";
import { getSession } from "@/lib/session";
import { chatMessageCreateSchema } from "@/lib/validation";

export interface ShapedReaction {
  emoji: string;
  count: number;
  names: string[];
  mine: boolean;
}

export interface ShapedMessage {
  id: string;
  kind: string;
  body: string;
  senderId: string | null;
  senderName: string | null;
  senderShortId: string | null;
  clientMessageId: string | null;
  createdAt: Date;
  editedAt: Date | null;
  deleted: boolean;
  reply: { id: string; body: string; senderName: string | null } | null;
  metadata: Record<string, unknown>;
  attachment: { id: string; filename: string; mimeType: string; sizeBytes: number } | null;
  reactions: ShapedReaction[];
  read: boolean | null;
  readCount: number | null;
}

/**
 * Thread history with replies, reactions, attachments, and genuine read
 * state. Hidden (delete-for-me) messages are excluded; deleted-for-everyone
 * messages render as tombstones without their content.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const { id } = await params;
  const membership = await requireConversationMembership(id, session.user.id);
  if (!membership) return apiError("You are not a member of this conversation.", 403);

  const url = new URL(req.url);
  const before = url.searchParams.get("before");
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 200);
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? 30)));

  const db = getDb();
  const [conv] = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
  if (!conv) return apiError("Conversation not found.", 404);

  const hiddenIds = db
    .select({ id: messageHides.messageId })
    .from(messageHides)
    .where(eq(messageHides.userId, session.user.id));

  const conditions = [
    eq(messages.conversationId, id),
    notInArray(messages.id, hiddenIds),
    ...(before ? [lt(messages.createdAt, new Date(before))] : []),
    ...(q ? [sql`${messages.body} ILIKE ${`%${q.replace(/[%_]/g, "\\$&")}%`}`] : []),
  ];

  const rows = await db
    .select({
      message: messages,
      senderName: users.name,
      senderShortId: users.shortId,
    })
    .from(messages)
    .leftJoin(users, eq(users.id, messages.senderId))
    .where(and(...conditions))
    .orderBy(desc(messages.createdAt))
    .limit(limit + 1);
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit).reverse();
  const pageIds = page.map((r) => r.message.id);

  // Replies: one self-join lookup for quoted previews.
  const replyIds = [...new Set(page.map((r) => r.message.replyToId).filter((v): v is string => !!v))];
  const replyRows =
    replyIds.length > 0
      ? await db
          .select({
            id: messages.id,
            body: messages.body,
            deletedAt: messages.deletedAt,
            senderName: users.name,
          })
          .from(messages)
          .leftJoin(users, eq(users.id, messages.senderId))
          .where(inArray(messages.id, replyIds))
      : [];
  const replyById = new Map(replyRows.map((r) => [r.id, r]));

  // Reactions with reactor names (capped per emoji).
  const reactionRows =
    pageIds.length > 0
      ? await db
          .select({ messageId: messageReactions.messageId, emoji: messageReactions.emoji, userId: messageReactions.userId, name: users.name })
          .from(messageReactions)
          .innerJoin(users, eq(users.id, messageReactions.userId))
          .where(inArray(messageReactions.messageId, pageIds))
      : [];
  const reactionsByMessage = new Map<string, ShapedReaction[]>();
  for (const row of reactionRows) {
    const list = reactionsByMessage.get(row.messageId) ?? [];
    const existing = list.find((r) => r.emoji === row.emoji);
    if (existing) {
      existing.count += 1;
      if (existing.names.length < 5) existing.names.push(row.name);
      if (row.userId === session.user.id) existing.mine = true;
    } else {
      list.push({ emoji: row.emoji, count: 1, names: [row.name], mine: row.userId === session.user.id });
    }
    reactionsByMessage.set(row.messageId, list);
  }

  // Attachments metadata.
  const attachmentIds = [...new Set(page.map((r) => r.message.attachmentId).filter((v): v is string => !!v))];
  const attachmentRows =
    attachmentIds.length > 0
      ? await db
          .select({ id: documents.id, filename: documents.filename, mimeType: documents.mimeType, sizeBytes: documents.sizeBytes })
          .from(documents)
          .where(inArray(documents.id, attachmentIds))
      : [];
  const attachmentById = new Map(attachmentRows.map((d) => [d.id, d]));

  // Genuine read state: peer read in direct chats, counts in groups.
  const members = await db
    .select({
      userId: conversationMembers.userId,
      role: conversationMembers.role,
      name: users.name,
      shortId: users.shortId,
    })
    .from(conversationMembers)
    .innerJoin(users, eq(users.id, conversationMembers.userId))
    .where(eq(conversationMembers.conversationId, id));
  const [me] = await db
    .select({ lastReadAt: conversationMembers.lastReadAt })
    .from(conversationMembers)
    .where(
      and(
        eq(conversationMembers.conversationId, id),
        eq(conversationMembers.userId, session.user.id),
      ),
    )
    .limit(1);
  const peerIds = members.map((m) => m.userId).filter((v) => v !== session.user.id);
  const myMessageIds = page.filter((r) => r.message.senderId === session.user.id).map((r) => r.message.id);
  const readByMessage = new Map<string, string[]>();
  if (myMessageIds.length > 0 && peerIds.length > 0) {
    const readRows = await db
      .select({ messageId: messageReads.messageId, userId: messageReads.userId })
      .from(messageReads)
      .where(and(inArray(messageReads.messageId, myMessageIds), inArray(messageReads.userId, peerIds)));
    for (const row of readRows) {
      const list = readByMessage.get(row.messageId) ?? [];
      list.push(row.userId);
      readByMessage.set(row.messageId, list);
    }
  }
  const isDirectPeer = conv.type === "direct" && peerIds.length === 1;

  const shaped: ShapedMessage[] = page.map((r) => {
    const m = r.message;
    const deleted = m.deletedAt !== null;
    const reply = m.replyToId ? replyById.get(m.replyToId) : undefined;
    const readers = readByMessage.get(m.id) ?? [];
    return {
      id: m.id,
      kind: m.kind,
      body: deleted ? DELETED_MESSAGE_BODY : m.body,
      senderId: m.senderId,
      senderName: m.kind === "system" ? null : (r.senderName ?? null),
      senderShortId: m.kind === "system" ? null : (r.senderShortId ?? null),
      clientMessageId: m.clientMessageId,
      createdAt: m.createdAt,
      editedAt: m.editedAt,
      deleted,
      reply: reply
        ? {
            id: reply.id,
            body: reply.deletedAt ? DELETED_MESSAGE_BODY : reply.body.slice(0, 200),
            senderName: reply.senderName ?? null,
          }
        : null,
      metadata: deleted ? {} : ((m.metadata ?? {}) as Record<string, unknown>),
      attachment: deleted ? null : m.attachmentId ? (attachmentById.get(m.attachmentId) ?? null) : null,
      reactions: reactionsByMessage.get(m.id) ?? [],
      read: m.senderId === session.user.id && m.kind === "user" ? (isDirectPeer ? readers.length > 0 : null) : null,
      readCount:
        m.senderId === session.user.id && m.kind === "user"
          ? isDirectPeer
            ? null
            : readers.length
          : null,
    };
  });

  return apiOk({
    conversation: { id: conv.id, type: conv.type, title: conv.title, groupId: conv.groupId },
    members,
    myRole: membership.role,
    mySettings: membership.settings,
    myLastReadAt: me?.lastReadAt ?? null,
    messages: shaped,
    hasMore: q ? false : hasMore,
    nextBefore: shaped.length > 0 ? shaped[0].createdAt : null,
  });
}

/**
 * Send a message: validate reply/attachment/reference, persist first, then
 * fan out realtime + notifications (muted members are skipped). Retries
 * with the same clientMessageId return the existing message.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const rl = await rateLimit("message-send", session.user.id, 60, "1 m");
  if (!rl.allowed) return apiError("You are sending messages too quickly. Slow down a moment.", 429);

  const { id } = await params;
  const membership = await requireConversationMembership(id, session.user.id);
  if (!membership) return apiError("You are not a member of this conversation.", 403);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body.");
  }
  // Backwards-compatible with the legacy { body, clientMessageId } shape.
  const parsed = chatMessageCreateSchema.safeParse(body);
  if (!parsed.success) return apiError("Message is empty.", 400);
  const input = parsed.data;
  const text = input.body.trim();

  const db = getDb();
  // Idempotent retry: return the existing message for this client id.
  const [dup] = await db
    .select({ id: messages.id })
    .from(messages)
    .where(and(eq(messages.conversationId, id), eq(messages.clientMessageId, input.clientMessageId)))
    .limit(1);
  if (dup) return apiOk({ id: dup.id, duplicate: true });

  if (!text && !input.attachmentId && !input.reference && !input.analysis) {
    return apiError("Write a message, attach a file, or share a reference.", 400);
  }

  if (input.replyToId) {
    const [target] = await db
      .select({ id: messages.id })
      .from(messages)
      .where(and(eq(messages.id, input.replyToId), eq(messages.conversationId, id)))
      .limit(1);
    if (!target) return apiError("The message you are replying to was not found.", 404);
  }

  if (input.attachmentId) {
    const [doc] = await db
      .select({ id: documents.id, ownerId: documents.ownerId, module: documents.module })
      .from(documents)
      .where(eq(documents.id, input.attachmentId))
      .limit(1);
    if (!doc || doc.ownerId !== session.user.id) {
      return apiError("Attachment not found.", 404);
    }
    if (doc.module !== "chat") {
      return apiError("Only files uploaded for chat can be attached here.", 400);
    }
  }

  let metadata: Record<string, unknown> = {};
  if (input.reference) {
    const snapshot = await resolveReferenceSnapshot(input.reference.type, input.reference.id);
    if (!snapshot) return apiError("The shared item no longer exists.", 404);
    metadata = { reference: snapshot };
  }
  if (input.analysis) {
    const { validateFieldValue } = await import("@/lib/flexible-records");
    const keys = Object.keys(input.analysis);
    if (keys.length > 30) return apiError("The shared analysis is too large.", 400);
    const problem = validateFieldValue(input.analysis, 0);
    if (problem) return apiError("The shared analysis is invalid.", 400);
    metadata = { ...metadata, analysis: input.analysis };
  }

  const inserted = await db
    .insert(messages)
    .values({
      conversationId: id,
      senderId: session.user.id,
      kind: "user",
      body: text.slice(0, 8000),
      clientMessageId: input.clientMessageId,
      attachmentId: input.attachmentId,
      replyToId: input.replyToId,
      metadata,
    })
    .returning({ id: messages.id, createdAt: messages.createdAt });
  const message = inserted[0];

  await db.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, id));

  // Sender implicitly reads their own message.
  await db
    .insert(messageReads)
    .values({ messageId: message.id, userId: session.user.id })
    .onConflictDoNothing();

  await emitToRoom(`conversation:${id}`, "message:new", {
    id: message.id,
    conversationId: id,
    kind: "user",
    senderId: session.user.id,
    senderName: session.user.name,
    body: text.slice(0, 8000),
    replyToId: input.replyToId ?? null,
    attachmentId: input.attachmentId ?? null,
    metadata,
    createdAt: message.createdAt,
  });

  // Notify other members unless they muted this conversation.
  const members = await db
    .select({
      userId: conversationMembers.userId,
      settings: conversationMembers.settings,
      email: users.email,
      name: users.name,
    })
    .from(conversationMembers)
    .innerJoin(users, eq(users.id, conversationMembers.userId))
    .where(eq(conversationMembers.conversationId, id));
  for (const m of members) {
    if (m.userId === session.user.id) continue;
    if (normalizeSettings(m.settings).muted) continue;
    await notify({
      userId: m.userId,
      type: "chat",
      title: `New message from ${session.user.name}`,
      body: messagePreview(text, { hasAttachment: !!input.attachmentId }),
      resourceType: "conversation",
      resourceId: id,
      emailTo: m.email,
    });
  }

  return apiOk({ id: message.id, createdAt: message.createdAt }, 201);
}

/** Mark my unread messages in this conversation as read; announce it live. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const { id } = await params;
  const membership = await requireConversationMembership(id, session.user.id);
  if (!membership) return apiError("You are not a member of this conversation.", 403);

  const db = getDb();
  const readIds = db
    .select({ id: messageReads.messageId })
    .from(messageReads)
    .where(eq(messageReads.userId, session.user.id));
  const unread = await db
    .select({ id: messages.id })
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, id),
        ne(messages.senderId, session.user.id),
        notInArray(messages.id, readIds),
      ),
    )
    .orderBy(desc(messages.createdAt))
    .limit(1000);
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
      and(eq(conversationMembers.conversationId, id), eq(conversationMembers.userId, session.user.id)),
    );
  if (unread.length > 0) {
    await emitToRoom(`conversation:${id}`, "message:read", {
      conversationId: id,
      userId: session.user.id,
      count: unread.length,
    });
  }
  return apiOk({ read: true, count: unread.length });
}
