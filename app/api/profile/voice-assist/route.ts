import { z } from "zod";
import { callMuseSpark, transcribeWithMuseVoice } from "@/lib/ai";
import { apiError, apiOk } from "@/lib/api-response";
import { getSession } from "@/lib/session";
import { profileUpdateSchema } from "@/lib/validation";
import { retainVoiceAudio } from "@/lib/voice-capture";

const textProposalSchema = z.object({ text: z.string().min(1).max(8000) });

/**
 * Voice/text profile assistant: transcribes spoken input and proposes field
 * values. The user reviews everything before saving — nothing is persisted here.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);

  const contentType = req.headers.get("content-type") ?? "";
  let sourceText = "";

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const audio = form.get("audio");
    if (!(audio instanceof Blob)) return apiError("No audio provided.", 400);
    const file = new File([audio], (audio as File).name || "profile.webm", {
      type: audio.type || "audio/webm",
    });
    const retained = await retainVoiceAudio(session.user.id, "profile", file);
    const result = await transcribeWithMuseVoice(file, file.name);
    if (!result.configured) {
      return apiOk({
        pending: true,
        pendingReason: result.pendingReason,
        audioRetained: retained.retained,
        audioNote: retained.problem,
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

  const spark = await callMuseSpark({
    task: "profile_interpret",
    input: { text: sourceText },
    schemaHint: "profileUpdate fields: educationLevel, objectives, major, skills[], strengths[], fields[], bio, location",
  });
  if (!spark.configured) {
    return apiOk({ pending: true, pendingReason: spark.pendingReason, transcript: sourceText });
  }
  if (spark.error || !spark.data) {
    return apiError(spark.error ?? "Interpretation failed.", 502);
  }

  // Validate the AI proposal — untrusted until it passes the schema.
  const proposal = profileUpdateSchema.safeParse(spark.data);
  if (!proposal.success) {
    return apiError("The assistant returned an unusable proposal. Please edit the fields manually.", 502);
  }
  return apiOk({ pending: false, transcript: sourceText, proposal: proposal.data });
}
