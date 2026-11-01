import { getDb } from "@/db";
import { callTranscriptConsents } from "@/db/schema";
import { apiError, apiOk, clientIp } from "@/lib/api-response";
import { audit } from "@/lib/audit";
import { transcriptionActive } from "@/lib/call-transcript";
import { rateLimit } from "@/lib/rate-limit";
import { emitToRoom } from "@/lib/realtime";
import { getSession } from "@/lib/session";
import { callTranscriptConsentSchema } from "@/lib/validation";
import { loadParticipantCall } from "../../_lib";
import { loadCallConsents } from "../_lib";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Toggle this participant's transcription consent. Transcription runs only
 * while BOTH participants consent; disabling stops further persistence at
 * once. Already-saved segments stay visible until either participant
 * deletes the transcript. Every change is audited and signaled to the
 * other participant so consent state is never one-sided or silent.
 */
export async function PATCH(req: Request, { params }: RouteContext) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const rl = await rateLimit("call-consent", session.user.id, 30, "1 m");
  if (!rl.allowed) return apiError("Too many consent changes. Please wait a moment.", 429);

  const { id } = await params;
  const call = await loadParticipantCall(id, session.user.id);
  if (!call) return apiError("Call not found.", 404);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body.");
  }
  const parsed = callTranscriptConsentSchema.safeParse(body);
  if (!parsed.success) return apiError("Invalid consent value.", 400);

  const db = getDb();
  await db
    .insert(callTranscriptConsents)
    .values({ callId: id, userId: session.user.id, consented: parsed.data.consented })
    .onConflictDoUpdate({
      target: [callTranscriptConsents.callId, callTranscriptConsents.userId],
      set: { consented: parsed.data.consented, updatedAt: new Date() },
    });

  const consents = await loadCallConsents(id);
  const active = transcriptionActive(consents, [call.callerId, call.calleeId]);

  await audit({
    actorId: session.user.id,
    action: parsed.data.consented ? "call.transcript.consent.on" : "call.transcript.consent.off",
    targetType: "call",
    targetId: id,
    ipAddress: clientIp(req),
  });

  const otherId = session.user.id === call.callerId ? call.calleeId : call.callerId;
  await emitToRoom(`private:user:${otherId}`, "call:transcript-consent", {
    callId: id,
    userId: session.user.id,
    consented: parsed.data.consented,
    active,
  });

  return apiOk({ consented: parsed.data.consented, active });
}
