import { getDb } from "@/db";
import { withMigrationRetry } from "@/db/migrate-on-boot";
import { documents, flexibleRecords } from "@/db/schema";
import { transcribeWithMuseVoice, voiceTaskSupported } from "@/lib/ai";
import { getAiTask } from "@/lib/ai-tasks";
import { apiError, apiOk } from "@/lib/api-response";
import { rateLimit } from "@/lib/rate-limit";
import { getSession } from "@/lib/session";
import {
  buildStorageKey,
  storeUpload,
  validateAudioUpload,
} from "@/lib/storage";

const MODULES = ["wallet", "project", "request", "profile", "chat"] as const;

/**
 * Dynamic Muse Voice workflow (correction §4):
 * 1. Determine the requested voice task (only supported ops run).
 * 2. Capture/upload audio via multipart; validate type and size.
 * 3. Store audio in object storage; reference + metadata in PostgreSQL.
 * 4. Submit mono 16-bit PCM WAV (16/24 kHz) to Muse Voice Transcribe —
 *    clients convert first (lib/audio-convert); anything else is refused
 *    with an actionable error instead of being mis-sent.
 * 5. Validate and persist the transcript + turns as JSONB; render from the record.
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
  const stored = await storeUpload(key, buffer, audio.type);

  const db = getDb();
  const [doc] = await withMigrationRetry(() =>
    db
      .insert(documents)
      .values({
        ownerId: session.user.id,
        module: docModule,
        filename: (audio.name || "audio.webm").slice(0, 200),
        mimeType: audio.type,
        sizeBytes: audio.size,
        storageKey: stored.storageKey,
        data: stored.data,
      })
      .returning({ id: documents.id }),
  );

  const modeRaw = String(form.get("mode") ?? "PUSH_TO_TALK");
  const mode = modeRaw === "ENDPOINTING" || modeRaw === "DIARIZATION" ? modeRaw : "PUSH_TO_TALK";
  const languageBias = String(form.get("languageBias") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 8);
  const keywords = String(form.get("keywords") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 32);
  const result = await transcribeWithMuseVoice(audio, audio.name || "audio.wav", {
    mode,
    languageBias: languageBias.length ? languageBias : undefined,
    keywords: keywords.length ? keywords : undefined,
  });
  if (!result.configured) {
    return apiOk({
      pending: true,
      pendingReason: result.pendingReason,
      documentId: doc.id,
    });
  }
  if (!result.transcript) {
    return apiError(
      result.error ?? "Transcription failed. Your audio is saved — retry when ready.",
      result.error?.includes("Convert the recording") ? 400 : 502,
    );
  }

  const [record] = await db
    .insert(flexibleRecords)
    .values({
      recordType: "voice_result",
      ownerId: session.user.id,
      visibility: "private",
      doc: { transcript: result.transcript, turns: result.turns ?? [], task: taskId, module: docModule },
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
