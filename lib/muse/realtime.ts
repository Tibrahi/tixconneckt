import "server-only";
import { voiceModel, voiceRealtimeEndpoint } from "./endpoints";
import type { VoiceTurn } from "./voice";

/**
 * Muse Voice Transcribe — realtime sessions (dev.meta.ai/docs/speech-to-text).
 *
 * The browser never touches Meta: calls capture audio locally, the server
 * opens the WebSocket with the private key, streams int16 mono PCM frames
 * at 24 kHz, and collects turn-segmented transcripts. Protocol, exactly as
 * documented:
 * - first text frame: handshake `{authorization:{accessToken:"Bearer …"},
 *   audioEncoding:"PCM_24KHZ", model, mode, partialMode, emitAudioProgress}`
 * - server answers with a handshake echo containing `sessionId`
 * - audio goes as raw binary frames (~80 ms each)
 * - `{type:"endStream"}` ends the turn; the server closes after completion
 * - `transcript` events are partials (no turnId; `final` marks completion);
 *   `speechStart`/`speechEnd` mark boundaries keyed by `turnId`;
 *   `speechComplete` carries the turn text — `speechEnd` never does.
 */

export interface RealtimeSocketLike {
  send(data: string | ArrayBuffer): void;
  close(code?: number): void;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onclose: ((ev: { code?: number; reason?: string }) => void) | null;
}

export interface RealtimeOptions {
  mode?: "PUSH_TO_TALK" | "ENDPOINTING";
  languageBias?: string[];
  keywords?: string[];
  sessionId?: string;
  /** Overall budget; default 120s. */
  timeoutMs?: number;
  /** Socket factory — the global WebSocket unless tests inject a fake. */
  createSocket?: (url: string) => RealtimeSocketLike;
}

export interface RealtimeResult {
  transcript?: string;
  turns?: VoiceTurn[];
  sessionId?: string;
  error?: string;
}

interface ServerEvent {
  type?: string;
  sessionId?: string;
  turnId?: number;
  transcript?: string;
  final?: boolean;
  message?: string;
  audioProcessedMs?: number;
}

const FRAME_SAMPLES = (24000 * 80) / 1000; // 80 ms frames, as documented

function defaultSocket(url: string): RealtimeSocketLike {
  const SocketImpl = (globalThis as { WebSocket?: new (url: string) => RealtimeSocketLike }).WebSocket;
  if (!SocketImpl) throw new Error("Realtime transcription needs a WebSocket-capable runtime.");
  return new SocketImpl(url);
}

export async function runRealtimeSession(
  pcm24k: Int16Array,
  options: RealtimeOptions = {},
): Promise<RealtimeResult> {
  const base = voiceRealtimeEndpoint();
  const key = process.env.MUSE_VOICE_API_KEY;
  if (!base || !key) return { error: "Muse Voice is not configured" };
  if (pcm24k.length === 0) return { error: "There is no audio to transcribe." };

  const sessionId = options.sessionId ?? crypto.randomUUID();
  const mode = options.mode ?? "PUSH_TO_TALK";
  const timeoutMs = options.timeoutMs ?? 120000;
  const createSocket = options.createSocket ?? defaultSocket;

  let socket: RealtimeSocketLike;
  try {
    socket = createSocket(`${base}?sessionId=${encodeURIComponent(sessionId)}`);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Realtime transcription failed to start." };
  }

  return new Promise<RealtimeResult>((resolve) => {
    let settled = false;
    let handshakeDone = false;
    let serverSessionId = sessionId;
    let lastPartial = "";
    let finalPartial = "";
    const turns = new Map<number, VoiceTurn>();
    const finish = (result: RealtimeResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket.close(1000);
      } catch {
        /* already closed */
      }
      resolve(result);
    };
    const timer = setTimeout(() => finish({ error: "Realtime transcription timed out." }), timeoutMs);

    const failHandshake = (message: string) => finish({ error: message });

    socket.onopen = () => {
      try {
        const handshake: Record<string, unknown> = {
          authorization: { accessToken: `Bearer ${key}` },
          audioEncoding: "PCM_24KHZ",
          model: voiceModel(),
          mode,
          partialMode: "CUMULATIVE",
          emitAudioProgress: false,
        };
        if (options.languageBias?.length) handshake.languageBias = options.languageBias;
        if (options.keywords?.length) handshake.keywords = options.keywords;
        socket.send(JSON.stringify(handshake));
      } catch {
        failHandshake("Realtime transcription failed to start.");
      }
    };

    socket.onmessage = (ev) => {
      if (typeof ev.data !== "string") return; // binary server frames carry no events
      let event: ServerEvent;
      try {
        event = JSON.parse(ev.data) as ServerEvent;
      } catch {
        return;
      }
      if (!handshakeDone) {
        if (typeof event.sessionId === "string" && event.sessionId) {
          handshakeDone = true;
          serverSessionId = event.sessionId;
          streamAudio();
        } else {
          failHandshake(
            typeof event.message === "string" && event.message
              ? `Realtime transcription was rejected: ${event.message}`
              : "Realtime transcription handshake failed.",
          );
        }
        return;
      }
      if (event.type === "error") {
        finish({ error: `Realtime transcription failed: ${event.message ?? "provider error"}` });
        return;
      }
      if (event.type === "transcript" && typeof event.transcript === "string") {
        lastPartial = event.transcript; // partials replace, never append
        if (event.final === true) finalPartial = event.transcript;
        return;
      }
      if (event.type === "speechStart" && typeof event.turnId === "number") {
        turns.set(event.turnId, { turnId: event.turnId });
        return;
      }
      if (event.type === "speechComplete" && typeof event.turnId === "number") {
        // The ONLY carrier of turn text — speechEnd is just a boundary.
        const turn = turns.get(event.turnId) ?? { turnId: event.turnId };
        turn.transcript = event.transcript ?? "";
        turns.set(event.turnId, turn);
      }
    };

    socket.onerror = () => {
      if (!handshakeDone) failHandshake("Realtime transcription could not connect.");
    };

    socket.onclose = () => {
      if (!handshakeDone) {
        failHandshake("Realtime transcription closed before starting.");
        return;
      }
      const ordered = [...turns.values()]
        .filter((t) => t.transcript)
        .sort((a, b) => a.turnId - b.turnId);
      const transcript =
        ordered.length > 0
          ? ordered.map((t) => t.transcript as string).join(" ")
          : finalPartial || lastPartial;
      if (!transcript) {
        finish({ error: "Realtime transcription returned no text." });
        return;
      }
      finish({ transcript, turns: ordered, sessionId: serverSessionId });
    };

    function streamAudio() {
      try {
        for (let at = 0; at < pcm24k.length; at += FRAME_SAMPLES) {
          const slice = pcm24k.slice(at, at + FRAME_SAMPLES);
          // Little-endian int16, matching the documented dtype="int16" frames.
          socket.send(slice.buffer.slice(slice.byteOffset, slice.byteOffset + slice.byteLength));
        }
        socket.send(JSON.stringify({ type: "endStream" }));
      } catch {
        finish({ error: "Realtime transcription was interrupted while sending audio." });
      }
    }
  });
}

/** Linear-interpolation 16→24 kHz mono upsampler (pure, tested). */
export function upsample16to24k(input: Int16Array): Int16Array {
  if (input.length === 0) return new Int16Array(0);
  const out = new Int16Array(Math.round((input.length * 24000) / 16000));
  for (let i = 0; i < out.length; i += 1) {
    const pos = (i * 16000) / 24000;
    const lo = Math.floor(pos);
    const hi = Math.min(lo + 1, input.length - 1);
    const frac = pos - lo;
    out[i] = Math.max(-32768, Math.min(32767, Math.round(input[lo] * (1 - frac) + input[hi] * frac)));
  }
  return out;
}
