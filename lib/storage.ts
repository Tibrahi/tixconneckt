import "server-only";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getStorageConfig, objectStorageConfigured, type StorageConfig } from "./storage-config";

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

const ALLOWED_PROJECT_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

/**
 * Magic-byte sniffing: never trust the client-provided MIME type alone.
 * Returns the detected base type, or null when the content is unknown.
 */
export function sniffContentKind(buffer: Buffer | Uint8Array): string | null {
  const b = buffer instanceof Buffer ? buffer : Buffer.from(buffer);
  if (b.length < 4) return null;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "image/gif";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b.length > 12 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) {
    return "image/webp";
  }
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return "application/pdf";
  if (b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04) return "application/zip";
  // Plain text: no NUL bytes in the first 8 KB.
  const head = b.subarray(0, Math.min(b.length, 8192));
  if (!head.includes(0)) return "text/plain";
  return null;
}

/**
 * Project uploads: documents, spreadsheets, text, CSV, and images.
 * The claimed MIME type must match the sniffed content kind.
 */
export function validateProjectUpload(
  mimeType: string,
  sizeBytes: number,
  buffer: Buffer | Uint8Array,
): string | null {
  const base = mimeType.split(";")[0].trim().toLowerCase();
  if (!ALLOWED_PROJECT_MIME_TYPES.has(base)) {
    return "File type is not supported. Use PDF, DOCX, XLSX, TXT, Markdown, CSV, or an image.";
  }
  if (sizeBytes > MAX_UPLOAD_BYTES) return "File is larger than the 10 MB limit.";
  if (sizeBytes <= 0) return "File is empty.";
  const sniffed = sniffContentKind(buffer);
  if (!sniffed) return "The file content could not be recognized.";
  if (base === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || base === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") {
    if (sniffed !== "application/zip") return "That file is not a valid Office document.";
    return null;
  }
  if (base === "text/markdown" || base === "text/csv") {
    if (sniffed !== "text/plain") return "That file is not plain text.";
    return null;
  }
  if (sniffed !== base) return "The file content does not match its type.";
  return null;
}

const ALLOWED_ORGANIZATION_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "application/pdf",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

function isSvgDocument(buffer: Buffer | Uint8Array): boolean {
  const b = buffer instanceof Buffer ? buffer : Buffer.from(buffer);
  const head = b.subarray(0, Math.min(b.length, 4096)).toString("utf8").trim().toLowerCase();
  if (head.includes("\0")) return false;
  let start = head;
  if (start.startsWith("<?xml")) {
    const end = start.indexOf("?>");
    if (end === -1) return false;
    start = start.slice(end + 2);
  }
  return start.trimStart().startsWith("<svg");
}

/**
 * Organization uploads: logos (PNG, JPEG, GIF, WebP, SVG) and verification
 * evidence (PDF, TXT, DOCX). The claimed MIME type must match the sniffed
 * content so a renamed binary can never pose as a logo.
 */
export function validateOrganizationUpload(
  mimeType: string,
  sizeBytes: number,
  buffer: Buffer | Uint8Array,
): string | null {
  const base = mimeType.split(";")[0].trim().toLowerCase();
  if (!ALLOWED_ORGANIZATION_MIME_TYPES.has(base)) {
    return "File type is not supported. Use an image (PNG, JPEG, GIF, WebP, SVG), PDF, TXT, or DOCX.";
  }
  if (sizeBytes > MAX_UPLOAD_BYTES) return "File is larger than the 10 MB limit.";
  if (sizeBytes <= 0) return "File is empty.";
  const sniffed = sniffContentKind(buffer);
  if (!sniffed) return "The file content could not be recognized.";
  if (base === "image/svg+xml") {
    if (!isSvgDocument(buffer)) return "That file is not a valid SVG image.";
    return null;
  }
  if (base === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    if (sniffed !== "application/zip") return "That file is not a valid Office document.";
    return null;
  }
  if (sniffed !== base) return "The file content does not match its type.";
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

let neonS3Client: S3Client | null = null;
let neonS3ClientKey: string | null = null;
function getS3Client(): { client: S3Client; config: StorageConfig } | null {
  const config = getStorageConfig();
  if (!config) return null;
  // Recreate the client if credentials/endpoint change (env reloads in dev).
  const key = `${config.endpoint}|${config.region}|${config.accessKeyId}`;
  if (!neonS3Client || neonS3ClientKey !== key) {
    neonS3Client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
      forcePathStyle: true,
    });
    neonS3ClientKey = key;
  }
  return { client: neonS3Client, config };
}

export async function uploadPrivateObject(
  key: string,
  body: Buffer | Uint8Array,
  mimeType: string,
): Promise<{ ok: boolean; error?: string }> {
  const s3 = getS3Client();
  if (!s3) return { ok: false, error: "Neon Object Storage is not configured" };
  try {
    await s3.client.send(new PutObjectCommand({ Bucket: s3.config.bucket, Key: key, Body: body, ContentType: mimeType }));
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not write to Neon Object Storage" };
  }
}

export async function downloadPrivateObject(key: string): Promise<{ body: Buffer; contentType?: string } | null> {
  const s3 = getS3Client();
  if (!s3) return null;
  try {
    const result = await s3.client.send(new GetObjectCommand({ Bucket: s3.config.bucket, Key: key }));
    if (!result.Body) return null;
    return { body: Buffer.from(await result.Body.transformToByteArray()), contentType: result.ContentType };
  } catch {
    return null;
  }
}

export async function deletePrivateObject(key: string): Promise<void> {
  const s3 = getS3Client();
  if (!s3) return;
  await s3.client.send(new DeleteObjectCommand({ Bucket: s3.config.bucket, Key: key }));
}

/** Short-lived signed URL — private objects are never publicly readable. */
export async function getPrivateObjectUrl(key: string, expiresInSeconds = 300): Promise<string | null> {
  const s3 = getS3Client();
  if (!s3) return null;
  try {
    return await getSignedUrl(s3.client, new GetObjectCommand({ Bucket: s3.config.bucket, Key: key }), {
      expiresIn: Math.max(30, Math.min(expiresInSeconds, 3600)),
    });
  } catch {
    return null;
  }
}

export interface StoredUpload {
  storageKey: string | null;
  data: Buffer | null;
}

/**
 * Dual-mode store: Neon Object Storage (bucket `tixconneckt`) when it is
 * configured and healthy, otherwise the bytes for Neon PostgreSQL. Returns
 * the pair the caller persists on the row — exactly one side holds the file
 * — so uploads never 502 just because object storage is absent or failing.
 */
export async function storeUpload(
  key: string,
  body: Buffer | Uint8Array,
  mimeType: string,
): Promise<StoredUpload> {
  const uploaded = await uploadPrivateObject(key, body, mimeType);
  if (uploaded.ok) return { storageKey: key, data: null };
  if (objectStorageConfigured()) {
    console.warn(`[storage] object upload failed (${uploaded.error ?? "unknown error"}); keeping bytes in PostgreSQL: ${key}`);
  }
  return { storageKey: null, data: body instanceof Buffer ? body : Buffer.from(body) };
}

/**
 * Dual-mode read: object storage first when the row has a key, PostgreSQL
 * bytes otherwise (or when the object fetch fails and row bytes exist).
 */
export async function resolveStoredBytes(
  storageKey: string | null,
  fallbackData: Buffer | Uint8Array | null,
  fallbackContentType?: string,
): Promise<{ body: Buffer; contentType?: string } | null> {
  if (storageKey) {
    const object = await downloadPrivateObject(storageKey);
    if (object) return object;
  }
  if (!fallbackData) return null;
  return {
    body: fallbackData instanceof Buffer ? fallbackData : Buffer.from(fallbackData),
    contentType: fallbackContentType,
  };
}

/** Same-origin byte URL for PostgreSQL-mode documents (authorized server-side). */
export function postgresDocumentUrl(documentId: string): string {
  return `/api/documents/${encodeURIComponent(documentId)}/file`;
}

/**
 * Client-facing document URL in either mode: a short-lived signed object URL
 * when object storage holds the file, else the same-origin byte endpoint.
 */
export async function getDocumentUrl(
  doc: { id: string; storageKey: string | null },
  expiresInSeconds = 300,
): Promise<string> {
  if (doc.storageKey) {
    const url = await getPrivateObjectUrl(doc.storageKey, expiresInSeconds);
    if (url) return url;
  }
  return postgresDocumentUrl(doc.id);
}
