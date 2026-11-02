import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { callParticipants, calls, users } from "@/db/schema";
import { apiError, apiOk } from "@/lib/api-response";
import { resolveCallDecision, type CallActor, type CallStatus } from "@/lib/calls";
import { postSystemMessage } from "@/lib/chat";
import { notify } from "@/lib/notify";
import { rateLimit } from "@/lib/rate-limit";
import { emitToRoom } from "@/lib/realtime";
import { getSession } from "@/lib/session";
import { callDecisionSchema } from "@/lib/validation";
import { loadParticipantCall } from "./_lib";

type RouteContext = { params: Promise<{ id: string }> };

/** Accept, decline, or end a call. Every transition is persisted + emitted. */
export async function PATCH(req: Request, { params }: RouteContext) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const rl = await rateLimit("call-decide", session.user.id, 30, "1 m");
  if (!rl.allowed) return apiError("Too many call actions. Please wait a moment.", 429);

  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body.");
  }
  const parsed = callDecisionSchema.safeParse(body);
  if (!parsed.success) return apiError("Invalid call action.", 400);

  const call = await loadParticipantCall(id, session.user.id);
  if (!call) return apiError("Call not found.", 404);

  const db = getDb();
  const participants = await db.select().from(callParticipants).where(eq(callParticipants.callId, id));
  const isGroupCall = participants.length > 2;
  if (isGroupCall) {
    const participant = participants.find((row) => row.userId === session.user.id);
    if (!participant) return apiError("You are not a participant in this call.", 403);
    const now = new Date();
    if (parsed.data.decision === "accepted") {
      if (participant.status === "declined" || participant.status === "left" || call.status === "ended") {
        return apiError("This call is no longer available.", 409);
      }
      await db.update(callParticipants).set({ status: "accepted", joinedAt: now, leftAt: null })
        .where(eq(callParticipants.id, participant.id));
      await db.update(calls).set({ status: "accepted", answeredAt: call.answeredAt ?? now, endedAt: null })
        .where(eq(calls.id, id));
      if (session.user.id !== call.callerId) {
        await emitToRoom(`private:user:${call.callerId}`, "call:accept", { callId: id, userId: session.user.id });
      }
      return apiOk({ status: "accepted" });
    }

    if (parsed.data.decision === "declined") {
      await db.update(callParticipants).set({ status: "declined", leftAt: now })
        .where(eq(callParticipants.id, participant.id));
      if (session.user.id !== call.callerId) {
        await emitToRoom(`private:user:${call.callerId}`, "call:reject", { callId: id, userId: session.user.id });
      }
      const remaining = participants.filter((row) => row.userId !== session.user.id && row.status === "invited");
      const accepted = participants.some((row) => row.userId !== session.user.id && row.status === "accepted");
      if (remaining.length === 0 && !accepted) {
        await db.update(calls).set({ status: "declined", endedAt: now }).where(eq(calls.id, id));
      }
      return apiOk({ status: "declined" });
    }

    if (parsed.data.decision === "ended" || parsed.data.decision === "failed") {
      await db.update(callParticipants).set({ status: "left", leftAt: now })
        .where(eq(callParticipants.id, participant.id));
      if (session.user.id === call.callerId) {
        await db.update(calls).set({ status: parsed.data.decision, endedAt: now })
          .where(eq(calls.id, id));
        await Promise.all(participants.filter((row) => row.userId !== session.user.id).map((row) =>
          emitToRoom(`private:user:${row.userId}`, "call:end", { callId: id, status: parsed.data.decision }),
        ));
        await postSystemMessage(call.conversationId, `${call.kind === "video" ? "Video" : "Audio"} group call ended`, {
          event: "call_ended", callId: id, kind: call.kind,
        });
        return apiOk({ status: parsed.data.decision });
      }
      await Promise.all(participants.filter((row) => row.userId !== session.user.id && row.status === "accepted").map((row) =>
        emitToRoom(`private:user:${row.userId}`, "call:participant-left", { callId: id, userId: session.user.id }),
      ));
      return apiOk({ status: "left" });
    }
    return apiError("This action is unavailable for a group call.", 400);
  }

  const actor: CallActor = call.callerId === session.user.id ? "caller" : "callee";
  const outcome = resolveCallDecision(call.status as CallStatus, parsed.data.decision, actor);
  if ("error" in outcome) return apiError(outcome.error, 409);

  const now = new Date();
  await db
    .update(calls)
    .set({
      status: outcome.status,
      answeredAt: outcome.status === "accepted" ? now : call.answeredAt,
      endedAt: outcome.status === "accepted" ? null : now,
      ...(outcome.status === "failed"
        ? { failureReason: parsed.data.reason?.slice(0, 200) || "Call connection failed." }
        : {}),
    })
    .where(eq(calls.id, id));

  const otherId = actor === "caller" ? call.calleeId : call.callerId;
  await emitToRoom(`private:user:${otherId}`, outcome.event, {
    callId: call.id,
    status: outcome.status,
  });

  const [caller] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, call.callerId))
    .limit(1);
  const callerName = caller?.name ?? "A connection";

  if (outcome.notifyMissed) {
    await notify({
      userId: call.calleeId,
      type: "call",
      title: "Missed call",
      body: `You missed a ${call.kind} call from ${callerName}.`,
      resourceType: "conversation",
      resourceId: call.conversationId,
    });
  }

  // Deliberate, documented export: a typed system marker (kind "system",
  // never an ordinary message) links the conversation to the call record.
  // The authoritative history lives in the separate calls API + Calls tab.
  if (outcome.status === "missed" || outcome.status === "declined" || outcome.status === "ended" || outcome.status === "failed") {
    const label =
      outcome.status === "missed"
        ? `Missed ${call.kind} call from ${callerName}`
        : outcome.status === "declined"
          ? `${callerName}'s ${call.kind} call was declined`
          : outcome.status === "failed"
            ? `${call.kind === "video" ? "Video" : "Audio"} call failed to connect`
            : `${call.kind === "video" ? "Video" : "Audio"} call ended`;
    await postSystemMessage(call.conversationId, label, {
      event: `call_${outcome.status}`,
      callId: call.id,
      kind: call.kind,
    });
  }

  return apiOk({ status: outcome.status });
}
