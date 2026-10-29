import { and, count, desc, eq, inArray, or } from "drizzle-orm";
import { getDb } from "@/db";
import { groupMembers, projects, users } from "@/db/schema";
import { apiError, apiOk } from "@/lib/api-response";
import { hasSuperAccess } from "@/lib/entitlements";
import { getSession } from "@/lib/session";
import { projectSubmitSchema } from "@/lib/validation";

/** Project feed with backend-enforced visibility (never leak private projects). */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const url = new URL(req.url);
  const mineOnly = url.searchParams.get("mine") === "1";
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const pageSize = Math.min(30, Math.max(1, Number(url.searchParams.get("pageSize") ?? 12)));
  const db = getDb();
  const userId = session.user.id;
  const isAdmin = session.user.role === "admin";
  const superAccess = isAdmin || (await hasSuperAccess(userId));

  const memberships = await db
    .select({ groupId: groupMembers.groupId })
    .from(groupMembers)
    .where(and(eq(groupMembers.userId, userId), eq(groupMembers.status, "active")));
  const myGroupIds = memberships.map((m) => m.groupId);

  // Visibility rule (server-side):
  // - public: everyone
  // - private: owner, group members, super subscribers, admins
  const visibilityFilter = superAccess
    ? undefined
    : or(
        eq(projects.visibility, "public"),
        eq(projects.ownerId, userId),
        myGroupIds.length > 0 ? inArray(projects.groupId, myGroupIds) : undefined,
      );

  const filter = and(
    mineOnly ? eq(projects.ownerId, userId) : undefined,
    visibilityFilter,
  );

  const items = await db
    .select({
      id: projects.id,
      ownerId: projects.ownerId,
      ownerName: users.name,
      ownerShortId: users.shortId,
      title: projects.title,
      summary: projects.summary,
      visibility: projects.visibility,
      stage: projects.stage,
      createdAt: projects.createdAt,
      updatedAt: projects.updatedAt,
    })
    .from(projects)
    .innerJoin(users, eq(users.id, projects.ownerId))
    .where(filter)
    .orderBy(desc(projects.updatedAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  const [total] = await db.select({ n: count() }).from(projects).where(filter);

  return apiOk({ items, page, pageSize, total: total?.n ?? 0 });
}

/** Submit an idea. Private visibility requires Super access (backend-enforced). */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body.");
  }
  const parsed = projectSubmitSchema.safeParse(body);
  if (!parsed.success) return apiError("Give your idea a title and a detailed summary.", 400);

  if (parsed.data.visibility === "private") {
    const allowed = session.user.role === "admin" || (await hasSuperAccess(session.user.id));
    if (!allowed) {
      return apiError("Private projects require a Super plan.", 403);
    }
  }

  const db = getDb();
  if (parsed.data.groupId) {
    const [member] = await db
      .select()
      .from(groupMembers)
      .where(
        and(
          eq(groupMembers.groupId, parsed.data.groupId),
          eq(groupMembers.userId, session.user.id),
          eq(groupMembers.status, "active"),
        ),
      )
      .limit(1);
    if (!member) return apiError("You are not a member of this group.", 403);
  }

  const [created] = await db
    .insert(projects)
    .values({
      ownerId: session.user.id,
      groupId: parsed.data.groupId,
      title: parsed.data.title,
      summary: parsed.data.summary,
      details: parsed.data.details,
      visibility: parsed.data.visibility,
    })
    .returning({ id: projects.id });
  return apiOk({ projectId: created.id }, 201);
}
