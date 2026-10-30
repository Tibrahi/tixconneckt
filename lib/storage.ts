import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { storageConfigured } from "./config";

let client: S3Client | null = null;

function getClient(): S3Client | null {
  if (!storageConfigured()) return null;
  if (!client) {
    client = new S3Client({
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION ?? "us-east-1",
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY!,
        secretAccessKey: process.env.S3_SECRET_KEY!,
      },
      forcePathStyle: true,
    });
  }
  return client;
}

function bucket(): string {
  return process.env.S3_BUCKET ?? "tixconneckt-private";
}

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
export const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "text/plain",
]);
export const ALLOWED_AUDIO_MIME_TYPES = new Set([
  "audio/webm",
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "audio/ogg",
]);
export const MAX_CHAT_MEDIA_BYTES = 50 * 1024 * 1024;
const ALLOWED_CHAT_MEDIA = new Set([
  ...ALLOWED_AUDIO_MIME_TYPES,
  "video/webm",
  "video/mp4",
  "video/quicktime",
]);

export function validateUpload(mimeType: string, sizeBytes: number): string | null {
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    return `File type ${mimeType} is not supported. Use PDF, PNG, JPEG, or TXT.`;
  }
  if (sizeBytes > MAX_UPLOAD_BYTES) {
    return "File is larger than the 10 MB limit.";
  }
  if (sizeBytes <= 0) {
    return "File is empty.";
  }
  return null;
}

/** Voice uploads: supported audio capture formats up to 25 MB. */
export function validateAudioUpload(mimeType: string, sizeBytes: number): string | null {
  const base = mimeType.split(";")[0].trim().toLowerCase();
  if (!ALLOWED_AUDIO_MIME_TYPES.has(base)) {
    return "Audio type is not supported. Use WebM, MP3, M4A, WAV, or OGG.";
  }
  if (sizeBytes > MAX_AUDIO_BYTES) {
    return "Audio is larger than the 25 MB limit.";
  }
  if (sizeBytes <= 0) {
    return "Audio is empty.";
  }
  return null;
}

/** Chat voice notes and short video clips: allowlisted types up to 50 MB. */
export function validateChatMediaUpload(mimeType: string, sizeBytes: number): string | null {
  const base = mimeType.split(";")[0].trim().toLowerCase();
  if (!ALLOWED_CHAT_MEDIA.has(base)) {
    return "Media type is not supported. Use a common audio or video format.";
  }
  if (sizeBytes > MAX_CHAT_MEDIA_BYTES) {
    return "Media is larger than the 50 MB limit.";
  }
  if (sizeBytes <= 0) {
    return "Media is empty.";
  }
  return null;
}

export function buildStorageKey(ownerId: string, module: string, filename: string): string {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
  return `${module}/${ownerId}/${Date.now()}-${crypto.randomUUID()}-${safe}`;
}

export async function uploadPrivateObject(
  key: string,
  body: Buffer | Uint8Array,
  mimeType: string,
): Promise<{ ok: boolean; error?: string }> {
  const s3 = getClient();
  if (!s3) return { ok: false, error: "Object storage is not configured" };
  try {
    await s3.send(
      new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: mimeType }),
    );
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Upload failed" };
  }
}

/** Short-lived signed URL — private objects are never publicly readable. */
export async function getPrivateObjectUrl(key: string, expiresInSeconds = 300): Promise<string | null> {
  const s3 = getClient();
  if (!s3) return null;
  try {
    return await getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket(), Key: key }), {
      expiresIn: expiresInSeconds,
    });
  } catch {
    return null;
  }
}
