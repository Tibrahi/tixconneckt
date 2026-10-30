import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { groupMembers, groups } from "@/db/schema";
import { apiError, apiOk } from "@/lib/api-response";
import { notify } from "@/lib/notify";
import { getSession } from "@/lib/session";

const joinSchema = z.object({ message: z.string().trim().max(2000).optional() });

/**
 * Ask to join a group. Creates a pending membership the admins decide on —
 * the requester sees their own pending state, nothing else.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const { id } = await params;
  const db = getDb();
  const [group] = await db.select().from(groups).where(eq(groups.id, id)).limit(1);
  if (!group) return apiError("Group not found.", 404);

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    // message is optional
  }
  const parsed = joinSchema.safeParse(body);
  if (!parsed.success) return apiError("Invalid request.", 400);

  const [existing] = await db
    .select()
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, id), eq(groupMembers.userId, session.user.id)))
    .limit(1);
  if (existing?.status === "active") return apiError("You are already a member.", 400);
  if (existing?.status === "pending") return apiOk({ pending: true });

  await db
    .insert(groupMembers)
    .values({ groupId: id, userId: session.user.id, role: "member", status: "pending" })
    .onConflictDoUpdate({
      target: [groupMembers.groupId, groupMembers.userId],
      set: { status: "pending", role: "member" },
    });

  const admins = await db
    .select({ userId: groupMembers.userId })
    .from(groupMembers)
    .where(
      and(eq(groupMembers.groupId, id), eq(groupMembers.status, "active"), eq(groupMembers.role, "admin")),
    )
    .limit(50);
  for (const admin of admins) {
    await notify({
      userId: admin.userId,
      type: "group",
      title: "New join request",
      body: `${session.user.name} asked to join "${group.name}".${parsed.data.message ? ` "${parsed.data.message}"` : ""}`,
      resourceType: "group",
      resourceId: id,
    });
  }
  return apiOk({ pending: true }, 201);
}
