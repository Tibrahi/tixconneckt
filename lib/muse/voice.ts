import "server-only";
import { voiceFileEndpoint, voiceModel } from "./endpoints";

/**
 * Muse Voice Transcribe — file endpoint (dev.meta.ai/docs/speech-to-text).
 *
 * `POST /v1/asr/transcribe?sessionId=…`, multipart with a `request` JSON
 * part (mode/model/audioEncoding, optional languageBias + keywords) and an
 * `audio` part holding a RIFF/WAVE container: mono 16-bit PCM at 16 or
 * 24 kHz. Callers must convert other formats first (see lib/audio-convert).
 */

export type VoiceMode = "PUSH_TO_TALK" | "ENDPOINTING" | "DIARIZATION";

export interface VoiceTurn {
  turnId: number;
  startMs?: number;
  endMs?: number;
  transcript?: string;
  speaker?: string;
}

export interface VoiceFileOptions {
  mode?: VoiceMode;
  languageBias?: string[];
  keywords?: string[];
  sessionId?: string;
}

export interface VoiceFileResult {
  transcript?: string;
  turns?: VoiceTurn[];
  audioDurationMs?: number;
  sessionId?: string;
  error?: string;
}

interface TranscribeResponse {
  sessionId?: string;
  transcript?: string;
  audioDurationMs?: number;
  turns?: VoiceTurn[];
  error?: { message?: string };
  message?: string;
}

/** Meta documents a 32 MB request cap — refuse larger uploads before sending. */
export const MAX_TRANSCRIBE_BYTES = 32 * 1024 * 1024;

function userSafeError(status: number, detail?: string): string {
  if (status === 401 || status === 403) return "Transcription credentials were rejected. Contact support.";
  if (status === 404) return "The transcription endpoint was not found. Contact support.";
  if (status === 400) {
    return detail || "The audio was rejected. Convert it to mono 16-bit WAV at 16 or 24 kHz first.";
  }
  if (status === 413) return "The recording is larger than 32 MB. Send a shorter clip.";
  if (status === 429) return "Transcription is rate-limited right now. Please try again shortly.";
  if (status >= 500) return "Transcription failed on the provider side. Your audio is saved — retry when ready.";
  return detail || "Transcription failed. Your audio is saved — retry when ready.";
}

async function postOnce(
  url: string,
  key: string,
  requestPart: Record<string, unknown>,
  audio: Blob,
  filename: string,
): Promise<Response> {
  const form = new FormData();
  form.append("request", new Blob([JSON.stringify(requestPart)], { type: "application/json" }));
  form.append("audio", audio, filename);
  return fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
    signal: AbortSignal.timeout(180000),
  });
}

export async function transcribeFile(
  audio: Blob,
  filename: string,
  options: VoiceFileOptions = {},
): Promise<VoiceFileResult> {
  const base = voiceFileEndpoint();
  const key = process.env.MUSE_VOICE_API_KEY;
  if (!base || !key) {
    return { error: "Muse Voice is not configured" };
  }
  if (audio.size > MAX_TRANSCRIBE_BYTES) {
    return { error: "The recording is larger than 32 MB. Send a shorter clip." };
  }
  const mode = options.mode ?? "PUSH_TO_TALK";
  const sessionId = options.sessionId ?? crypto.randomUUID();
  const requestPart: Record<string, unknown> = { mode, model: voiceModel(), audioEncoding: "WAV" };
  if (options.languageBias?.length) requestPart.languageBias = options.languageBias;
  if (options.keywords?.length) requestPart.keywords = options.keywords;
  const url = `${base}?sessionId=${encodeURIComponent(sessionId)}`;

  let res: Response;
  try {
    res = await postOnce(url, key, requestPart, audio, filename);
    if (res.status >= 500) {
      // The docs prescribe exactly one retry on provider failures.
      await new Promise((r) => setTimeout(r, 2000));
      res = await postOnce(url, key, requestPart, audio, filename);
    }
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "TimeoutError";
    console.error("[muse:voice]", timedOut ? "request timed out" : error instanceof Error ? error.message : error);
    return { error: "Transcription could not be reached. Your audio is saved — retry when ready." };
  }
  if (!res.ok) {
    let detail: string | undefined;
    try {
      const body = (await res.json()) as TranscribeResponse;
      detail = body.error?.message ?? body.message;
    } catch {
      /* non-JSON error body */
    }
    console.error("[muse:voice]", `HTTP ${res.status}`, detail ?? "");
    return { error: userSafeError(res.status, detail) };
  }
  let body: TranscribeResponse;
  try {
    body = (await res.json()) as TranscribeResponse;
  } catch {
    return { error: "Transcription returned an unusable result." };
  }
  if (!body.transcript) {
    return { error: "Transcription returned no text.", sessionId: body.sessionId };
  }
  return {
    transcript: body.transcript,
    turns: Array.isArray(body.turns) ? body.turns : [],
    audioDurationMs: body.audioDurationMs,
    sessionId: body.sessionId ?? sessionId,
  };
}
