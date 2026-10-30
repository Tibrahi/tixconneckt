import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { conversationMembers, documents, messages } from "@/db/schema";
import { apiError, apiOk } from "@/lib/api-response";
import { getSession } from "@/lib/session";
import { getPrivateObjectUrl } from "@/lib/storage";

/**
 * Mint a short-lived, authorized download URL for a private document.
 * Owners and admins always pass; chat attachments additionally pass for
 * members of a conversation whose live messages reference the file.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const { id } = await params;
  const db = getDb();
  const [doc] = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
  if (!doc) return apiError("Document not found.", 404);
  if (doc.ownerId !== session.user.id && session.user.role !== "admin") {
    if (doc.module !== "chat") {
      return apiError("You don't have access to this document.", 403);
    }
    // Chat attachment: member of a conversation referencing it in a live message.
    const refs = await db
      .select({ conversationId: messages.conversationId })
      .from(messages)
      .where(and(eq(messages.attachmentId, doc.id)))
      .limit(25);
    let allowed = false;
    for (const ref of refs) {
      const [member] = await db
        .select({ id: conversationMembers.id })
        .from(conversationMembers)
        .where(
          and(
            eq(conversationMembers.conversationId, ref.conversationId),
            eq(conversationMembers.userId, session.user.id),
          ),
        )
        .limit(1);
      if (member) {
        allowed = true;
        break;
      }
    }
    if (!allowed) return apiError("You don't have access to this document.", 403);
  }
  const url = await getPrivateObjectUrl(doc.storageKey, 300);
  if (!url) return apiError("Document storage is unavailable.", 502);
  return apiOk({
    url,
    filename: doc.filename,
    mimeType: doc.mimeType,
    expiresInSeconds: 300,
  });
}
