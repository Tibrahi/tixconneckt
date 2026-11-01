import { describe, expect, it } from "vitest";
import { encodeWavPcm, formatAudioDuration } from "@/lib/audio-convert";
import { extractPcm16Frames, parseWavHeader, transcribableWavProblem } from "@/lib/muse/wav";

describe("encodeWavPcm", () => {
  it("round-trips through the server-side WAV validator", async () => {
    const samples = new Int16Array([0, 1000, -1000, 32767, -32768]);
    const blob = encodeWavPcm(samples, 24000);
    expect(blob.type).toBe("audio/wav");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const info = parseWavHeader(bytes);
    expect(info.valid).toBe(true);
    expect(transcribableWavProblem(info)).toBeNull();
    expect([...extractPcm16Frames(bytes, info)]).toEqual([...samples]);
  });
});

describe("formatAudioDuration", () => {
  it("formats m:ss labels", () => {
    expect(formatAudioDuration(0)).toBe("0:00");
    expect(formatAudioDuration(5000)).toBe("0:05");
    expect(formatAudioDuration(65000)).toBe("1:05");
    expect(formatAudioDuration(600000)).toBe("10:00");
  });
});
