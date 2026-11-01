import { afterEach, describe, expect, it, vi } from "vitest";
import {
  imageEndpoint,
  imageModel,
  sparkChatEndpoint,
  sparkModel,
  voiceFileEndpoint,
  voiceModel,
  voiceRealtimeEndpoint,
} from "@/lib/muse/endpoints";

const KEYS = [
  "MUSE_SPARK_API_URL",
  "MUSE_SPARK_API_KEY",
  "MUSE_SPARK_MODEL",
  "MUSE_VOICE_API_URL",
  "MUSE_VOICE_API_KEY",
  "MUSE_VOICE_MODEL",
  "MUSE_IMAGE_API_URL",
  "MUSE_IMAGE_MODEL",
] as const;

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
  vi.restoreAllMocks();
});

describe("Muse endpoint resolution", () => {
  it("does not double the /v1 segment for the configured Spark root (production 404)", () => {
    setEnv({ MUSE_SPARK_API_URL: "https://api.meta.ai/v1" });
    expect(sparkChatEndpoint()).toBe("https://api.meta.ai/v1/chat/completions");
  });
  it("accepts a versionless Spark base", () => {
    setEnv({ MUSE_SPARK_API_URL: "https://api.meta.ai" });
    expect(sparkChatEndpoint()).toBe("https://api.meta.ai/v1/chat/completions");
  });
  it("accepts a fully-qualified Spark endpoint", () => {
    setEnv({ MUSE_SPARK_API_URL: "https://api.meta.ai/v1/chat/completions" });
    expect(sparkChatEndpoint()).toBe("https://api.meta.ai/v1/chat/completions");
  });
  it("maps the configured realtime voice URL to the documented file sibling", () => {
    setEnv({ MUSE_VOICE_API_URL: "wss://api.meta.ai/v1/asr/realtime" });
    expect(voiceFileEndpoint()).toBe("https://api.meta.ai/v1/asr/transcribe");
    expect(voiceRealtimeEndpoint()).toBe("wss://api.meta.ai/v1/asr/realtime");
  });
  it("accepts a file voice URL and derives the realtime sibling", () => {
    setEnv({ MUSE_VOICE_API_URL: "https://api.meta.ai/v1/asr/transcribe" });
    expect(voiceFileEndpoint()).toBe("https://api.meta.ai/v1/asr/transcribe");
    expect(voiceRealtimeEndpoint()).toBe("wss://api.meta.ai/v1/asr/realtime");
  });
  it("accepts a versionless voice base", () => {
    setEnv({ MUSE_VOICE_API_URL: "https://api.meta.ai" });
    expect(voiceFileEndpoint()).toBe("https://api.meta.ai/v1/asr/transcribe");
  });
  it("resolves the image endpoint from the shared Model API base", () => {
    setEnv({ MUSE_SPARK_API_URL: "https://api.meta.ai/v1" });
    expect(imageEndpoint()).toBe("https://api.meta.ai/v1/images/generations");
  });
  it("prefers an explicit image base when configured", () => {
    setEnv({ MUSE_SPARK_API_URL: "https://api.meta.ai/v1", MUSE_IMAGE_API_URL: "https://images.example.com/v2/" });
    expect(imageEndpoint()).toBe("https://images.example.com/v2/images/generations");
  });
  it("returns null when unconfigured", () => {
    setEnv({});
    expect(sparkChatEndpoint()).toBeNull();
    expect(voiceFileEndpoint()).toBeNull();
    expect(voiceRealtimeEndpoint()).toBeNull();
    expect(imageEndpoint()).toBeNull();
  });
});

describe("Muse model IDs", () => {
  it("uses documented defaults with env overrides", () => {
    setEnv({});
    expect(sparkModel()).toBe("muse-spark-1.3");
    expect(voiceModel()).toBe("muse-voice-transcribe-1.0");
    expect(imageModel()).toBe("muse-image-1.0");
    setEnv({ MUSE_SPARK_MODEL: "muse-spark-1.1", MUSE_VOICE_MODEL: "custom-voice", MUSE_IMAGE_MODEL: "custom-image" });
    expect(sparkModel()).toBe("muse-spark-1.1");
    expect(voiceModel()).toBe("custom-voice");
    expect(imageModel()).toBe("custom-image");
  });
});
