/**
 * Meta Model API endpoint resolution (documented at dev.meta.ai).
 *
 * Base URL: https://api.meta.ai/v1 (OpenAI-compatible: Chat Completions,
 * Responses, Messages). Auth is always a Bearer key, held server-side only.
 *
 * Every resolver accepts the base in any of the shapes operators actually
 * configure (bare host, versioned root, or fully-qualified operation URL)
 * and normalizes to the documented operation without doubling path
 * segments — the `/v1/v1/process` doubling was the production Spark 404.
 */

function stripSlash(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

/**
 * Join an operation path onto a configured base. When the base already ends
 * with the path's leading segments (e.g. base `…/v1` + `/v1/chat/...`),
 * the overlap is collapsed instead of doubled.
 */
export function joinApiPath(base: string, path: string): string {
  const b = stripSlash(base);
  const p = path.startsWith("/") ? path : `/${path}`;
  const baseSegs = b.split("/");
  const pathSegs = p.split("/").filter(Boolean);
  const bTail = baseSegs.slice(-pathSegs.length).join("/");
  if (bTail === pathSegs.join("/")) return b;
  // Collapse the longest leading overlap: base `…/v1` + `/v1/asr/x` → `…/v1/asr/x`.
  for (let n = pathSegs.length - 1; n >= 1; n -= 1) {
    const baseTail = baseSegs.slice(-n).join("/");
    const pathHead = pathSegs.slice(0, n).join("/");
    if (baseTail === pathHead) {
      return `${b}/${pathSegs.slice(n).join("/")}`;
    }
  }
  return `${b}${p}`;
}

function sparkBase(): string | null {
  const raw = process.env.MUSE_SPARK_API_URL ?? "";
  return raw.trim() ? stripSlash(raw) : null;
}

function voiceBase(): string | null {
  const raw = process.env.MUSE_VOICE_API_URL ?? "";
  return raw.trim() ? stripSlash(raw) : null;
}

/** `POST …/chat/completions` (OpenAI-compatible) or null when unconfigured. */
export function sparkChatEndpoint(): string | null {
  const base = sparkBase();
  if (!base) return null;
  return joinApiPath(base, "/v1/chat/completions");
}

/**
 * File transcription endpoint. The configured value may be the realtime
 * WebSocket URL (`wss://…/v1/asr/realtime`) — its documented file sibling
 * is `https://…/v1/asr/transcribe` — a file URL already, or a bare base.
 */
export function voiceFileEndpoint(): string | null {
  const base = voiceBase();
  if (!base) return null;
  const sibling = base.match(/^(wss|https)(:\/\/.*\/v1\/asr)\/realtime$/);
  if (sibling) return `https${sibling[2]}/transcribe`;
  if (/\/asr\/transcribe$/.test(base)) return base.replace(/^wss:\/\//, "https://");
  return joinApiPath(base.replace(/^wss:\/\//, "https://"), "/v1/asr/transcribe");
}

/** `wss://…/v1/asr/realtime` — realtime transcription sessions. */
export function voiceRealtimeEndpoint(): string | null {
  const base = voiceBase();
  if (!base) return null;
  if (/\/asr\/realtime$/.test(base)) return base.replace(/^https:\/\//, "wss://");
  const sibling = base.match(/^https(:\/\/.*\/v1\/asr)\/transcribe$/);
  if (sibling) return `wss${sibling[1]}/realtime`;
  return joinApiPath(base.replace(/^https:\/\//, "wss://"), "/v1/asr/realtime");
}

/** Documented model IDs, overridable per deployment. */
export function sparkModel(): string {
  return process.env.MUSE_SPARK_MODEL?.trim() || "muse-spark-1.3";
}

export function voiceModel(): string {
  return process.env.MUSE_VOICE_MODEL?.trim() || "muse-voice-transcribe-1.0";
}
