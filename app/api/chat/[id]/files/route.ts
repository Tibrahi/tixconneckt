import { and, desc, eq, isNotNull, notInArray } from "drizzle-orm";
import { getDb } from "@/db";
import { documents, messageHides, messages, users } from "@/db/schema";
import { apiError, apiOk } from "@/lib/api-response";
import { requireConversationMembership } from "@/lib/chat";
import { getSession } from "@/lib/session";

/** Shared files in this conversation: live messages with attachments. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const { id } = await params;
  const membership = await requireConversationMembership(id, session.user.id);
  if (!membership) return apiError("You are not a member of this conversation.", 403);

  const db = getDb();
  const hiddenIds = db
    .select({ id: messageHides.messageId })
    .from(messageHides)
    .where(eq(messageHides.userId, session.user.id));

  const rows = await db
    .select({
      messageId: messages.id,
      createdAt: messages.createdAt,
      senderName: users.name,
      documentId: documents.id,
      filename: documents.filename,
      mimeType: documents.mimeType,
      sizeBytes: documents.sizeBytes,
    })
    .from(messages)
    .innerJoin(documents, eq(documents.id, messages.attachmentId))
    .leftJoin(users, eq(users.id, messages.senderId))
    .where(
      and(
        eq(messages.conversationId, id),
        isNotNull(messages.attachmentId),
        notInArray(messages.id, hiddenIds),
      ),
    )
    .orderBy(desc(messages.createdAt))
    .limit(100);

  // Tombstoned messages keep their row but lose their attachment link.
  const visible = rows.filter((r) => r.documentId);
  return apiOk({ files: visible });
}
