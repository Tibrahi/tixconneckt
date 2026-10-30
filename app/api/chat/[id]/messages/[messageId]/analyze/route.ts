import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { documents, messages, parsingJobs } from "@/db/schema";
import { transcribeWithMuseVoice } from "@/lib/ai";
import { aiVoiceConfigured } from "@/lib/config";
import { apiError, apiOk } from "@/lib/api-response";
import { requireConversationMembership } from "@/lib/chat";
import { rateLimit } from "@/lib/rate-limit";
import { getSession } from "@/lib/session";
import { getPrivateObjectUrl } from "@/lib/storage";

type RouteContext = { params: Promise<{ id: string; messageId: string }> };

type AttachmentDoc = typeof documents.$inferSelect;

async function loadAttachment(
  conversationId: string,
  messageId: string,
  userId: string,
): Promise<{ error: string; status: number } | { doc: AttachmentDoc }> {
  const membership = await requireConversationMembership(conversationId, userId);
  if (!membership) return { error: "You are not a member of this conversation.", status: 403 };
  const db = getDb();
  const [message] = await db
    .select()
    .from(messages)
    .where(and(eq(messages.id, messageId), eq(messages.conversationId, conversationId)))
    .limit(1);
  if (!message || !message.attachmentId || message.deletedAt) {
    return { error: "No attachment on this message.", status: 404 };
  }
  const [doc] = await db.select().from(documents).where(eq(documents.id, message.attachmentId)).limit(1);
  if (!doc) return { error: "Attachment not found.", status: 404 };
  return { doc };
}

/**
 * Send a chat attachment to the document-parsing workflow on explicit
 * request. The user picks the destination by using this chat action —
 * attachments are never auto-treated as proofs or project documents.
 */
export async function POST(_req: Request, { params }: RouteContext) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const rl = await rateLimit("ai-process", session.user.id, 20, "10 m");
  if (!rl.allowed) return apiError("Too many AI requests. Please try again shortly.", 429);

  const { id, messageId } = await params;
  const found = await loadAttachment(id, messageId, session.user.id);
  if ("error" in found) return apiError(found.error, found.status);
  if (!/^(application\/pdf|image\/|text\/)/.test(found.doc.mimeType)) {
    return apiError("Only documents, images, and text files can be analyzed. Voice notes use transcription.", 400);
  }

  const db = getDb();
  const [job] = await db
    .insert(parsingJobs)
    .values({
      documentId: found.doc.id,
      requestedBy: session.user.id,
      status: "pending",
      destinationType: "chat",
      destinationId: messageId,
    })
    .returning({ id: parsingJobs.id });
  return apiOk({ jobId: job.id }, 201);
}

/**
 * Transcribe a voice-note attachment on explicit request. The transcript is
 * returned for review — posting it is a separate deliberate send.
 */
export async function PUT(_req: Request, { params }: RouteContext) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const rl = await rateLimit("ai-process", session.user.id, 20, "10 m");
  if (!rl.allowed) return apiError("Too many AI requests. Please try again shortly.", 429);
  if (!aiVoiceConfigured()) {
    return apiError("Muse Voice is not configured, so transcription is unavailable.", 503);
  }

  const { id, messageId } = await params;
  const found = await loadAttachment(id, messageId, session.user.id);
  if ("error" in found) return apiError(found.error, found.status);
  if (!found.doc.mimeType.startsWith("audio/")) {
    return apiError("Only voice notes can be transcribed.", 400);
  }

  const url = await getPrivateObjectUrl(found.doc.storageKey, 300);
  if (!url) return apiError("Document storage is unavailable.", 502);
  let audio: Blob;
  try {
    const res = await fetch(url);
    if (!res.ok) return apiError("We couldn't fetch the voice note. Please try again.", 502);
    audio = new Blob([await res.arrayBuffer()], { type: found.doc.mimeType });
  } catch {
    return apiError("We couldn't fetch the voice note. Please try again.", 502);
  }

  const result = await transcribeWithMuseVoice(audio, found.doc.filename);
  if (!result.configured) return apiError(result.pendingReason ?? "Transcription unavailable.", 503);
  if (!result.transcript) return apiError(result.error ?? "Transcription failed.", 502);
  return apiOk({ transcript: result.transcript });
}
