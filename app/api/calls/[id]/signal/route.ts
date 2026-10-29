import { apiError, apiOk } from "@/lib/api-response";
import { rateLimit } from "@/lib/rate-limit";
import { emitToRoom } from "@/lib/realtime";
import { getSession } from "@/lib/session";
import { callSignalSchema } from "@/lib/validation";
import { loadParticipantCall } from "../_lib";

/**
 * Relay a validated WebRTC signaling payload (offer/answer/ICE) to the
 * other call party over their personal realtime room. Signaling only —
 * media never touches our servers.
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
  const relayed = await emitToRoom(`user:${otherId}`, "call:signal", {
    callId: call.id,
    from: session.user.id,
    signal: parsed.data,
  });
  return apiOk({ relayed });
}
