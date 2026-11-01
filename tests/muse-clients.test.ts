import { afterEach, describe, expect, it, vi } from "vitest";
import { runSparkTask } from "@/lib/muse/spark";
import { transcribeFile } from "@/lib/muse/voice";
import { extractPcm16Frames, parseWavHeader, transcribableWavProblem } from "@/lib/muse/wav";
import { runRealtimeSession, upsample16to24k, type RealtimeSocketLike } from "@/lib/muse/realtime";

const KEYS = ["MUSE_SPARK_API_URL", "MUSE_SPARK_API_KEY", "MUSE_VOICE_API_URL", "MUSE_VOICE_API_KEY"] as const;
const saved = new Map<string, string | undefined>();
function setEnv(patch: Partial<Record<(typeof KEYS)[number], string>>) {
  for (const key of KEYS) {
    if (!saved.has(key)) saved.set(key, process.env[key]);
    if (key in patch) process.env[key] = patch[key] as string;
    else delete process.env[key];
  }
}
afterEach(() => {
  for (const [key, value] of saved) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  saved.clear();
  vi.unstubAllGlobals();
});

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** Minimal mono 16-bit WAV builder for fixtures. */
function buildWav(samples: number[], sampleRate = 24000, channels = 1, bits = 16): Uint8Array {
  const data = new Uint8Array(samples.length * (bits / 8));
  const view = new DataView(data.buffer);
  samples.forEach((s, i) => view.setInt16(i * 2, s, true));
  const header = new Uint8Array(44);
  const h = new DataView(header.buffer);
  const ascii = (at: number, s: string) => {
    for (let i = 0; i < s.length; i += 1) header[at + i] = s.charCodeAt(i);
  };
  ascii(0, "RIFF");
  h.setUint32(4, 36 + data.length, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  h.setUint32(16, 16, true);
  h.setUint16(20, 1, true);
  h.setUint16(22, channels, true);
  h.setUint32(24, sampleRate, true);
  h.setUint32(28, (sampleRate * channels * bits) / 8, true);
  h.setUint16(32, (channels * bits) / 8, true);
  h.setUint16(34, bits, true);
  ascii(36, "data");
  h.setUint32(40, data.length, true);
  const out = new Uint8Array(44 + data.length);
  out.set(header, 0);
  out.set(data, 44);
  return out;
}

describe("runSparkTask", () => {
  it("posts Chat Completions and parses the JSON content", async () => {
    setEnv({ MUSE_SPARK_API_URL: "https://api.meta.ai/v1", MUSE_SPARK_API_KEY: "k" });
    const seen: Array<{ url: string; body: Record<string, unknown> }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        seen.push({ url, body: JSON.parse(String(init?.body)) as Record<string, unknown> });
        return jsonRes({ choices: [{ message: { content: '{"summary":"hi"}' } }] });
      }),
    );
    const result = await runSparkTask({ task: "summarize_conversation", input: { messages: [] } });
    expect(result.data).toEqual({ summary: "hi" });
    expect(result.model).toBe("muse-spark-1.3");
    expect(seen).toHaveLength(1);
    expect(seen[0].url).toBe("https://api.meta.ai/v1/chat/completions");
    const body = seen[0].body as { model: string; response_format: { type: string }; messages: Array<{ role: string; content: string }> };
    expect(body.model).toBe("muse-spark-1.3");
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[1].role).toBe("user");
  });
  it("maps HTTP errors to safe messages", async () => {
    setEnv({ MUSE_SPARK_API_URL: "https://api.meta.ai/v1", MUSE_SPARK_API_KEY: "k" });
    vi.stubGlobal("fetch", vi.fn(async () => jsonRes({ error: { message: "nope" } }, 404)));
    const result = await runSparkTask({ task: "summarize_conversation", input: {} });
    expect(result.data).toBeUndefined();
    expect(result.error).toContain("not found");
  });
  it("rejects non-JSON content", async () => {
    setEnv({ MUSE_SPARK_API_URL: "https://api.meta.ai/v1", MUSE_SPARK_API_KEY: "k" });
    vi.stubGlobal("fetch", vi.fn(async () => jsonRes({ choices: [{ message: { content: "plain text" } }] })));
    const result = await runSparkTask({ task: "summarize_conversation", input: {} });
    expect(result.error).toContain("unusable");
  });
  it("reports unconfigured without calling fetch", async () => {
    setEnv({});
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await runSparkTask({ task: "x", input: {} });
    expect(result.error).toContain("not configured");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("requests the supplied strict field schema", async () => {
    setEnv({ MUSE_SPARK_API_URL: "https://api.meta.ai/v1", MUSE_SPARK_API_KEY: "k" });
    let body: Record<string, unknown> | undefined;
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return jsonRes({ choices: [{ message: { content: '{"country":"Rwanda"}' } }] });
    }));
    const schema = { type: "object", properties: { country: { type: "string" } }, additionalProperties: false };
    const result = await runSparkTask({ task: "profile_interpret", input: { text: "Rwanda" }, outputSchema: schema });
    expect(result.data).toEqual({ country: "Rwanda" });
    expect(body?.response_format).toEqual({
      type: "json_schema",
      json_schema: { name: "profile_interpret_result", strict: false, schema },
    });
  });
});

describe("transcribeFile", () => {
  it("sends request+audio parts and returns transcript with turns", async () => {
    setEnv({ MUSE_VOICE_API_URL: "wss://api.meta.ai/v1/asr/realtime", MUSE_VOICE_API_KEY: "k" });
    let gotUrl = "";
    let gotForm: FormData | null = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        gotUrl = url;
        gotForm = init?.body as FormData;
        return jsonRes({ transcript: "hello world", turns: [{ turnId: 1, transcript: "hello world" }], audioDurationMs: 1200 });
      }),
    );
    const audio = new Blob([buildWav([0, 100, -100]) as unknown as BlobPart], { type: "audio/wav" });
    const result = await transcribeFile(audio, "note.wav", { mode: "ENDPOINTING", keywords: ["Tixconneckt"] });
    expect(result.transcript).toBe("hello world");
    expect(result.turns).toHaveLength(1);
    expect(gotUrl.startsWith("https://api.meta.ai/v1/asr/transcribe?sessionId=")).toBe(true);
    const requestBlob = (gotForm as unknown as FormData).get("request") as Blob;
    const requestPart = JSON.parse(await requestBlob.text()) as Record<string, unknown>;
    expect(requestPart).toMatchObject({ mode: "ENDPOINTING", model: "muse-voice-transcribe-1.0", audioEncoding: "WAV", keywords: ["Tixconneckt"] });
    expect((gotForm as unknown as FormData).get("audio")).toBeTruthy();
  });
  it("refuses oversize uploads before sending", async () => {
    setEnv({ MUSE_VOICE_API_URL: "https://api.meta.ai/v1/asr/transcribe", MUSE_VOICE_API_KEY: "k" });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const big = new Blob([new Uint8Array(33 * 1024 * 1024)], { type: "audio/wav" });
    const result = await transcribeFile(big, "big.wav");
    expect(result.error).toContain("32 MB");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("maps provider errors safely", async () => {
    setEnv({ MUSE_VOICE_API_URL: "https://api.meta.ai/v1/asr/transcribe", MUSE_VOICE_API_KEY: "k" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("limited", { status: 429 })));
    const audio = new Blob([buildWav([0]) as unknown as BlobPart], { type: "audio/wav" });
    const result = await transcribeFile(audio, "note.wav");
    expect(result.error).toContain("rate-limited");
  });
});

describe("WAV helpers", () => {
  it("parses a valid 24 kHz mono header and round-trips frames", () => {
    const info = parseWavHeader(buildWav([0, 1000, -1000, 32767]));
    expect(info.valid).toBe(true);
    expect(transcribableWavProblem(info)).toBeNull();
    expect([...extractPcm16Frames(buildWav([0, 1000, -1000, 32767]), info)]).toEqual([0, 1000, -1000, 32767]);
  });
  it("rejects non-transcribable shapes with reasons", () => {
    expect(transcribableWavProblem(parseWavHeader(buildWav([0], 24000, 2)))).toContain("mono");
    expect(transcribableWavProblem(parseWavHeader(new Uint8Array([1, 2, 3])))).toContain("too small");
    expect(transcribableWavProblem(parseWavHeader(new Uint8Array(50)))).toContain("RIFF");
  });
});

describe("runRealtimeSession", () => {
  class FakeSocket implements RealtimeSocketLike {
    sent: unknown[] = [];
    onopen: RealtimeSocketLike["onopen"] = null;
    onmessage: RealtimeSocketLike["onmessage"] = null;
    onerror: RealtimeSocketLike["onerror"] = null;
    onclose: RealtimeSocketLike["onclose"] = null;
    script: Array<{ data: unknown } | { close: true }> = [];
    constructor(readonly url: string) {}
    send(data: string | ArrayBuffer): void {
      this.sent.push(data);
    }
    close(): void {}
    open() {
      this.onopen?.({});
    }
    async play() {
      for (const step of this.script) {
        if ("close" in step) {
          this.onclose?.({});
        } else {
          this.onmessage?.({ data: step.data });
        }
      }
    }
  }

  it("handshakes, streams PCM, and assembles turn transcripts", async () => {
    setEnv({ MUSE_VOICE_API_URL: "wss://api.meta.ai/v1/asr/realtime", MUSE_VOICE_API_KEY: "k" });
    let socket: FakeSocket | null = null;
    const promise = runRealtimeSession(new Int16Array(4800), {
      mode: "ENDPOINTING",
      createSocket: (url) => {
        socket = new FakeSocket(url);
        return socket;
      },
    });
    await new Promise((r) => setTimeout(r, 10));
    if (!socket) throw new Error("no socket");
    const s = socket as FakeSocket;
    s.open();
    await new Promise((r) => setTimeout(r, 10));
    const handshake = JSON.parse(String(s.sent[0])) as Record<string, unknown>;
    expect(s.url.startsWith("wss://api.meta.ai/v1/asr/realtime?sessionId=")).toBe(true);
    expect(handshake).toMatchObject({ audioEncoding: "PCM_24KHZ", model: "muse-voice-transcribe-1.0", mode: "ENDPOINTING" });
    expect((handshake.authorization as { accessToken: string }).accessToken).toBe("Bearer k");
    s.script = [
      { data: JSON.stringify({ sessionId: "s1" }) },
      { data: JSON.stringify({ type: "transcript", transcript: "hel", final: false }) },
      { data: JSON.stringify({ type: "speechStart", turnId: 1 }) },
      { data: JSON.stringify({ type: "transcript", transcript: "hello", final: true }) },
      { data: JSON.stringify({ type: "speechEnd", turnId: 1 }) },
      { data: JSON.stringify({ type: "speechComplete", turnId: 1, transcript: "Hello." }) },
      { close: true },
    ];
    await s.play();
    const result = await promise;
    expect(result.transcript).toBe("Hello.");
    expect(result.turns).toEqual([{ turnId: 1, transcript: "Hello." }]);
    expect(result.sessionId).toBe("s1");
    // 4800 samples / 1920 per frame = 3 binary frames + endStream text frame
    expect(s.sent.filter((m) => typeof m !== "string")).toHaveLength(3);
    expect(s.sent.filter((m) => m === JSON.stringify({ type: "endStream" }))).toHaveLength(1);
  });

  it("surfaces handshake rejection", async () => {
    setEnv({ MUSE_VOICE_API_URL: "wss://api.meta.ai/v1/asr/realtime", MUSE_VOICE_API_KEY: "bad" });
    let socket: FakeSocket | null = null;
    const promise = runRealtimeSession(new Int16Array(100), {
      createSocket: (url) => {
        socket = new FakeSocket(url);
        return socket;
      },
    });
    await new Promise((r) => setTimeout(r, 10));
    (socket as unknown as FakeSocket).open();
    await new Promise((r) => setTimeout(r, 10));
    (socket as unknown as FakeSocket).script = [{ data: JSON.stringify({ type: "error", message: "unauthorized" }) }];
    await (socket as unknown as FakeSocket).play();
    const result = await promise;
    expect(result.error).toContain("unauthorized");
  });
});

describe("upsample16to24k", () => {
  it("resamples with linear interpolation", () => {
    const out = upsample16to24k(new Int16Array([0, 3000]));
    expect(out.length).toBe(3);
    expect(out[0]).toBe(0);
    expect(out[2]).toBe(3000);
    expect(out[1]).toBeGreaterThan(0);
    expect(upsample16to24k(new Int16Array(0)).length).toBe(0);
  });
});
