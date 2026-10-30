import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { conversationMembers, conversations } from "@/db/schema";
import { z } from "zod";
import { callMuseSpark, transcribeWithMuseVoice } from "@/lib/ai";
import { interpretLocally } from "@/lib/action-interpret";
import { isValidTimezone } from "@/lib/action-policy";
import { apiError, apiOk } from "@/lib/api-response";
import { getSession } from "@/lib/session";
import { rateLimit } from "@/lib/rate-limit";
import { retainVoiceAudio } from "@/lib/voice-capture";

const proposalSchema = z.object({
  kind: z.enum(["message", "profile_update", "reminder", "workflow"]),
  title: z.string().min(3).max(200),
  payload: z.record(z.string(), z.unknown()),
  scheduledFor: z.string().optional(),
  timezone: z.string().optional(),
});

/**
 * Interpret a voice or text instruction into a structured action proposal.
 * Muse Spark first; the deterministic local interpreter whenever Spark is
 * unavailable or fails — the user reviews and confirms either way before
 * anything is scheduled.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const rl = await rateLimit("interpret", session.user.id, 30, "1 h");
  if (!rl.allowed) return apiError("Too many interpretations. Please try again later.", 429);

  const contentType = req.headers.get("content-type") ?? "";
  let instruction = "";
  let audioRetained: boolean | undefined;
  let audioNote: string | undefined;
  let timezone = "UTC";

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const audio = form.get("audio");
    if (!(audio instanceof Blob)) return apiError("No audio provided.", 400);
    const tz = form.get("timezone");
    if (typeof tz === "string" && isValidTimezone(tz)) timezone = tz;
    const file = new File([audio], (audio as File).name || "instruction.webm", {
      type: audio.type || "audio/webm",
    });
    const retained = await retainVoiceAudio(session.user.id, "chat", file);
    audioRetained = retained.retained;
    audioNote = retained.problem;
    const result = await transcribeWithMuseVoice(file, file.name);
    if (!result.configured) {
      return apiOk({ pending: true, pendingReason: result.pendingReason, audioRetained, audioNote });
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
    const parsed = z
      .object({ text: z.string().min(1).max(4000), timezone: z.string().max(80).optional() })
      .safeParse(body);
    if (!parsed.success) return apiError("Describe the instruction first.", 400);
    instruction = parsed.data.text;
    if (parsed.data.timezone && isValidTimezone(parsed.data.timezone)) {
      timezone = parsed.data.timezone;
    }
  }

  const spark = await callMuseSpark({
    task: "interpret_action",
    input: { instruction, now: new Date().toISOString() },
    schemaHint:
      "{ kind: message|profile_update|reminder|workflow, title, payload, scheduledFor?: ISO datetime, timezone?: IANA name }",
  });
  if (spark.configured && !spark.error && spark.data) {
    const proposal = proposalSchema.safeParse(spark.data);
    if (proposal.success) {
      return apiOk({
        pending: false,
        local: false,
        transcript: instruction,
        proposal: proposal.data,
        audioRetained,
        audioNote,
      });
    }
  }

  // Local fallback: deterministic parsing, no AI required.
  const db = getDb();
  const convos = await db
    .select({ id: conversations.id, title: conversations.title, type: conversations.type })
    .from(conversationMembers)
    .innerJoin(conversations, eq(conversations.id, conversationMembers.conversationId))
    .where(
      and(
        eq(conversationMembers.userId, session.user.id),
      ),
    )
    .orderBy(desc(conversations.updatedAt))
    .limit(50);
  const local = interpretLocally(instruction, {
    now: new Date(),
    timezone,
    conversations: convos.map((c) => ({
      id: c.id,
      title: c.title ?? `${c.type} conversation`,
    })),
  });
  if (!local) {
    return apiOk({
      pending: true,
      pendingReason:
        "This instruction was not recognized. Fill the form manually — for example: “Remind me to call the group tomorrow at 9am”.",
      transcript: instruction,
      audioRetained,
      audioNote,
    });
  }
  return apiOk({
    pending: false,
    local: true,
    transcript: instruction,
    proposal: {
      kind: local.kind,
      title: local.title,
      payload: local.payload,
      scheduledFor: local.scheduledFor,
      timezone: local.timezone,
    },
    confidence: local.confidence,
    notes: local.notes,
    audioRetained,
    audioNote,
  });
}
