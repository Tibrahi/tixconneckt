import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import {
  conversationMembers,
  conversations,
  groupMembers,
  groups,
  users,
} from "@/db/schema";
import { apiError, apiOk } from "@/lib/api-response";
import { postSystemMessage } from "@/lib/chat";
import { notify } from "@/lib/notify";
import { emitToRoom } from "@/lib/realtime";
import { getSession } from "@/lib/session";

const decisionSchema = z.object({
  userId: z.string().min(1),
  decision: z.enum(["approved", "rejected"]),
});

/** Pending join requests — group admins only. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const { id } = await params;
  const db = getDb();
  const [mine] = await db
    .select()
    .from(groupMembers)
    .where(
      and(
        eq(groupMembers.groupId, id),
        eq(groupMembers.userId, session.user.id),
        eq(groupMembers.status, "active"),
        eq(groupMembers.role, "admin"),
      ),
    )
    .limit(1);
  if (!mine) return apiError("Only group admins can see join requests.", 403);

  const pending = await db
    .select({
      userId: groupMembers.userId,
      joinedAt: groupMembers.joinedAt,
      name: users.name,
      shortId: users.shortId,
    })
    .from(groupMembers)
    .innerJoin(users, eq(users.id, groupMembers.userId))
    .where(and(eq(groupMembers.groupId, id), eq(groupMembers.status, "pending")))
    .limit(100);
  return apiOk({ pending });
}

/** Admin approves or rejects a join request. Approval syncs the group chat. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body.");
  }
  const parsed = decisionSchema.safeParse(body);
  if (!parsed.success) return apiError("Invalid decision.", 400);

  const db = getDb();
  const [mine] = await db
    .select()
    .from(groupMembers)
    .where(
      and(
        eq(groupMembers.groupId, id),
        eq(groupMembers.userId, session.user.id),
        eq(groupMembers.status, "active"),
        eq(groupMembers.role, "admin"),
      ),
    )
    .limit(1);
  if (!mine) return apiError("Only group admins can decide join requests.", 403);

  const [pending] = await db
    .select()
    .from(groupMembers)
    .where(
      and(
        eq(groupMembers.groupId, id),
        eq(groupMembers.userId, parsed.data.userId),
        eq(groupMembers.status, "pending"),
      ),
    )
    .limit(1);
  if (!pending) return apiError("Join request not found.", 404);

  const [group] = await db.select().from(groups).where(eq(groups.id, id)).limit(1);
  if (parsed.data.decision === "approved") {
    await db
      .update(groupMembers)
      .set({ status: "active", joinedAt: new Date() })
      .where(eq(groupMembers.id, pending.id));

    const [user] = await db.select({ name: users.name }).from(users).where(eq(users.id, pending.userId)).limit(1);
    const [groupConv] = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(and(eq(conversations.type, "group"), eq(conversations.groupId, id)))
      .limit(1);
    if (groupConv) {
      await db
        .insert(conversationMembers)
        .values({ conversationId: groupConv.id, userId: pending.userId, role: "member" })
        .onConflictDoNothing();
      await postSystemMessage(groupConv.id, `${user?.name ?? "A member"} joined the group.`, {
        event: "member_joined",
        userId: pending.userId,
      });
    }
    await emitToRoom(`group:${id}`, "group:members", {});
  } else {
    await db.delete(groupMembers).where(eq(groupMembers.id, pending.id));
  }

  await notify({
    userId: pending.userId,
    type: "group",
    title:
      parsed.data.decision === "approved" ? `Welcome to "${group?.name ?? "the group"}"` : "Join request declined",
    body:
      parsed.data.decision === "approved"
        ? "Your request to join was approved."
        : `Your request to join "${group?.name ?? "the group"}" was declined.`,
    resourceType: "group",
    resourceId: id,
  });
  return apiOk({ decided: parsed.data.decision });
}
