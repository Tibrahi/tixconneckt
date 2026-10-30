import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { conversationMembers, conversations, documents, messages, users } from "@/db/schema";
import { apiError, apiOk } from "@/lib/api-response";
import { messagePreview, normalizeSettings, requireConversationMembership } from "@/lib/chat";
import { notify } from "@/lib/notify";
import { rateLimit } from "@/lib/rate-limit";
import { emitToRoom } from "@/lib/realtime";
import { getSession } from "@/lib/session";
import { chatForwardSchema } from "@/lib/validation";

/**
 * Forward a message to another conversation I belong to. The copy is a new
 * message carrying its origin, clearly identified as forwarded. Attachments
 * travel only when I own the file; references are re-snapshotted.
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
  const parsed = chatForwardSchema.safeParse(body);
  if (!parsed.success) return apiError("Invalid forward request.", 400);
  if (parsed.data.toConversationId === id) {
    return apiError("Choose a different conversation to forward to.", 400);
  }

  const target = await requireConversationMembership(parsed.data.toConversationId, session.user.id);
  if (!target) return apiError("You are not a member of the destination conversation.", 403);

  const db = getDb();
  const [source] = await db
    .select()
    .from(messages)
    .where(and(eq(messages.id, parsed.data.messageId), eq(messages.conversationId, id)))
    .limit(1);
  if (!source) return apiError("Message not found.", 404);
  if (source.deletedAt || source.kind !== "user") {
    return apiError("Only live messages can be forwarded.", 400);
  }

  let attachmentId: string | undefined;
  if (source.attachmentId) {
    const [doc] = await db
      .select({ id: documents.id, ownerId: documents.ownerId })
      .from(documents)
      .where(eq(documents.id, source.attachmentId))
      .limit(1);
    // Files travel only with their owner's forward; otherwise text goes alone.
    if (doc && doc.ownerId === session.user.id) attachmentId = doc.id;
  }

  const [inserted] = await db
    .insert(messages)
    .values({
      conversationId: target.conversation.id,
      senderId: session.user.id,
      kind: "user",
      body: source.body.slice(0, 8000),
      clientMessageId: `forward:${source.id}:${Date.now()}`,
      attachmentId,
      metadata: {
        forwardedFrom: { conversationId: id, messageId: source.id },
      },
    })
    .returning({ id: messages.id, createdAt: messages.createdAt });

  await db
    .update(conversations)
    .set({ updatedAt: new Date() })
    .where(eq(conversations.id, target.conversation.id));

  await emitToRoom(`conversation:${target.conversation.id}`, "message:new", {
    id: inserted.id,
    conversationId: target.conversation.id,
    kind: "user",
    senderId: session.user.id,
    senderName: session.user.name,
    body: source.body.slice(0, 8000),
    metadata: { forwardedFrom: { conversationId: id, messageId: source.id } },
    createdAt: inserted.createdAt,
  });

  const members = await db
    .select({ userId: conversationMembers.userId, settings: conversationMembers.settings, email: users.email })
    .from(conversationMembers)
    .innerJoin(users, eq(users.id, conversationMembers.userId))
    .where(eq(conversationMembers.conversationId, target.conversation.id));
  for (const m of members) {
    if (m.userId === session.user.id) continue;
    if (normalizeSettings(m.settings).muted) continue;
    await notify({
      userId: m.userId,
      type: "chat",
      title: `New message from ${session.user.name}`,
      body: messagePreview(source.body, { hasAttachment: !!attachmentId }),
      resourceType: "conversation",
      resourceId: target.conversation.id,
      emailTo: m.email,
    });
  }

  return apiOk({ id: inserted.id, conversationId: target.conversation.id }, 201);
}
