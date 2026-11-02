import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { callInterpretations, callTranscripts, users } from "@/db/schema";
import { callMuseSpark, sparkModelId, validateSparkJson } from "@/lib/ai";
import { apiError, apiOk } from "@/lib/api-response";
import { buildDialogue } from "@/lib/call-transcript";
import { rateLimit } from "@/lib/rate-limit";
import { emitToRoom } from "@/lib/realtime";
import { getSession } from "@/lib/session";
import { getCallParticipantIds, loadParticipantCall } from "../../_lib";

type RouteContext = { params: Promise<{ id: string }> };

/** Cap input size so one interpretation stays inside model context. */
const MAX_SEGMENTS_PER_RUN = 200;

/**
 * Interpret a call transcript collectively. Any participant may run it; the
 * full saved dialogue (every speaker together, C1/C2/… labeled) goes to
 * Muse Spark, and the structured result is STORED with the call — the next
 * reader retrieves it from the database instead of recomputing it.
 */
export async function POST(_req: Request, { params }: RouteContext) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const rl = await rateLimit("call-interpret", session.user.id, 10, "10 m");
  if (!rl.allowed) return apiError("Too many interpretation requests. Please try again shortly.", 429);

  const { id } = await params;
  const call = await loadParticipantCall(id, session.user.id);
  if (!call) return apiError("Call not found.", 404);

  const db = getDb();
  const segments = await db
    .select({
      segmentIndex: callTranscripts.segmentIndex,
      speaker: callTranscripts.speaker,
      text: callTranscripts.text,
      final: callTranscripts.final,
    })
    .from(callTranscripts)
    .where(eq(callTranscripts.callId, id))
    .orderBy(callTranscripts.segmentIndex)
    .limit(MAX_SEGMENTS_PER_RUN);
  const usable = segments.filter((s) => s.final && s.text.trim());
  if (usable.length === 0) {
    return apiError("No transcript saved for this call yet.", 404);
  }

  const participantIds = await getCallParticipantIds(id);
  const knownIds = [...new Set([...participantIds, call.callerId, call.calleeId].filter(Boolean))] as string[];
  const people = knownIds.length
    ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, knownIds))
    : [];
  const nameBySpeaker: Record<string, string> = {};
  for (const person of people) nameBySpeaker[person.id] = person.name;
  const dialogue = buildDialogue(usable, nameBySpeaker);

  const spark = await callMuseSpark({
    task: "call_interpret",
    input: {
      lines: dialogue.map((line) => ({
        who: line.who,
        name: line.name,
        text: line.text,
      })),
    },
  });
  if (!spark.configured) {
    return apiOk({ pending: true, pendingReason: spark.pendingReason ?? "Muse Spark is not configured" });
  }
  if (spark.error || spark.data === undefined) {
    return apiError(spark.error ?? "The assistant failed. You can retry safely.", 502);
  }
  const validated = validateSparkJson(spark.data);
  if (!validated.ok) {
    return apiError(validated.error, 502);
  }

  const [row] = await db
    .insert(callInterpretations)
    .values({
      callId: id,
      result: validated.doc,
      model: spark.model ?? sparkModelId(),
      segmentCount: usable.length,
      createdBy: session.user.id,
    })
    .returning({
      id: callInterpretations.id,
      result: callInterpretations.result,
      model: callInterpretations.model,
      segmentCount: callInterpretations.segmentCount,
      createdBy: callInterpretations.createdBy,
      createdAt: callInterpretations.createdAt,
    });

  await Promise.all(
    participantIds
      .filter((userId) => userId !== session.user.id)
      .map((userId) => emitToRoom(`private:user:${userId}`, "call:transcript-interpreted", { callId: id })),
  );

  return apiOk({ interpretation: row }, 201);
}
