import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { messageReactions, messages } from "@/db/schema";
import { apiError, apiOk } from "@/lib/api-response";
import { requireConversationMembership } from "@/lib/chat";
import { rateLimit } from "@/lib/rate-limit";
import { emitToRoom } from "@/lib/realtime";
import { getSession } from "@/lib/session";
import { chatReactionSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string; messageId: string }> };

/**
 * Toggle my emoji reaction: adds it, or removes it when already present.
 * The unique constraint prevents duplicate identical reactions; the change
 * is emitted live with fresh totals.
 */
export async function POST(req: Request, { params }: RouteContext) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const rl = await rateLimit("reaction", session.user.id, 120, "1 m");
  if (!rl.allowed) return apiError("Too many reactions. Slow down a moment.", 429);

  const { id, messageId } = await params;
  const membership = await requireConversationMembership(id, session.user.id);
  if (!membership) return apiError("You are not a member of this conversation.", 403);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body.");
  }
  const parsed = chatReactionSchema.safeParse(body);
  if (!parsed.success) return apiError("Reactions must be a single emoji.", 400);

  const db = getDb();
  const [message] = await db
    .select({ id: messages.id, deletedAt: messages.deletedAt })
    .from(messages)
    .where(and(eq(messages.id, messageId), eq(messages.conversationId, id)))
    .limit(1);
  if (!message) return apiError("Message not found.", 404);
  if (message.deletedAt) return apiError("Deleted messages cannot receive reactions.", 400);

  const [existing] = await db
    .select({ id: messageReactions.id })
    .from(messageReactions)
    .where(
      and(
        eq(messageReactions.messageId, messageId),
        eq(messageReactions.userId, session.user.id),
        eq(messageReactions.emoji, parsed.data.emoji),
      ),
    )
    .limit(1);

  let reacted: boolean;
  if (existing) {
    await db.delete(messageReactions).where(eq(messageReactions.id, existing.id));
    reacted = false;
  } else {
    await db
      .insert(messageReactions)
      .values({ messageId, userId: session.user.id, emoji: parsed.data.emoji })
      .onConflictDoNothing();
    reacted = true;
  }

  const totals = await db
    .select({ emoji: messageReactions.emoji, userId: messageReactions.userId })
    .from(messageReactions)
    .where(eq(messageReactions.messageId, messageId));
  const grouped = new Map<string, { count: number; mine: boolean }>();
  for (const row of totals) {
    const entry = grouped.get(row.emoji) ?? { count: 0, mine: false };
    entry.count += 1;
    if (row.userId === session.user.id) entry.mine = true;
    grouped.set(row.emoji, entry);
  }

  await emitToRoom(`conversation:${id}`, "reaction:changed", {
    messageId,
    conversationId: id,
    reactions: [...grouped.entries()].map(([emoji, v]) => ({ emoji, ...v })),
  });
  return apiOk({ reacted });
}
