import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { withMigrationRetry } from "@/db/migrate-on-boot";
import { documents, messages, parsingJobs } from "@/db/schema";
import { transcribeWithMuseVoice } from "@/lib/ai";
import { aiVoiceConfigured } from "@/lib/config";
import { apiError, apiOk } from "@/lib/api-response";
import { requireConversationMembership } from "@/lib/chat";
import { rateLimit } from "@/lib/rate-limit";
import { getSession } from "@/lib/session";
import { resolveStoredBytes } from "@/lib/storage";

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
  const attachmentId = message.attachmentId;
  const [doc] = await withMigrationRetry(() =>
    db.select().from(documents).where(eq(documents.id, attachmentId)).limit(1),
  );
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
 *
 * The caller may attach a converted `audio` part (mono 16-bit PCM WAV):
 * the chat UI converts in-browser so stored WebM/MP4 notes transcribe
 * without server-side ffmpeg. Without it, the stored bytes are used as-is
 * and must already be transcribable WAV.
 */
export async function PUT(req: Request, { params }: RouteContext) {
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

  let audio: Blob;
  let filename = found.doc.filename;
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    const provided = form?.get("audio");
    if (!(provided instanceof Blob) || provided.size === 0) {
      return apiError("No converted audio provided.", 400);
    }
    if (provided.size > 32 * 1024 * 1024) {
      return apiError("The recording is larger than 32 MB. Send a shorter clip.", 400);
    }
    audio = provided;
    filename = provided instanceof File && provided.name ? provided.name : "note.wav";
  } else {
    const stored = await resolveStoredBytes(found.doc.storageKey, found.doc.data, found.doc.mimeType);
    if (!stored) return apiError("Document storage is unavailable.", 502);
    audio = new Blob([new Uint8Array(stored.body)], { type: found.doc.mimeType });
  }

  const result = await transcribeWithMuseVoice(audio, filename);
  if (!result.configured) return apiError(result.pendingReason ?? "Transcription unavailable.", 503);
  if (!result.transcript) {
    const status = result.error?.includes("Convert the recording") ? 400 : 502;
    return apiError(result.error ?? "Transcription failed.", status);
  }
  return apiOk({ transcript: result.transcript, turns: result.turns ?? [] });
}
