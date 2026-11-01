import { and, count, desc, eq, inArray, or } from "drizzle-orm";
import { getDb } from "@/db";
import { groupMembers, projects, users } from "@/db/schema";
import { apiError, apiOk } from "@/lib/api-response";
import { hasSuperAccess } from "@/lib/entitlements";
import {
  validateDocSize,
  validateFieldName,
  validateFieldValue,
} from "@/lib/flexible-records";
import { getSession } from "@/lib/session";
import { requireCapability } from "@/lib/roles";
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
  const access = await requireCapability("project.create");
  if (access.response) return access.response;
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

  for (const [key, value] of Object.entries(parsed.data.attributes)) {
    const nameProblem = validateFieldName(key);
    if (nameProblem) return apiError(`Invalid field "${key}": ${nameProblem}`, 400);
    const valueProblem = validateFieldValue(value, 0);
    if (valueProblem) return apiError(`Invalid value for "${key}": ${valueProblem}`, 400);
  }
  const attrSizeProblem = validateDocSize(parsed.data.attributes);
  if (attrSizeProblem) return apiError(attrSizeProblem, 400);

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

  // Keep the project and its required root folder atomic. Otherwise a folder
  // insert failure leaves a project the workspace cannot open correctly.
  const { projectFolders, projectMembers } = await import("@/db/schema");
  const created = await db.transaction(async (tx) => {
    const [project] = await tx
      .insert(projects)
      .values({
        ownerId: session.user.id,
        groupId: parsed.data.groupId,
        title: parsed.data.title,
        summary: parsed.data.summary,
        details: parsed.data.details,
        visibility: parsed.data.visibility,
        attributes: parsed.data.attributes,
      })
      .returning({ id: projects.id });
    await tx.insert(projectFolders).values({
      projectId: project.id,
      parentFolderId: null,
      name: parsed.data.title,
      createdBy: session.user.id,
    });
    return project;
  });

  // Invite collaborators and emit notifications after the project is durable.
  // Invites run concurrently and a single invite/notification failure must
  // never fail the whole request: the project already exists, so a 500 here
  // only produces duplicate projects when the user retries.
  const { logActivity } = await import("@/lib/project-access");
  const { notify } = await import("@/lib/notify");
  const invited: string[] = [];
  // Small batches: concurrent enough to avoid stacked SMTP latencies, small
  // enough to never pressure the database pool.
  const pending = [...parsed.data.collaborators];
  while (pending.length > 0) {
    const batch = pending.splice(0, 5);
    const results = await Promise.allSettled(
      batch.map(async (c) => {
        const [user] = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.shortId, c.shortId))
          .limit(1);
        if (!user || user.id === session.user.id) return null;
        await db
          .insert(projectMembers)
          .values({ projectId: created.id, userId: user.id, role: c.role })
          .onConflictDoNothing();
        await notify({
          userId: user.id,
          type: "project",
          title: "Added to a project",
          body: `${session.user.name} invited you to "${parsed.data.title}" as ${c.role}.`,
          resourceType: "project",
          resourceId: created.id,
        });
        return user.id;
      }),
    );
    for (const result of results) {
      if (result.status === "fulfilled" && result.value) invited.push(result.value);
      else if (result.status === "rejected") {
        console.error(
          `[projects:invite] invite failed for project ${created.id}: ${
            result.reason instanceof Error ? result.reason.message : String(result.reason)
          }`,
        );
      }
    }
  }
  await logActivity(created.id, session.user.id, "project.created", "project", created.id, {
    title: parsed.data.title,
    invited: invited.length,
  });
  return apiOk({ projectId: created.id }, 201);
}
