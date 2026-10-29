import { getDb } from "@/db";
import { documents } from "@/db/schema";
import {
  buildStorageKey,
  uploadPrivateObject,
  validateAudioUpload,
} from "./storage";

export interface RetainedAudio {
  retained: boolean;
  documentId?: string;
  problem?: string;
}

/**
 * Retain captured/uploaded voice audio (correction §4): validate the audio,
 * store it in private object storage, and persist its reference + metadata
 * in PostgreSQL. When storage is not configured the audio cannot be kept —
 * callers report that honestly instead of pretending it was saved.
 */
export async function retainVoiceAudio(
  userId: string,
  module: string,
  audio: File,
): Promise<RetainedAudio> {
  const problem = validateAudioUpload(audio.type, audio.size);
  if (problem) return { retained: false, problem };
  const buffer = Buffer.from(await audio.arrayBuffer());
  const key = buildStorageKey(userId, `voice/${module}`, audio.name || "audio.webm");
  const uploaded = await uploadPrivateObject(key, buffer, audio.type);
  if (!uploaded.ok) {
    return {
      retained: false,
      problem:
        uploaded.error === "Object storage is not configured"
          ? "Audio storage is not configured, so this recording was transcribed without being kept."
          : "Audio storage failed, so this recording was transcribed without being kept.",
    };
  }
  const db = getDb();
  const [doc] = await db
    .insert(documents)
    .values({
      ownerId: userId,
      module,
      filename: (audio.name || "audio.webm").slice(0, 200),
      mimeType: audio.type,
      sizeBytes: audio.size,
      storageKey: key,
    })
    .returning({ id: documents.id });
  return { retained: true, documentId: doc.id };
}
