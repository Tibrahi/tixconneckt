import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { groupMembers, groups, users } from "@/db/schema";
import { apiError, apiOk, clientIp } from "@/lib/api-response";
import { audit } from "@/lib/audit";
import { getSession } from "@/lib/session";
import { groupCreateSchema, shortIdSchema } from "@/lib/validation";
import { notify } from "@/lib/notify";

/** Groups the current user belongs to. */
export async function GET() {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const db = getDb();
  const rows = await db
    .select({
      id: groups.id,
      name: groups.name,
      description: groups.description,
      objective: groups.objective,
      ownerId: groups.ownerId,
      createdAt: groups.createdAt,
      role: groupMembers.role,
    })
    .from(groupMembers)
    .innerJoin(groups, eq(groups.id, groupMembers.groupId))
    .where(and(eq(groupMembers.userId, session.user.id), eq(groupMembers.status, "active")))
    .orderBy(desc(groups.createdAt))
    .limit(100);
  return apiOk(rows);
}

/** Create a group; the creator becomes admin. Invited IDs join as active members. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body.");
  }
  const parsed = groupCreateSchema.safeParse(body);
  if (!parsed.success) return apiError("Provide a group name.", 400);

  const db = getDb();
  const groupId = crypto.randomUUID();
  await db.batch([
    db.insert(groups).values({
      id: groupId,
      name: parsed.data.name,
      description: parsed.data.description,
      objective: parsed.data.objective,
      ownerId: session.user.id,
    }),
    db.insert(groupMembers).values({
      groupId,
      userId: session.user.id,
      role: "admin",
      status: "active",
    }),
  ]);

  const skipped: string[] = [];
  const inviteIds = new Set<string>();
  for (const shortId of parsed.data.memberShortIds ?? []) {
    const result = shortIdSchema.safeParse(shortId.toUpperCase());
    if (result.success) inviteIds.add(result.data);
    else skipped.push(shortId);
  }

  const invitedUsers = inviteIds.size
    ? await db
        .select({ id: users.id, shortId: users.shortId, email: users.email })
        .from(users)
        .where(and(inArray(users.shortId, [...inviteIds]), eq(users.status, "active")))
    : [];
  const invitedById = new Map(invitedUsers.map((user) => [user.shortId, user]));
  const membersToAdd = [...inviteIds]
    .map((shortId) => invitedById.get(shortId))
    .filter((user): user is (typeof invitedUsers)[number] => Boolean(user && user.id !== session.user.id));
  for (const shortId of inviteIds) {
    const user = invitedById.get(shortId);
    if (!user || user.id === session.user.id) skipped.push(shortId);
  }

  if (membersToAdd.length > 0) {
    await db
      .insert(groupMembers)
      .values(membersToAdd.map((user) => ({
        groupId,
        userId: user.id,
        role: "member",
        status: "active",
      })))
      .onConflictDoNothing();
    await Promise.allSettled(
      membersToAdd.map((user) => notify({
        userId: user.id,
        type: "group",
        title: `Added to group ${parsed.data.name}`,
        body: `${session.user.name} added you to a group.`,
        resourceType: "group",
        resourceId: groupId,
        emailTo: user.email,
      })),
    );
  }

  await audit({ actorId: session.user.id, action: "group.create", targetType: "group", targetId: groupId, ipAddress: clientIp(req) });
  return apiOk({ groupId, skipped }, 201);
}
