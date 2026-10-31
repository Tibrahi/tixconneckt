import { getDb } from "@/db";
import { withMigrationRetry } from "@/db/migrate-on-boot";
import { documents } from "@/db/schema";
import {
  buildStorageKey,
  storeUpload,
  validateAudioUpload,
} from "./storage";

export interface RetainedAudio {
  retained: boolean;
  documentId?: string;
  problem?: string;
}

/**
 * Retain captured/uploaded voice audio (correction §4): validate the audio,
 * store it in Neon Object Storage when available (else the bytes in Neon
 * PostgreSQL), and persist its reference + metadata in PostgreSQL.
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
  const stored = await storeUpload(key, buffer, audio.type);
  const db = getDb();
  const [doc] = await withMigrationRetry(() =>
    db
      .insert(documents)
      .values({
        ownerId: userId,
        module,
        filename: (audio.name || "audio.webm").slice(0, 200),
        mimeType: audio.type,
        sizeBytes: audio.size,
        storageKey: stored.storageKey,
        data: stored.data,
      })
      .returning({ id: documents.id }),
  );
  return { retained: true, documentId: doc.id };
}
