import { runRealtimeSession, upsample16to24k } from "@/lib/muse/realtime";
import { extractPcm16Frames, parseWavHeader, transcribableWavProblem } from "@/lib/muse/wav";
import { aiVoiceConfigured } from "@/lib/config";
import { apiError, apiOk } from "@/lib/api-response";
import { rateLimit } from "@/lib/rate-limit";
import { getSession } from "@/lib/session";
import { validateAudioUpload } from "@/lib/storage";

/**
 * Realtime-protocol transcription of one recording. The browser converts to
 * mono 16-bit PCM WAV first (lib/audio-convert); the server validates the
 * container, extracts raw frames (upsampling 16→24 kHz when needed), and
 * runs them through the documented `wss://…/v1/asr/realtime` session —
 * handshake, binary PCM frames, endStream, turn-segmented events.
 *
 * The Meta key stays server-side: browsers never open this socket.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const rl = await rateLimit("ai-voice-stream", session.user.id, 10, "10 m");
  if (!rl.allowed) return apiError("Too many transcription requests. Please try again shortly.", 429);
  if (!aiVoiceConfigured()) {
    return apiError("Muse Voice is not configured, so transcription is unavailable.", 503);
  }

  const form = await req.formData().catch(() => null);
  const audio = form?.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) {
    return apiError("No audio provided.", 400);
  }
  const typeProblem = validateAudioUpload(audio.type || "audio/wav", audio.size);
  if (typeProblem) return apiError(typeProblem, 400);
  if (audio.size > 32 * 1024 * 1024) {
    return apiError("The recording is larger than 32 MB. Send a shorter clip.", 400);
  }

  const bytes = new Uint8Array(await audio.arrayBuffer());
  const info = parseWavHeader(bytes);
  const problem = transcribableWavProblem(info);
  if (problem) {
    return apiError(`${problem} Convert the recording to mono 16-bit WAV at 24 kHz first.`, 400);
  }
  let pcm = extractPcm16Frames(bytes, info);
  if ((info.sampleRate ?? 24000) === 16000) pcm = upsample16to24k(pcm);

  const modeRaw = String(form?.get("mode") ?? "ENDPOINTING");
  const mode = modeRaw === "PUSH_TO_TALK" ? "PUSH_TO_TALK" : "ENDPOINTING";
  const languageBias = String(form?.get("languageBias") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 8);
  const keywords = String(form?.get("keywords") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 32);

  const result = await runRealtimeSession(pcm, {
    mode,
    languageBias: languageBias.length ? languageBias : undefined,
    keywords: keywords.length ? keywords : undefined,
  });
  if (!result.transcript) {
    return apiError(result.error ?? "Realtime transcription failed.", 502);
  }
  return apiOk({
    transcript: result.transcript,
    turns: result.turns ?? [],
    sessionId: result.sessionId,
    mode,
  });
}
