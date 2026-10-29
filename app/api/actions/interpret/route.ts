import { z } from "zod";
import { callMuseSpark, transcribeWithMuseVoice } from "@/lib/ai";
import { apiError, apiOk } from "@/lib/api-response";
import { getSession } from "@/lib/session";

const proposalSchema = z.object({
  kind: z.enum(["message", "profile_update", "reminder", "workflow"]),
  title: z.string().min(3).max(200),
  payload: z.record(z.string(), z.unknown()),
  scheduledFor: z.string().optional(),
  timezone: z.string().optional(),
});

/**
 * Interpret a voice or text instruction into a structured action proposal.
 * The user reviews and confirms before anything is scheduled.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);

  const contentType = req.headers.get("content-type") ?? "";
  let instruction = "";

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const audio = form.get("audio");
    if (!(audio instanceof Blob)) return apiError("No audio provided.", 400);
    const result = await transcribeWithMuseVoice(audio);
    if (!result.configured) {
      return apiOk({ pending: true, pendingReason: result.pendingReason });
    }
    if (!result.transcript) {
      return apiError(result.error ?? "Transcription failed.", 502);
    }
    instruction = result.transcript;
  } else {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return apiError("Invalid request body.");
    }
    const parsed = z.object({ text: z.string().min(1).max(4000) }).safeParse(body);
    if (!parsed.success) return apiError("Describe the instruction first.", 400);
    instruction = parsed.data.text;
  }

  const spark = await callMuseSpark({
    task: "interpret_action",
    input: { instruction, now: new Date().toISOString() },
    schemaHint:
      "{ kind: message|profile_update|reminder|workflow, title, payload, scheduledFor?: ISO datetime, timezone?: IANA name }",
  });
  if (!spark.configured) {
    return apiOk({ pending: true, pendingReason: spark.pendingReason, transcript: instruction });
  }
  if (spark.error || !spark.data) {
    return apiError(spark.error ?? "Interpretation failed.", 502);
  }
  const proposal = proposalSchema.safeParse(spark.data);
  if (!proposal.success) {
    return apiError("The assistant returned an unusable proposal. Fill the form manually.", 502);
  }
  return apiOk({ pending: false, transcript: instruction, proposal: proposal.data });
}
