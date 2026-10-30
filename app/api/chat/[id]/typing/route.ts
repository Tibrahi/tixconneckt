import { apiError, apiOk } from "@/lib/api-response";
import { requireConversationMembership } from "@/lib/chat";
import { rateLimit } from "@/lib/rate-limit";
import { emitToRoom } from "@/lib/realtime";
import { getSession } from "@/lib/session";

/**
 * Typing indicator relay: membership-checked, ephemeral (never persisted).
 * Clients throttle calls and expire the indicator locally.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const rl = await rateLimit("typing", session.user.id, 120, "1 m");
  if (!rl.allowed) return apiOk({ throttled: true });

  const { id } = await params;
  const membership = await requireConversationMembership(id, session.user.id);
  if (!membership) return apiError("You are not a member of this conversation.", 403);

  const live = await emitToRoom(`conversation:${id}`, "typing", {
    conversationId: id,
    userId: session.user.id,
    name: session.user.name,
  });
  return apiOk({ live });
}
