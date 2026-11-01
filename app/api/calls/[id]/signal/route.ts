import { apiError, apiOk } from "@/lib/api-response";
import { rateLimit } from "@/lib/rate-limit";
import { emitToRoom } from "@/lib/realtime";
import { getSession } from "@/lib/session";
import { callSignalSchema } from "@/lib/validation";
import { loadParticipantCall } from "../_lib";

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

  const otherId = call.callerId === session.user.id ? call.calleeId : call.callerId;
  const signal = parsed.data;
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
    ...(signal.kind === "offer" || signal.kind === "answer" ? { sdp: signal.sdp } : {}),
    ...(signal.kind === "candidate"
      ? { candidate: signal.candidate, sdpMid: signal.sdpMid, sdpMLineIndex: signal.sdpMLineIndex }
      : {}),
    ...(signal.kind === "media-state" ? { muted: signal.muted, cameraOff: signal.cameraOff } : {}),
  });
  return apiOk({ relayed });
}
