import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { messageHides, messages } from "@/db/schema";
import { apiError, apiOk } from "@/lib/api-response";
import { DELETED_MESSAGE_BODY, requireConversationMembership } from "@/lib/chat";
import { emitToRoom } from "@/lib/realtime";
import { getSession } from "@/lib/session";

type RouteContext = { params: Promise<{ id: string; messageId: string }> };

async function loadMessage(conversationId: string, messageId: string) {
  const db = getDb();
  const [message] = await db
    .select()
    .from(messages)
    .where(and(eq(messages.id, messageId), eq(messages.conversationId, conversationId)))
    .limit(1);
  return message ?? null;
}

/** Fetch one message (reply navigation, share previews). Tombstones stay tombstones. */
export async function GET(_req: Request, { params }: RouteContext) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const { id, messageId } = await params;
  const membership = await requireConversationMembership(id, session.user.id);
  if (!membership) return apiError("You are not a member of this conversation.", 403);

  const message = await loadMessage(id, messageId);
  if (!message) return apiError("Message not found.", 404);
  const deleted = message.deletedAt !== null;
  return apiOk({
    id: message.id,
    kind: message.kind,
    body: deleted ? DELETED_MESSAGE_BODY : message.body,
    senderId: message.senderId,
    createdAt: message.createdAt,
    editedAt: message.editedAt,
    deleted,
    replyToId: message.replyToId,
    metadata: deleted ? {} : message.metadata,
  });
}

const editSchema = z.object({ body: z.string().trim().min(1).max(8000) });

/** Edit my own message. The edited indicator is set; the change is emitted live. */
export async function PATCH(req: Request, { params }: RouteContext) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const { id, messageId } = await params;
  const membership = await requireConversationMembership(id, session.user.id);
  if (!membership) return apiError("You are not a member of this conversation.", 403);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body.");
  }
  const parsed = editSchema.safeParse(body);
  if (!parsed.success) return apiError("Message text cannot be empty.", 400);

  const message = await loadMessage(id, messageId);
  if (!message) return apiError("Message not found.", 404);
  if (message.kind !== "user" || message.senderId !== session.user.id) {
    return apiError("You can only edit your own messages.", 403);
  }
  if (message.deletedAt) return apiError("Deleted messages cannot be edited.", 400);

  const db = getDb();
  await db
    .update(messages)
    .set({ body: parsed.data.body.slice(0, 8000), editedAt: new Date() })
    .where(eq(messages.id, message.id));
  await emitToRoom(`conversation:${id}`, "message:edited", {
    id: message.id,
    conversationId: id,
    body: parsed.data.body.slice(0, 8000),
  });
  return apiOk({ edited: true });
}

const deleteSchema = z.object({ mode: z.enum(["me", "everyone"]) });

/**
 * Delete for me (a personal hide — nobody else is affected) or for everyone
 * (sender or conversation admin; the content becomes a tombstone).
 */
export async function DELETE(req: Request, { params }: RouteContext) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const { id, messageId } = await params;
  const membership = await requireConversationMembership(id, session.user.id);
  if (!membership) return apiError("You are not a member of this conversation.", 403);

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) return apiError("Choose whether to delete for you or for everyone.", 400);

  const message = await loadMessage(id, messageId);
  if (!message) return apiError("Message not found.", 404);

  const db = getDb();
  if (parsed.data.mode === "me") {
    await db
      .insert(messageHides)
      .values({ messageId: message.id, userId: session.user.id })
      .onConflictDoNothing();
    return apiOk({ deleted: "me" });
  }

  const isSender = message.senderId === session.user.id;
  if (!isSender && membership.role !== "admin") {
    return apiError("Only the sender or a conversation admin can delete for everyone.", 403);
  }
  if (message.kind !== "user") {
    return apiError("System messages cannot be deleted for everyone.", 400);
  }
  await db
    .update(messages)
    .set({ body: DELETED_MESSAGE_BODY, deletedAt: new Date(), deletedBy: session.user.id, metadata: {} })
    .where(eq(messages.id, message.id));
  await emitToRoom(`conversation:${id}`, "message:deleted", {
    id: message.id,
    conversationId: id,
  });
  return apiOk({ deleted: "everyone" });
}
