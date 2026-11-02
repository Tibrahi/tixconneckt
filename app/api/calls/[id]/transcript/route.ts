import { count, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { callTranscripts } from "@/db/schema";
import { apiError, apiOk, clientIp } from "@/lib/api-response";
import { audit } from "@/lib/audit";
import { transcriptionActive } from "@/lib/call-transcript";
import { emitToRoom } from "@/lib/realtime";
import { getSession } from "@/lib/session";
import { callTranscriptSegmentsSchema } from "@/lib/validation";
import { getCallParticipantIds, loadParticipantCall } from "../_lib";
import { loadCallConsents } from "./_lib";

type RouteContext = { params: Promise<{ id: string }> };

/** Max persisted segments per call — history stays bounded. */
const MAX_SEGMENTS_PER_CALL = 2000;

/**
 * Read a call transcript. Participants only; segments are text-only and
 * carry speaker attribution solely when the diarization path supplied it.
 */
export async function GET(_req: Request, { params }: RouteContext) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const { id } = await params;
  const call = await loadParticipantCall(id, session.user.id);
  if (!call) return apiError("Call not found.", 404);

  const db = getDb();
  const [consents, segments, participantIds] = await Promise.all([
    loadCallConsents(id),
    db
      .select({
        segmentIndex: callTranscripts.segmentIndex,
        speaker: callTranscripts.speaker,
        text: callTranscripts.text,
        final: callTranscripts.final,
        turnId: callTranscripts.turnId,
      })
      .from(callTranscripts)
      .where(eq(callTranscripts.callId, id))
      .orderBy(callTranscripts.segmentIndex)
      .limit(MAX_SEGMENTS_PER_CALL),
    getCallParticipantIds(id),
  ]);
  return apiOk({
    segments,
    active: transcriptionActive(consents, participantIds.length ? participantIds : [call.callerId, call.calleeId]),
    mineConsented: consents.find((consent) => consent.userId === session.user.id)?.consented ?? false,
    peerConsented: consents.some((consent) => consent.userId !== session.user.id && consent.consented),
    consents: consents.map((c) => ({ userId: c.userId, consented: c.consented, updatedAt: c.updatedAt })),
  });
}

/**
 * Persist transcript segments. Requires active two-party consent — when
 * either participant has disabled transcription this returns 409 and stores
 * nothing. segmentIndex is the idempotency key: reconnects and duplicate
 * deliveries overwrite the same index instead of duplicating history.
 */
export async function POST(req: Request, { params }: RouteContext) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const { id } = await params;
  const call = await loadParticipantCall(id, session.user.id);
  if (!call) return apiError("Call not found.", 404);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body.");
  }
  const parsed = callTranscriptSegmentsSchema.safeParse(body);
  if (!parsed.success) return apiError("Invalid transcript segments.", 400);

  const consents = await loadCallConsents(id);
  const participantIds = await getCallParticipantIds(id);
  if (!transcriptionActive(consents, participantIds.length ? participantIds : [call.callerId, call.calleeId])) {
    return apiError("Transcription is off for this call. Every participant must consent before segments can be saved.", 409);
  }

  const db = getDb();
  const [existing] = await db
    .select({ n: count() })
    .from(callTranscripts)
    .where(eq(callTranscripts.callId, id));
  const room = MAX_SEGMENTS_PER_CALL - (existing?.n ?? 0);
  const accepted = parsed.data.segments.slice(0, Math.max(0, room));
  if (accepted.length === 0) {
    return apiError("This transcript has reached its size limit.", 400);
  }

  for (const segment of accepted) {
    await db
      .insert(callTranscripts)
      .values({
        callId: id,
        segmentIndex: segment.segmentIndex,
        speaker: segment.speaker ?? null,
        text: segment.text,
        final: segment.final,
        turnId: segment.turnId ?? null,
      })
      .onConflictDoUpdate({
        target: [callTranscripts.callId, callTranscripts.segmentIndex],
        set: {
          speaker: segment.speaker ?? null,
          text: segment.text,
          final: segment.final,
          turnId: segment.turnId ?? null,
        },
      });
  }

  await Promise.all(participantIds.filter((userId) => userId !== session.user.id).map((userId) =>
    emitToRoom(`private:user:${userId}`, "call:transcript", { callId: id, count: accepted.length }),
  ));

  return apiOk({ saved: accepted.length, truncated: accepted.length < parsed.data.segments.length });
}

/**
 * Delete a call transcript. Either participant may delete the whole
 * transcript; the call record itself is untouched.
 */
export async function DELETE(req: Request, { params }: RouteContext) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const { id } = await params;
  const call = await loadParticipantCall(id, session.user.id);
  if (!call) return apiError("Call not found.", 404);

  const db = getDb();
  await db.delete(callTranscripts).where(eq(callTranscripts.callId, id));
  await audit({
    actorId: session.user.id,
    action: "call.transcript.delete",
    targetType: "call",
    targetId: id,
    ipAddress: clientIp(req),
  });

  const participantIds = await getCallParticipantIds(id);
  await Promise.all(participantIds.filter((userId) => userId !== session.user.id).map((userId) =>
    emitToRoom(`private:user:${userId}`, "call:transcript-deleted", { callId: id }),
  ));
  return apiOk({ deleted: true });
}
