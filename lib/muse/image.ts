import "server-only";
import { imageEndpoint, imageModel } from "./endpoints";

/**
 * Muse Image via the Meta Model API (`POST /v1/images/generations`,
 * OpenAI-compatible — dev.meta.ai/docs/image-generation).
 *
 * Always requests `b64_json` bytes: the `url` variant is a temporary
 * signed URL that must never become a permanent profile image. Returned
 * bytes are magic-byte verified before the caller persists them.
 */

export type ImageSize = "1024x1024" | "1792x1024";

/** Prompt suffixes behind the UI style picker (prompt text, not API params). */
export const IMAGE_STYLES = {
  natural: "",
  photographic: ", professional studio photograph, soft natural lighting",
  illustration: ", detailed digital illustration, vibrant colors",
  minimal: ", minimal flat design, clean background",
} as const;

export type ImageStyle = keyof typeof IMAGE_STYLES;

export interface GenerateImageResult {
  bytes?: Buffer;
  mimeType?: "image/png" | "image/jpeg";
  revisedPrompt?: string;
  error?: string;
}

interface GenerationsResponse {
  data?: Array<{ b64_json?: string; url?: string; revised_prompt?: string }>;
  error?: { message?: string };
}

function sniffImage(bytes: Buffer): "image/png" | "image/jpeg" | null {
  if (bytes.length > 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "image/png";
  }
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  return null;
}

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/**
 * Fetch a provider-hosted image URL server-side and verify its bytes. Used
 * only when the provider ignores `response_format: b64_json`. The temporary
 * URL is never returned to the client — only verified bytes become a
 * data-URL preview, and only the user's applied upload is persisted.
 */
async function fetchRemoteImage(url: string): Promise<GenerateImageResult> {
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  } catch {
    return { error: "Image generation returned a preview that could not be loaded. Please try again." };
  }
  if (!res.ok) {
    console.error("[muse:image]", `preview fetch HTTP ${res.status}`);
    return { error: "Image generation returned a preview that could not be loaded. Please try again." };
  }
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_IMAGE_BYTES) {
    return { error: "Image generation returned an unusable result." };
  }
  const reader = res.body?.getReader();
  if (!reader) return { error: "Image generation returned an unusable result." };
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_IMAGE_BYTES) return { error: "Image generation returned an unusable result." };
      chunks.push(value);
    }
  } catch {
    return { error: "Image generation returned a preview that could not be loaded. Please try again." };
  } finally {
    reader.releaseLock();
  }
  const bytes = Buffer.concat(chunks);
  if (bytes.length === 0) return { error: "Image generation returned an unusable result." };
  const mimeType = sniffImage(bytes);
  if (!mimeType) return { error: "Image generation returned an unusable result." };
  return { bytes, mimeType };
}

export async function generateImage(request: {
  prompt: string;
  size: ImageSize;
  style?: ImageStyle;
}): Promise<GenerateImageResult> {
  const url = imageEndpoint();
  const key = process.env.MUSE_SPARK_API_KEY;
  if (!url || !key) {
    return { error: "Image generation is not configured" };
  }
  const prompt = request.prompt.trim();
  if (!prompt) return { error: "Describe the image you want first." };
  if (prompt.length > 2000) return { error: "Keep the description under 2000 characters." };
  const styled = prompt + (request.style ? IMAGE_STYLES[request.style] : "");

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: imageModel(),
        prompt: styled,
        size: request.size,
        n: 1,
        response_format: "b64_json",
      }),
      signal: AbortSignal.timeout(180000),
    });
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "TimeoutError";
    console.error("[muse:image]", timedOut ? "request timed out" : error instanceof Error ? error.message : error);
    return { error: timedOut ? "Image generation timed out. Please try again." : "Image generation could not be reached. Please try again." };
  }
  if (!res.ok) {
    let detail: string | undefined;
    try {
      const body = (await res.json()) as GenerationsResponse;
      detail = body.error?.message;
    } catch {
      /* non-JSON error body */
    }
    console.error("[muse:image]", `HTTP ${res.status}`, detail ?? "");
    if (res.status === 401 || res.status === 403) return { error: "Image generation credentials were rejected. Contact support." };
    if (res.status === 429) return { error: "Image generation is rate-limited right now. Please try again shortly." };
    if (res.status === 400) return { error: detail || "The image request was rejected. Try a different description." };
    return { error: "Image generation failed. Please try again." };
  }
  let body: GenerationsResponse;
  try {
    body = (await res.json()) as GenerationsResponse;
  } catch {
    return { error: "Image generation returned an unusable result." };
  }
  const first = body.data?.[0];
  const b64 = first?.b64_json;
  if (!b64) {
    // Some providers ignore response_format and return a temporary URL.
    // Fetch its bytes server-side so the client never sees the temp URL.
    const remoteUrl = first?.url;
    if (typeof remoteUrl === "string" && remoteUrl.startsWith("https://")) {
      console.warn("[muse:image] provider returned url instead of b64_json; fetching bytes");
      const remote = await fetchRemoteImage(remoteUrl);
      if (remote.bytes && remote.mimeType) {
        return { ...remote, revisedPrompt: first?.revised_prompt };
      }
      return remote;
    }
    return { error: "Image generation returned no image." };
  }
  let bytes: Buffer;
  try {
    bytes = Buffer.from(b64, "base64");
  } catch {
    return { error: "Image generation returned an unusable result." };
  }
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) {
    return { error: "Image generation returned an unusable result." };
  }
  const mimeType = sniffImage(bytes);
  if (!mimeType) return { error: "Image generation returned an unusable result." };
  return { bytes, mimeType, revisedPrompt: first?.revised_prompt };
}
