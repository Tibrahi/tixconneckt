import { aiSparkConfigured, aiVoiceConfigured } from "./config";
import { sparkModel } from "./muse/endpoints";
import { openWeightsModel, runOpenTask, shouldUseOpenWeights } from "./muse/openweights";
import { runSparkTask } from "./muse/spark";
import { transcribeFile, type VoiceMode, type VoiceTurn } from "./muse/voice";
import { parseWavHeader, transcribableWavProblem } from "./muse/wav";
import { validateFieldValue } from "./flexible-records";

/**
 * Muse Spark (structured AI processing) and Muse Voice (transcription)
 * behind the Meta Model API (dev.meta.ai) — Chat Completions for Spark,
 * multipart file upload for Voice.
 *
 * Transport lives in lib/muse/*. These facades keep the historic
 * call/validate shapes so every existing caller keeps working: when
 * credentials are missing they report `configured: false` and callers
 * surface a "pending integration" state — never a fabricated AI result.
 */

export interface SparkRequest {
  /** Dynamic task id (see AI_TASKS) or a legacy fixed task name. */
  task: string;
  input: unknown;
  schemaHint?: string;
  /** Optional provider-enforced JSON Schema for tasks with a fixed contract. */
  outputSchema?: Record<string, unknown>;
}

export interface SparkResponse {
  configured: boolean;
  pendingReason?: string;
  data?: unknown;
  error?: string;
  model?: string;
  /** Open-weights reasoning trace, when the endpoint returned one. */
  reasoning?: string;
}

export async function callMuseSpark(request: SparkRequest): Promise<SparkResponse> {
  // Gated open-weights path (matching tasks only): on success the actual
  // model id is reported; on failure we fall through to Muse Spark so a
  // partner outage never breaks the feature.
  if (shouldUseOpenWeights(request.task)) {
    const open = await runOpenTask(request);
    if (!open.error && open.data !== undefined) {
      return { configured: true, data: open.data, model: open.model, ...(open.reasoning ? { reasoning: open.reasoning } : {}) };
    }
    const openError = open.error ?? "Open-weights request failed";
    console.error("[muse:openweights] falling back to Spark:", openError);
    if (!aiSparkConfigured()) {
      return { configured: true, error: openError, model: openWeightsModel() };
    }
  } else if (!aiSparkConfigured()) {
    return { configured: false, pendingReason: "Muse Spark is not configured" };
  }
  const result = await runSparkTask(request);
  if (result.error || result.data === undefined) {
    return { configured: true, error: result.error ?? "AI request failed", model: result.model };
  }
  return { configured: true, data: result.data, model: result.model };
}

/** The model id actually used for Spark tasks (for run provenance). */
export function sparkModelId(): string {
  return sparkModel();
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
  turns?: VoiceTurn[];
  error?: string;
}

export interface VoiceTranscribeOptions {
  mode?: VoiceMode;
  languageBias?: string[];
  keywords?: string[];
}

/** Voice tasks the configured service can actually perform. */
export function voiceTaskSupported(task: string): boolean {
  return task === "transcribe";
}

/**
 * Transcribe mono 16-bit PCM WAV at 16/24 kHz. Callers capture in any
 * browser format but MUST convert first (lib/audio-convert) — anything
 * else is rejected with an actionable error, never silently mis-sent.
 */
export async function transcribeWithMuseVoice(
  audio: Blob,
  filename = "instruction.wav",
  options: VoiceTranscribeOptions = {},
): Promise<VoiceResponse> {
  if (!aiVoiceConfigured()) {
    return { configured: false, pendingReason: "Muse Voice is not configured" };
  }
  const bytes = new Uint8Array(await audio.arrayBuffer());
  const info = parseWavHeader(bytes);
  const problem = transcribableWavProblem(info);
  if (problem) {
    return {
      configured: true,
      error: `${problem} Convert the recording to mono 16-bit WAV at 24 kHz first.`,
    };
  }
  const result = await transcribeFile(audio, filename, options);
  if (!result.transcript) {
    return { configured: true, error: result.error ?? "Transcription failed." };
  }
  return { configured: true, transcript: result.transcript, turns: result.turns ?? [] };
}
