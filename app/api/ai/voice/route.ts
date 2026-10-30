import { getDb } from "@/db";
import { documents, flexibleRecords } from "@/db/schema";
import { transcribeWithMuseVoice, voiceTaskSupported } from "@/lib/ai";
import { getAiTask } from "@/lib/ai-tasks";
import { apiError, apiOk } from "@/lib/api-response";
import { rateLimit } from "@/lib/rate-limit";
import { getSession } from "@/lib/session";
import {
  buildStorageKey,
  uploadPrivateObject,
  validateAudioUpload,
} from "@/lib/storage";

const MODULES = ["wallet", "project", "request", "profile", "chat"] as const;

/**
 * Dynamic Muse Voice workflow (correction §4):
 * 1. Determine the requested voice task (only supported ops run).
 * 2. Capture/upload audio via multipart; validate type and size.
 * 3. Store audio in object storage; reference + metadata in PostgreSQL.
 * 4. Submit to the configured Muse Voice integration.
 * 5. Validate and persist the transcript as JSONB; render from the record.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const rl = await rateLimit("ai-voice", session.user.id, 20, "10 m");
  if (!rl.allowed) return apiError("Too many voice requests. Please try again shortly.", 429);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return apiError("Invalid request body.");
  }
  const taskId = String(form.get("task") ?? "transcribe");
  const task = getAiTask(taskId);
  if (!task || task.engine !== "voice") return apiError("Unknown voice task.", 404);
  if (!task.supported || !voiceTaskSupported(taskId)) {
    return apiError(task.unsupportedReason ?? "This voice task is not supported.", 501);
  }

  const docModule = String(form.get("module") ?? "profile");
  if (!(MODULES as readonly string[]).includes(docModule)) {
    return apiError("Unknown destination module.", 400);
  }
  const audio = form.get("audio");
  if (!(audio instanceof File)) return apiError("No audio provided.", 400);
  const audioProblem = validateAudioUpload(audio.type, audio.size);
  if (audioProblem) return apiError(audioProblem, 400);

  const buffer = Buffer.from(await audio.arrayBuffer());
  const key = buildStorageKey(session.user.id, `voice/${docModule}`, audio.name || "audio.webm");
  const uploaded = await uploadPrivateObject(key, buffer, audio.type);
  if (!uploaded.ok) {
    return apiError(
      uploaded.error === "File storage is disabled for phase one"
        ? "Audio uploads are unavailable in phase one. Your recording was not saved."
        : "We couldn't store your audio. Please try again.",
      502,
    );
  }

  const db = getDb();
  const [doc] = await db
    .insert(documents)
    .values({
      ownerId: session.user.id,
      module: docModule,
      filename: (audio.name || "audio.webm").slice(0, 200),
      mimeType: audio.type,
      sizeBytes: audio.size,
      storageKey: key,
    })
    .returning({ id: documents.id });

  const result = await transcribeWithMuseVoice(audio, audio.name || "audio.webm");
  if (!result.configured) {
    return apiOk({
      pending: true,
      pendingReason: result.pendingReason,
      documentId: doc.id,
    });
  }
  if (!result.transcript) {
    return apiError(result.error ?? "Transcription failed. Your audio is saved — retry when ready.", 502);
  }

  const [record] = await db
    .insert(flexibleRecords)
    .values({
      recordType: "voice_result",
      ownerId: session.user.id,
      visibility: "private",
      doc: { transcript: result.transcript, task: taskId, module: docModule },
      provenance: {
        source: "muse_voice",
        task: taskId,
        documentId: doc.id,
        mimeType: audio.type,
        sizeBytes: audio.size,
        producedAt: new Date().toISOString(),
      },
    })
    .returning();

  return apiOk({ pending: false, documentId: doc.id, record }, 201);
}
