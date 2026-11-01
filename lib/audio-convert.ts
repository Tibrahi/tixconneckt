/**
 * Browser-side audio conversion for the transcription pipeline (no ffmpeg).
 * Decodes any browser-supported recording (WebM/Opus, MP4, MP3, WAV, OGG),
 * resamples to mono 24 kHz, and encodes 16-bit PCM WAV — the only shape the
 * file endpoint accepts. Recordings over 10 minutes are refused, matching
 * the provider's audio cap.
 */

export const TRANSCRIBE_SAMPLE_RATE = 24000;
export const MAX_TRANSCRIBE_MS = 10 * 60 * 1000;

/** Encode raw int16 mono samples as a RIFF/WAVE Blob (pure, tested). */
export function encodeWavPcm(samples: Int16Array, sampleRate: number): Blob {
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const ascii = (at: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(at + i, text.charCodeAt(i));
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + samples.byteLength, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, samples.byteLength, true);
  const body = new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
  return new Blob([header, new Uint8Array(body)], { type: "audio/wav" });
}

function floatToInt16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, input[i]));
    out[i] = clamped < 0 ? Math.round(clamped * 32768) : Math.round(clamped * 32767);
  }
  return out;
}

/**
 * Decode + resample + encode. Throws an Error with a user-readable message
 * when the audio can't be decoded or exceeds the duration cap.
 */
export async function convertToTranscribableWav(input: Blob): Promise<{ wav: Blob; durationMs: number }> {
  const Audio = window.AudioContext;
  if (!Audio) throw new Error("Audio conversion is unavailable in this browser.");
  const bytes = await input.arrayBuffer();
  const decodeCtx = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await decodeCtx.decodeAudioData(bytes.slice(0));
  } catch {
    await decodeCtx.close().catch(() => {});
    throw new Error("This audio format can't be read in your browser.");
  }
  await decodeCtx.close().catch(() => {});
  if (!decoded.duration || !Number.isFinite(decoded.duration)) {
    throw new Error("This recording has no playable audio.");
  }
  const durationMs = Math.round(decoded.duration * 1000);
  if (durationMs > MAX_TRANSCRIBE_MS) {
    throw new Error("Recordings over 10 minutes can't be transcribed. Send a shorter clip.");
  }
  // Mix down to mono at the model's native rate.
  const offline = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * TRANSCRIBE_SAMPLE_RATE)), TRANSCRIBE_SAMPLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start(0);
  const rendered = await offline.startRendering();
  const channel = rendered.getChannelData(0);
  return { wav: encodeWavPcm(floatToInt16(channel), TRANSCRIBE_SAMPLE_RATE), durationMs };
}

/** m:ss duration label for recording indicators and players. */
export function formatAudioDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
