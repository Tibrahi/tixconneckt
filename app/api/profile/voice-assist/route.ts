import { z } from "zod";
import { callMuseSpark, transcribeWithMuseVoice } from "@/lib/ai";
import { apiError, apiOk } from "@/lib/api-response";
import { getSession } from "@/lib/session";
import { normalizeProfileProposal, profileProposalSchema } from "@/lib/validation";
import { retainVoiceAudio } from "@/lib/voice-capture";
import { rateLimit } from "@/lib/rate-limit";
import { PROFILE_PROPOSAL_OUTPUT_SCHEMA } from "@/lib/validation";

const textProposalSchema = z.object({ text: z.string().min(1).max(8000) });

/**
 * Voice/text profile assistant: transcribes spoken input and proposes field
 * values. The user reviews everything before saving — nothing is persisted here.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const rl = await rateLimit("profile-ai-assist", session.user.id, 20, "10 m");
  if (!rl.allowed) return apiError("Too many profile assistant requests. Please try again shortly.", 429);

  const contentType = req.headers.get("content-type") ?? "";
  let sourceText = "";
  let audioMeta: { audioRetained: boolean; audioNote?: string } | undefined;

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const audio = form.get("audio");
    if (!(audio instanceof Blob)) return apiError("No audio provided.", 400);
    const file = new File([audio], (audio as File).name || (audio.type.includes("wav") ? "profile.wav" : "profile.webm"), {
      type: audio.type || "audio/webm",
    });
    const retained = await retainVoiceAudio(session.user.id, "profile", file);
    audioMeta = { audioRetained: retained.retained, audioNote: retained.problem };
    const result = await transcribeWithMuseVoice(file, file.name);
    if (!result.configured) {
      return apiOk({
        pending: true,
        pendingReason: result.pendingReason,
        ...audioMeta,
      });
    }
    if (!result.transcript) {
      return apiError(result.error ?? "Transcription failed.", 502);
    }
    sourceText = result.transcript;
  } else {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return apiError("Invalid request body.");
    }
    const parsed = textProposalSchema.safeParse(body);
    if (!parsed.success) return apiError("Provide text to interpret.", 400);
    sourceText = parsed.data.text;
  }

  if (sourceText.length > 8000) {
    return apiError("The interpreted text is too long. Keep it under 8,000 characters and try again.", 400);
  }

  const spark = await callMuseSpark({
    task: "profile_interpret",
    input: { text: sourceText },
    schemaHint: "Return only explicitly stated profile fields using canonical field names. Allowed fields: name, phone, country, countryCode, educationLevel, objectives, major, skills[], strengths[], fields[], bio, location, githubUrl. Do not guess any value.",
    outputSchema: PROFILE_PROPOSAL_OUTPUT_SCHEMA,
  });
  if (!spark.configured) {
    return apiOk({ pending: true, pendingReason: spark.pendingReason, transcript: sourceText, ...audioMeta });
  }
  if (spark.error || !spark.data) {
    return apiOk({ pending: true, pendingReason: spark.error ?? "Interpretation failed.", transcript: sourceText, ...audioMeta });
  }

  // Map the AI proposal onto canonical fields, then validate — untrusted
  // until it passes the schema. Unknown mappings stay out for manual review.
  const normalized = normalizeProfileProposal(spark.data);
  if (Object.keys(normalized).length === 0) {
    return apiOk({ pending: true, pendingReason: "No profile fields were stated clearly. Review the transcript and enter the values manually.", transcript: sourceText, ...audioMeta });
  }
  const proposal = profileProposalSchema.safeParse(normalized);
  if (!proposal.success) {
    return apiOk({ pending: true, pendingReason: "The parsed fields did not pass profile validation. Review the transcript and enter the values manually.", transcript: sourceText, ...audioMeta });
  }
  return apiOk({ pending: false, transcript: sourceText, proposal: proposal.data, ...audioMeta });
}
