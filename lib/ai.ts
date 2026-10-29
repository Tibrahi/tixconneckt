import { aiSparkConfigured, aiVoiceConfigured } from "./config";
import { validateFieldValue } from "./flexible-records";

/**
 * Muse Spark (structured AI processing) and Muse Voice (transcription).
 *
 * These clients call the configured service endpoints only. When credentials
 * are missing they report `configured: false` and callers must surface a
 * "pending integration" state — never a fabricated AI result.
 *
 * Task inputs are dynamic (see lib/ai-tasks.ts): each request carries the
 * task id plus the actually-collected input. Outputs are validated as
 * generic JSON and persisted to JSONB by the caller — no hardcoded output
 * schema is assumed here.
 */

export interface SparkRequest {
  /** Dynamic task id (see AI_TASKS) or a legacy fixed task name. */
  task: string;
  input: unknown;
  schemaHint?: string;
}

export interface SparkResponse {
  configured: boolean;
  pendingReason?: string;
  data?: unknown;
  error?: string;
}

export async function callMuseSpark(request: SparkRequest): Promise<SparkResponse> {
  if (!aiSparkConfigured()) {
    return { configured: false, pendingReason: "Muse Spark is not configured" };
  }
  try {
    const res = await fetch(`${process.env.MUSE_SPARK_API_URL}/v1/process`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.MUSE_SPARK_API_KEY}`,
      },
      body: JSON.stringify(request),
    });
    if (!res.ok) {
      return { configured: true, error: `Muse Spark returned HTTP ${res.status}` };
    }
    const data: unknown = await res.json();
    return { configured: true, data };
  } catch (error) {
    return {
      configured: true,
      error: error instanceof Error ? error.message : "Muse Spark request failed",
    };
  }
}

/**
 * Validate an AI-produced JSON payload before persistence: plain object,
 * bounded size/depth, no prototype-pollution keys. The structure itself is
 * preserved as returned — unknown fields are kept, not discarded.
 */
export function validateSparkJson(data: unknown): { ok: true; doc: Record<string, unknown> } | { ok: false; error: string } {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return { ok: false, error: "The assistant returned an unusable result." };
  }
  const problem = validateFieldValue(data, 0);
  if (problem) return { ok: false, error: `The assistant returned an unusable result: ${problem}` };
  return { ok: true, doc: data as Record<string, unknown> };
}

export interface VoiceResponse {
  configured: boolean;
  pendingReason?: string;
  transcript?: string;
  error?: string;
}

/** Voice tasks the configured service can actually perform. */
export function voiceTaskSupported(task: string): boolean {
  return task === "transcribe";
}

export async function transcribeWithMuseVoice(
  audio: Blob,
  filename = "instruction.webm",
): Promise<VoiceResponse> {
  if (!aiVoiceConfigured()) {
    return { configured: false, pendingReason: "Muse Voice is not configured" };
  }
  try {
    const form = new FormData();
    form.append("audio", audio, filename);
    const res = await fetch(`${process.env.MUSE_VOICE_API_URL}/v1/transcribe`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.MUSE_VOICE_API_KEY}` },
      body: form,
    });
    if (!res.ok) {
      return { configured: true, error: `Muse Voice returned HTTP ${res.status}` };
    }
    const data = (await res.json()) as { transcript?: string };
    if (!data.transcript) {
      return { configured: true, error: "Muse Voice returned no transcript" };
    }
    return { configured: true, transcript: data.transcript };
  } catch (error) {
    return {
      configured: true,
      error: error instanceof Error ? error.message : "Muse Voice request failed",
    };
  }
}
