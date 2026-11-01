import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { messages } from "@/db/schema";
import { apiError, apiOk } from "@/lib/api-response";
import { requireConversationMembership } from "@/lib/chat";
import { rateLimit } from "@/lib/rate-limit";
import { emitToRoom } from "@/lib/realtime";
import { getSession } from "@/lib/session";

type RouteContext = { params: Promise<{ id: string; messageId: string }> };

/**
 * Device-delivery beacon: when a member's device receives a message, it
 * POSTs here so the sender's Sent state upgrades to Delivered. Ephemeral
 * (never persisted) — unlike message:read it fires without opening the
 * thread. Senders cannot beacon their own messages.
 */
export async function POST(_req: Request, { params }: RouteContext) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const rl = await rateLimit("message-delivered", session.user.id, 120, "1 m");
  if (!rl.allowed) return apiOk({ throttled: true });

  const { id, messageId } = await params;
  const membership = await requireConversationMembership(id, session.user.id);
  if (!membership) return apiError("You are not a member of this conversation.", 403);

  const db = getDb();
  const [message] = await db
    .select({ id: messages.id, senderId: messages.senderId })
    .from(messages)
    .where(and(eq(messages.id, messageId), eq(messages.conversationId, id)))
    .limit(1);
  if (!message) return apiError("Message not found.", 404);
  if (!message.senderId || message.senderId === session.user.id) {
    return apiOk({ delivered: false });
  }

  const live = await emitToRoom(`private:conversation:${id}`, "message:delivered", {
    id: message.id,
    conversationId: id,
    userId: session.user.id,
  });
  return apiOk({ delivered: live });
}
