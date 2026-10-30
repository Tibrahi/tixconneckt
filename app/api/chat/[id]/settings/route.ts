import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { conversationMembers } from "@/db/schema";
import { apiError, apiOk } from "@/lib/api-response";
import { normalizeSettings, requireConversationMembership } from "@/lib/chat";
import { emitToRoom } from "@/lib/realtime";
import { getSession } from "@/lib/session";
import { chatSettingsSchema } from "@/lib/validation";

/**
 * Update my per-conversation settings (mute, pin, archive). These affect
 * only my own view and notifications — never other members.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const { id } = await params;
  const membership = await requireConversationMembership(id, session.user.id);
  if (!membership) return apiError("You are not a member of this conversation.", 403);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body.");
  }
  const parsed = chatSettingsSchema.safeParse(body);
  if (!parsed.success) return apiError("Invalid settings.", 400);

  const settings = normalizeSettings(membership.settings, parsed.data);
  const db = getDb();
  await db
    .update(conversationMembers)
    .set({ settings })
    .where(
      and(
        eq(conversationMembers.conversationId, id),
        eq(conversationMembers.userId, session.user.id),
      ),
    );
  await emitToRoom(`user:${session.user.id}`, "conversation:updated", {
    conversationId: id,
    settings,
  });
  return apiOk({ settings });
}
