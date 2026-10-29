import { aiSparkConfigured, aiVoiceConfigured } from "./config";

/**
 * Muse Spark (structured AI processing) and Muse Voice (transcription).
 *
 * These clients call the configured service endpoints only. When credentials
 * are missing they report `configured: false` and callers must surface a
 * "pending integration" state — never a fabricated AI result.
 */

export interface SparkRequest {
  task: "profile_interpret" | "match_score" | "project_analysis" | "parse_document" | "interpret_action";
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

export interface VoiceResponse {
  configured: boolean;
  pendingReason?: string;
  transcript?: string;
  error?: string;
}

export async function transcribeWithMuseVoice(audio: Blob): Promise<VoiceResponse> {
  if (!aiVoiceConfigured()) {
    return { configured: false, pendingReason: "Muse Voice is not configured" };
  }
  try {
    const form = new FormData();
    form.append("audio", audio, "instruction.webm");
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
