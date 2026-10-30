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
  void key;
  void body;
  void mimeType;
  return { ok: false, error: "File storage is disabled for phase one" };
}

/** Short-lived signed URL — private objects are never publicly readable. */
export async function getPrivateObjectUrl(key: string, expiresInSeconds = 300): Promise<string | null> {
  void key;
  void expiresInSeconds;
  return null;
}
