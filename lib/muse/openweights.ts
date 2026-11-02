import "server-only";
import { joinApiPath } from "./endpoints";
import { instructionFor } from "./spark";

/**
 * Meta open-weights models (Muse Spark Open / Glimmer) via partner inference
 * (Baseten, Modal, Fireworks) — OpenAI-compatible Chat Completions.
 *
 * Opt-in per feature: only tasks gated by `shouldUseOpenWeights` run here,
 * and only when `MUSE_OPEN_API_URL` + `MUSE_OPEN_API_KEY` are configured.
 * Callers fall back to Muse Spark on any failure, so an unconfigured or
 * unhealthy partner endpoint never breaks the feature — same philosophy as
 * the rest of this codebase (explicit states, never fabricated results).
 *
 * Set MUSE_OPEN_API_URL to the partner's OpenAI-compatible base (e.g.
 * `https://inference.baseten.co/v1`) or the full chat-completions URL;
 * overlap is collapsed the same way as the Spark endpoint resolver.
 */

export interface OpenTaskResult {
  data?: unknown;
  error?: string;
  model: string;
  /** Provider-supplied reasoning trace, when the endpoint returns one. */
  reasoning?: string;
}

function openBase(): string | null {
  const raw = process.env.MUSE_OPEN_API_URL ?? "";
  return raw.trim() ? raw.trim().replace(/\/+$/, "") : null;
}

/** `POST …/v1/chat/completions` on the partner base, or null when unconfigured. */
export function openChatEndpoint(): string | null {
  const base = openBase();
  if (!base) return null;
  return joinApiPath(base, "/v1/chat/completions");
}

/**
 * Hackathon default per the event's Baseten docs (`meta-models/muse-spark-open-1026`);
 * override per deployment with MUSE_OPEN_MODEL (Modal/Fireworks use their own IDs).
 */
export function openWeightsModel(): string {
  return process.env.MUSE_OPEN_MODEL?.trim() || "meta-models/muse-spark-open-1026";
}

export function openWeightsConfigured(): boolean {
  return Boolean((process.env.MUSE_OPEN_API_URL ?? "").trim() && (process.env.MUSE_OPEN_API_KEY ?? "").trim());
}

/**
 * Tasks currently served by the open-weights endpoint. Deliberately narrow:
 * matching assistance only, behind an explicit flag so the demo stays stable.
 */
export function shouldUseOpenWeights(task: string): boolean {
  if (process.env.MUSE_OPEN_MATCH !== "1") return false;
  if (!openWeightsConfigured()) return false;
  return task === "match_explain" || task === "match_score";
}

interface OpenChatResponse {
  choices?: Array<{
    message?: { content?: string | null; reasoning_content?: string | null; reasoning?: string | null };
  }>;
  error?: { message?: string };
}

/** Run one structured task on the open-weights endpoint. Input must already be validated + size-bounded. */
export async function runOpenTask(request: {
  task: string;
  input: unknown;
  schemaHint?: string;
}): Promise<OpenTaskResult> {
  const url = openChatEndpoint();
  const key = process.env.MUSE_OPEN_API_KEY;
  const model = openWeightsModel();
  if (!url || !key) {
    return { model, error: "Open-weights inference is not configured" };
  }
  const taskInstruction = instructionFor(request.task);
  if (!taskInstruction) {
    return { model, error: "This assistant task is not registered. Choose a supported task and retry." };
  }
  const system =
    `${taskInstruction} Respond with a single JSON object and nothing else.` +
    (request.schemaHint ? ` Shape: ${request.schemaHint}` : "");
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: JSON.stringify(request.input) },
        ],
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(90000),
    });
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "TimeoutError";
    console.error("[muse:openweights]", timedOut ? "request timed out" : error instanceof Error ? error.message : error);
    return { model, error: timedOut ? "The assistant timed out. You can retry safely." : "The assistant could not be reached. You can retry safely." };
  }
  if (!res.ok) {
    let detail: string | undefined;
    try {
      const body = (await res.json()) as OpenChatResponse;
      detail = body.error?.message;
    } catch {
      /* non-JSON error body */
    }
    console.error("[muse:openweights]", `HTTP ${res.status}`, detail ?? "");
    return { model, error: detail || `The assistant returned an error (HTTP ${res.status}). You can retry safely.` };
  }
  let content: string | null | undefined;
  let reasoning: string | undefined;
  try {
    const body = (await res.json()) as OpenChatResponse;
    const message = body.choices?.[0]?.message;
    content = message?.content;
    reasoning = message?.reasoning_content ?? message?.reasoning ?? undefined;
  } catch {
    return { model, error: "The assistant returned an unusable result." };
  }
  if (!content) return { model, error: "The assistant returned an empty result." };
  try {
    const data = JSON.parse(content) as unknown;
    return reasoning ? { model, data, reasoning } : { model, data };
  } catch {
    return { model, error: "The assistant returned an unusable result." };
  }
}
