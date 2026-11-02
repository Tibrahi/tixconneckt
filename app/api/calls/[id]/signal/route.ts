import { apiError, apiOk } from "@/lib/api-response";
import { rateLimit } from "@/lib/rate-limit";
import { emitToRoom } from "@/lib/realtime";
import { getSession } from "@/lib/session";
import { callSignalSchema } from "@/lib/validation";
import { getCallParticipantIds, loadParticipantCall } from "../_lib";

/**
 * Relay a validated WebRTC signaling payload to the other call party over
 * their personal Ably channel. Signaling only — media never touches our
 * servers. Each payload kind maps to its own event (chat2.md Phase 5):
 * offer → webrtc:offer, answer → webrtc:answer, ICE → webrtc:ice-candidate,
 * mute/camera toggles → call:media-state.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const rl = await rateLimit("call-signal", session.user.id, 120, "1 m");
  if (!rl.allowed) return apiError("Too many signaling messages. The call may be unstable.", 429);

  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body.");
  }
  const parsed = callSignalSchema.safeParse(body);
  if (!parsed.success) return apiError("Invalid signaling payload.", 400);

  const call = await loadParticipantCall(id, session.user.id);
  if (!call) return apiError("Call not found.", 404);
  if (call.status !== "ringing" && call.status !== "accepted") {
    return apiError("This call already finished.", 410);
  }

  const signal = parsed.data;
  const participantIds = await getCallParticipantIds(call.id);
  const targets = participantIds.filter((participantId) => participantId !== session.user.id);
  if (signal.kind === "media-state" && !signal.toUserId) {
    const relayed = await Promise.all(targets.map((otherId) => emitToRoom(`private:user:${otherId}`, "call:media-state", {
      callId: call.id,
      from: session.user.id,
      to: otherId,
      muted: signal.muted,
      cameraOff: signal.cameraOff,
    })));
    return apiOk({ relayed: relayed.some(Boolean), recipients: relayed.length });
  }
  const otherId = signal.toUserId ?? (targets.length === 1 ? targets[0] : null);
  if (!otherId || !targets.includes(otherId)) return apiError("Choose another participant in this call.", 400);
  const event =
    signal.kind === "offer"
      ? "webrtc:offer"
      : signal.kind === "answer"
        ? "webrtc:answer"
        : signal.kind === "candidate"
          ? "webrtc:ice-candidate"
          : "call:media-state";
  const relayed = await emitToRoom(`private:user:${otherId}`, event, {
    callId: call.id,
    from: session.user.id,
    to: otherId,
    ...(signal.kind === "offer" || signal.kind === "answer" ? { sdp: signal.sdp } : {}),
    ...(signal.kind === "candidate"
      ? { candidate: signal.candidate, sdpMid: signal.sdpMid, sdpMLineIndex: signal.sdpMLineIndex }
      : {}),
    ...(signal.kind === "media-state" ? { muted: signal.muted, cameraOff: signal.cameraOff } : {}),
  });
  return apiOk({ relayed });
}
