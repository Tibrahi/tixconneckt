/**
 * Minimal RIFF/WAVE reader for the transcription pipeline (no ffmpeg).
 * The file endpoint only accepts mono 16-bit integer PCM at 16 or 24 kHz;
 * these helpers validate uploads and extract raw frames for realtime use.
 */

export interface WavInfo {
  valid: boolean;
  reason?: string;
  channels?: number;
  bitsPerSample?: number;
  sampleRate?: number;
  dataOffset?: number;
  dataLength?: number;
}

export function parseWavHeader(bytes: Uint8Array): WavInfo {
  if (bytes.length < 44) return { valid: false, reason: "File is too small to be a WAV recording." };
  const ascii = (at: number, len: number): string =>
    String.fromCharCode(...bytes.subarray(at, at + len));
  if (ascii(0, 4) !== "RIFF" || ascii(8, 4) !== "WAVE") {
    return { valid: false, reason: "Not a WAV (RIFF/WAVE) file." };
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12;
  let channels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let audioFormat = 0;
  let dataOffset = -1;
  let dataLength = 0;
  let foundFmt = false;
  while (offset + 8 <= bytes.length) {
    const id = ascii(offset, 4);
    const size = view.getUint32(offset + 4, true);
    if (id === "fmt ") {
      if (size < 16 || offset + 8 + size > bytes.length) {
        return { valid: false, reason: "Corrupt WAV header." };
      }
      audioFormat = view.getUint16(offset + 8, true);
      channels = view.getUint16(offset + 10, true);
      sampleRate = view.getUint32(offset + 12, true);
      bitsPerSample = view.getUint16(offset + 22, true);
      foundFmt = true;
    } else if (id === "data") {
      dataOffset = offset + 8;
      dataLength = Math.min(size, bytes.length - dataOffset);
      break;
    }
    offset += 8 + size + (size % 2);
  }
  if (!foundFmt) return { valid: false, reason: "WAV header has no format chunk." };
  if (audioFormat !== 1) return { valid: false, reason: "Only uncompressed PCM WAV is supported." };
  if (dataOffset < 0 || dataLength <= 0) return { valid: false, reason: "WAV file has no audio data." };
  return { valid: true, channels, bitsPerSample, sampleRate, dataOffset, dataLength };
}

/** Mono 16-bit PCM at 16 or 24 kHz — the endpoint's accepted shape. */
export function transcribableWavProblem(info: WavInfo): string | null {
  if (!info.valid) return info.reason ?? "Not a usable WAV file.";
  if (info.channels !== 1) return "Only mono audio can be transcribed.";
  if (info.bitsPerSample !== 16) return "Only 16-bit audio can be transcribed.";
  if (info.sampleRate !== 16000 && info.sampleRate !== 24000) {
    return "Only 16 kHz or 24 kHz audio can be transcribed.";
  }
  return null;
}

/** Raw little-endian int16 frames for realtime streaming. Caller must validate first. */
export function extractPcm16Frames(bytes: Uint8Array, info: WavInfo): Int16Array {
  if (!info.valid || info.dataOffset === undefined || info.dataLength === undefined) {
    throw new Error("Validate the WAV header before extracting frames.");
  }
  const pcm = bytes.subarray(info.dataOffset, info.dataOffset + info.dataLength);
  const out = new Int16Array(Math.floor(pcm.length / 2));
  const view = new DataView(pcm.buffer, pcm.byteOffset, out.length * 2);
  for (let i = 0; i < out.length; i += 1) out[i] = view.getInt16(i * 2, true);
  return out;
}
