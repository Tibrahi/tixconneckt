import { afterEach, describe, expect, it, vi } from "vitest";
import { callMuseSpark } from "@/lib/ai";
import {
  openChatEndpoint,
  openWeightsConfigured,
  openWeightsModel,
  runOpenTask,
  shouldUseOpenWeights,
} from "@/lib/muse/openweights";

const KEYS = [
  "MUSE_SPARK_API_URL",
  "MUSE_SPARK_API_KEY",
  "MUSE_OPEN_API_URL",
  "MUSE_OPEN_API_KEY",
  "MUSE_OPEN_MODEL",
  "MUSE_OPEN_MATCH",
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
  vi.unstubAllGlobals();
});

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("open-weights endpoint resolution", () => {
  it("returns null when unconfigured", () => {
    setEnv({});
    expect(openChatEndpoint()).toBeNull();
    expect(openWeightsConfigured()).toBe(false);
  });

  it("joins a versioned base without doubling segments", () => {
    setEnv({ MUSE_OPEN_API_URL: "https://inference.baseten.co/v1", MUSE_OPEN_API_KEY: "k" });
    expect(openChatEndpoint()).toBe("https://inference.baseten.co/v1/chat/completions");
    expect(openWeightsConfigured()).toBe(true);
  });

  it("accepts a fully-qualified operation URL as-is", () => {
    setEnv({ MUSE_OPEN_API_URL: "https://x.example/v1/chat/completions", MUSE_OPEN_API_KEY: "k" });
    expect(openChatEndpoint()).toBe("https://x.example/v1/chat/completions");
  });

  it("defaults to the event's Baseten model id, overridable per deployment", () => {
    setEnv({});
    expect(openWeightsModel()).toBe("meta-models/muse-spark-open-1026");
    setEnv({ MUSE_OPEN_MODEL: "custom/model" });
    expect(openWeightsModel()).toBe("custom/model");
  });
});

describe("shouldUseOpenWeights", () => {
  it("is narrowly gated: matching tasks + flag + credentials", () => {
    setEnv({ MUSE_OPEN_API_URL: "https://x.example/v1", MUSE_OPEN_API_KEY: "k", MUSE_OPEN_MATCH: "1" });
    expect(shouldUseOpenWeights("match_explain")).toBe(true);
    expect(shouldUseOpenWeights("match_score")).toBe(true);
    expect(shouldUseOpenWeights("project_analysis")).toBe(false);
    expect(shouldUseOpenWeights("interpret_action")).toBe(false);
  });

  it("stays off without the explicit flag", () => {
    setEnv({ MUSE_OPEN_API_URL: "https://x.example/v1", MUSE_OPEN_API_KEY: "k" });
    expect(shouldUseOpenWeights("match_explain")).toBe(false);
  });

  it("stays off without credentials", () => {
    setEnv({ MUSE_OPEN_MATCH: "1" });
    expect(shouldUseOpenWeights("match_explain")).toBe(false);
  });
});

describe("runOpenTask", () => {
  it("posts Chat Completions and parses JSON content with the open model id", async () => {
    setEnv({ MUSE_OPEN_API_URL: "https://x.example/v1", MUSE_OPEN_API_KEY: "k" });
    const seen: Array<{ url: string; body: Record<string, unknown> }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        seen.push({ url, body: JSON.parse(String(init?.body)) as Record<string, unknown> });
        return jsonRes({ choices: [{ message: { content: '{"explanation":"shared goals"}' } }] });
      }),
    );
    const result = await runOpenTask({ task: "match_explain", input: { a: 1 } });
    expect(result.data).toEqual({ explanation: "shared goals" });
    expect(result.model).toBe("meta-models/muse-spark-open-1026");
    expect(seen).toHaveLength(1);
    expect(seen[0].url).toBe("https://x.example/v1/chat/completions");
    expect(seen[0].body["model"]).toBe("meta-models/muse-spark-open-1026");
  });

  it("captures provider reasoning traces when present", async () => {
    setEnv({ MUSE_OPEN_API_URL: "https://x.example/v1", MUSE_OPEN_API_KEY: "k" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonRes({ choices: [{ message: { content: '{"ok":true}', reasoning_content: "trace…" } }] }),
      ),
    );
    const result = await runOpenTask({ task: "match_explain", input: {} });
    expect(result.data).toEqual({ ok: true });
    expect(result.reasoning).toBe("trace…");
  });

  it("rejects unregistered tasks without calling the network", async () => {
    setEnv({ MUSE_OPEN_API_URL: "https://x.example/v1", MUSE_OPEN_API_KEY: "k" });
    const fetchSpy = vi.fn(async () => jsonRes({}));
    vi.stubGlobal("fetch", fetchSpy);
    const result = await runOpenTask({ task: "nope", input: {} });
    expect(result.error).toMatch(/not registered/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("surfaces provider HTTP errors without throwing", async () => {
    setEnv({ MUSE_OPEN_API_URL: "https://x.example/v1", MUSE_OPEN_API_KEY: "k" });
    vi.stubGlobal("fetch", vi.fn(async () => jsonRes({ error: { message: "busy" } }, 500)));
    const result = await runOpenTask({ task: "match_explain", input: {} });
    expect(result.data).toBeUndefined();
    expect(result.error).toBe("busy");
  });
});

describe("callMuseSpark open-weights routing", () => {
  it("routes gated tasks to the open endpoint and reports its model", async () => {
    setEnv({
      MUSE_OPEN_API_URL: "https://x.example/v1",
      MUSE_OPEN_API_KEY: "k",
      MUSE_OPEN_MATCH: "1",
    });
    const seen: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        seen.push(url);
        return jsonRes({ choices: [{ message: { content: '{"explanation":"x"}' } }] });
      }),
    );
    const result = await callMuseSpark({ task: "match_explain", input: {} });
    expect(result.data).toEqual({ explanation: "x" });
    expect(result.model).toBe("meta-models/muse-spark-open-1026");
    expect(seen).toEqual(["https://x.example/v1/chat/completions"]);
  });

  it("falls back to Spark when the open endpoint fails", async () => {
    setEnv({
      MUSE_SPARK_API_URL: "https://api.meta.ai/v1",
      MUSE_SPARK_API_KEY: "s",
      MUSE_OPEN_API_URL: "https://x.example/v1",
      MUSE_OPEN_API_KEY: "k",
      MUSE_OPEN_MATCH: "1",
    });
    const seen: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        seen.push(url);
        if (url.startsWith("https://x.example")) return jsonRes({ error: { message: "down" } }, 500);
        return jsonRes({ choices: [{ message: { content: '{"notes":{}}' } }] });
      }),
    );
    const result = await callMuseSpark({ task: "match_score", input: {} });
    expect(result.data).toEqual({ notes: {} });
    expect(result.model).toBe("muse-spark-1.3");
    expect(seen).toHaveLength(2);
  });

  it("leaves ungated tasks on the Spark path untouched", async () => {
    setEnv({
      MUSE_SPARK_API_URL: "https://api.meta.ai/v1",
      MUSE_SPARK_API_KEY: "s",
      MUSE_OPEN_API_URL: "https://x.example/v1",
      MUSE_OPEN_API_KEY: "k",
      MUSE_OPEN_MATCH: "1",
    });
    const seen: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        seen.push(url);
        return jsonRes({ choices: [{ message: { content: '{"a":1}' } }] });
      }),
    );
    const result = await callMuseSpark({ task: "project_analysis", input: {} });
    expect(result.data).toEqual({ a: 1 });
    expect(result.model).toBe("muse-spark-1.3");
    expect(seen).toEqual(["https://api.meta.ai/v1/chat/completions"]);
  });
});
