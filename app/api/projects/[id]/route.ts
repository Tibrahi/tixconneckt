import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import {
  groupMembers,
  projectAnalyses,
  projectContributions,
  projectReactions,
  projectReplies,
  projects,
  users,
} from "@/db/schema";
import { callMuseSpark, validateSparkJson } from "@/lib/ai";
import { apiError, apiOk } from "@/lib/api-response";
import { hasSuperAccess } from "@/lib/entitlements";
import {
  applyDocUpdate,
  validateDocSize,
  validateFieldPath,
  validateFieldValue,
} from "@/lib/flexible-records";
import { notify } from "@/lib/notify";
import { getSession } from "@/lib/session";
import { sanitizeHtml } from "@/lib/sanitize";
import { contributionSchema, replySchema } from "@/lib/validation";

type Db = ReturnType<typeof getDb>;

async function canView(db: Db, project: typeof projects.$inferSelect, userId: string, role: string): Promise<boolean> {
  if (project.visibility === "public") return true;
  if (role === "admin" || project.ownerId === userId) return true;
  if (await hasSuperAccess(userId)) return true;
  if (project.groupId) {
    const [member] = await db
      .select({ id: groupMembers.id })
      .from(groupMembers)
      .where(
        and(
          eq(groupMembers.groupId, project.groupId),
          eq(groupMembers.userId, userId),
          eq(groupMembers.status, "active"),
        ),
      )
      .limit(1);
    if (member) return true;
  }
  return false;
}

/** Project detail: contributions, replies, reactions, analysis versions. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const { id } = await params;
  const db = getDb();
  const [project] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  if (!project) return apiError("Project not found.", 404);
  if (!(await canView(db, project, session.user.id, session.user.role))) {
    return apiError("You do not have access to this private project.", 403);
  }

  const contribs = await db
    .select({
      id: projectContributions.id,
      body: projectContributions.body,
      createdAt: projectContributions.createdAt,
      authorName: users.name,
      authorShortId: users.shortId,
    })
    .from(projectContributions)
    .innerJoin(users, eq(users.id, projectContributions.authorId))
    .where(eq(projectContributions.projectId, id))
    .orderBy(desc(projectContributions.createdAt))
    .limit(100);

  const replies = await db
    .select({
      id: projectReplies.id,
      contributionId: projectReplies.contributionId,
      body: projectReplies.body,
      createdAt: projectReplies.createdAt,
      authorName: users.name,
    })
    .from(projectReplies)
    .innerJoin(users, eq(users.id, projectReplies.authorId))
    .where(
      and(
        // replies for this project's contributions
        contribs.length > 0
          ? (await import("drizzle-orm")).inArray(
              projectReplies.contributionId,
              contribs.map((c) => c.id),
            )
          : eq(projectReplies.id, "__none__"),
      ),
    )
    .limit(300);

  const reactions = await db
    .select({ userId: projectReactions.userId })
    .from(projectReactions)
    .where(eq(projectReactions.projectId, id))
    .limit(1000);
  const liked = reactions.some((r) => r.userId === session.user.id);

  const analyses = await db
    .select()
    .from(projectAnalyses)
    .where(eq(projectAnalyses.projectId, id))
    .orderBy(desc(projectAnalyses.version))
    .limit(20);

  const [owner] = await db
    .select({ name: users.name, shortId: users.shortId })
    .from(users)
    .where(eq(users.id, project.ownerId))
    .limit(1);

  return apiOk({
    project,
    owner,
    contributions: contribs.map((c) => ({
      ...c,
      body: sanitizeHtml(c.body),
      replies: replies.filter((r) => r.contributionId === c.id).map((r) => ({ ...r, body: sanitizeHtml(r.body) })),
    })),
    reactionCount: reactions.length,
    liked,
    analyses,
    canEdit: project.ownerId === session.user.id || session.user.role === "admin",
  });
}

/** Add a structured contribution (original ideas are always preserved). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body.");
  }
  const parsed = contributionSchema.safeParse({ ...(body as object), projectId: id });
  if (!parsed.success) return apiError("Write your contribution first.", 400);

  const db = getDb();
  const [project] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  if (!project) return apiError("Project not found.", 404);
  if (!(await canView(db, project, session.user.id, session.user.role))) {
    return apiError("You do not have access to this project.", 403);
  }

  const [created] = await db
    .insert(projectContributions)
    .values({ projectId: id, authorId: session.user.id, body: parsed.data.body.slice(0, 8000) })
    .returning({ id: projectContributions.id });

  if (project.ownerId !== session.user.id) {
    await notify({
      userId: project.ownerId,
      type: "project",
      title: "New contribution to your project",
      body: `${session.user.name} contributed to "${project.title}".`,
      resourceType: "project",
      resourceId: id,
    });
  }
  return apiOk({ contributionId: created.id }, 201);
}

const actionSchema = z.object({
  action: z.enum(["reply", "react", "analyze", "restage", "update_attributes", "update_settings"]),
  contributionId: z.string().min(1).optional(),
  body: z.string().trim().max(4000).optional(),
  stage: z.enum(["idea", "developing", "funded", "completed", "archived"]).optional(),
  title: z.string().trim().min(4).max(200).optional(),
  summary: z.string().trim().min(20).max(8000).optional(),
  visibility: z.enum(["public", "private"]).optional(),
  set: z.record(z.string(), z.unknown()).optional(),
  remove: z.array(z.string().min(1).max(256)).max(100).optional(),
});

/** Reply, like/unlike, request AI analysis (versioned), or change stage. */
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
  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) return apiError("Invalid action.", 400);

  const db = getDb();
  const [project] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  if (!project) return apiError("Project not found.", 404);
  if (!(await canView(db, project, session.user.id, session.user.role))) {
    return apiError("You do not have access to this project.", 403);
  }

  if (parsed.data.action === "reply") {
    const reply = replySchema.safeParse({ contributionId: parsed.data.contributionId, body: parsed.data.body });
    if (!reply.success) return apiError("Write your reply first.", 400);
    const [created] = await db
      .insert(projectReplies)
      .values({ contributionId: reply.data.contributionId, authorId: session.user.id, body: reply.data.body })
      .returning({ id: projectReplies.id });
    return apiOk({ replyId: created.id }, 201);
  }

  if (parsed.data.action === "react") {
    const [existing] = await db
      .select()
      .from(projectReactions)
      .where(and(eq(projectReactions.projectId, id), eq(projectReactions.userId, session.user.id)))
      .limit(1);
    if (existing) {
      await db.delete(projectReactions).where(eq(projectReactions.id, existing.id));
      return apiOk({ liked: false });
    }
    await db.insert(projectReactions).values({ projectId: id, userId: session.user.id, kind: "like" });
    return apiOk({ liked: true }, 201);
  }

  if (parsed.data.action === "restage") {
    if (project.ownerId !== session.user.id && session.user.role !== "admin") {
      return apiError("Only the owner can change the stage.", 403);
    }
    await db.update(projects).set({ stage: parsed.data.stage! }).where(eq(projects.id, id));
    return apiOk({ stage: parsed.data.stage });
  }

  // update_settings — title / summary / visibility (owner or admin).
  if (parsed.data.action === "update_settings") {
    if (project.ownerId !== session.user.id && session.user.role !== "admin") {
      return apiError("Only the owner can change project settings.", 403);
    }
    const patch: { title?: string; summary?: string; visibility?: "public" | "private" } = {};
    if (parsed.data.title !== undefined) patch.title = parsed.data.title;
    if (parsed.data.summary !== undefined) patch.summary = parsed.data.summary;
    if (parsed.data.visibility !== undefined) {
      if (parsed.data.visibility === "private") {
        const { hasSuperAccess } = await import("@/lib/entitlements");
        const allowed = session.user.role === "admin" || (await hasSuperAccess(session.user.id));
        if (!allowed) return apiError("Private projects require a Super plan.", 403);
      }
      patch.visibility = parsed.data.visibility;
    }
    if (Object.keys(patch).length === 0) return apiError("Nothing to update.", 400);
    await db.update(projects).set(patch).where(eq(projects.id, id));
    const { logActivity } = await import("@/lib/project-access");
    await logActivity(id, session.user.id, "project.settings", "project", id, {
      fields: Object.keys(patch),
    });
    return apiOk({ updated: true });
  }

  // update_attributes — dynamic project fields merged into JSONB (correction §2).
  // Unrelated/unknown fields are preserved; no migration needed for new fields.
  if (parsed.data.action === "update_attributes") {
    if (project.ownerId !== session.user.id && session.user.role !== "admin") {
      return apiError("Only the owner can change custom fields.", 403);
    }
    const set = parsed.data.set ?? {};
    const remove = parsed.data.remove ?? [];
    for (const path of Object.keys(set)) {
      const pathProblem = validateFieldPath(path);
      if (pathProblem) return apiError(`Invalid field "${path}": ${pathProblem}`, 400);
      const valueProblem = validateFieldValue(set[path], 0);
      if (valueProblem) return apiError(`Invalid value for "${path}": ${valueProblem}`, 400);
    }
    for (const path of remove) {
      const pathProblem = validateFieldPath(path);
      if (pathProblem) return apiError(`Invalid field "${path}": ${pathProblem}`, 400);
    }
    const next = applyDocUpdate(project.attributes ?? {}, { set, remove });
    const sizeProblem = validateDocSize(next);
    if (sizeProblem) return apiError(sizeProblem, 400);
    await db.update(projects).set({ attributes: next }).where(eq(projects.id, id));
    return apiOk({ attributes: next });
  }

  // analyze — versioned, evidence-labeled, never overwriting history.
  if (project.ownerId !== session.user.id && session.user.role !== "admin") {
    return apiError("Only the owner can request analysis.", 403);
  }
  const contributs = await db
    .select({ body: projectContributions.body })
    .from(projectContributions)
    .where(eq(projectContributions.projectId, id))
    .limit(50);
  const spark = await callMuseSpark({
    task: "project_analysis",
    input: {
      title: project.title,
      summary: project.summary,
      details: project.details,
      contributions: contributs.map((c) => c.body),
    },
    schemaHint:
      "sections: problem, solution, customers, market, scope, collaborators, distribution, revenue, funding, milestones, risks. Mark every market/competitor claim as researched-with-source or assumption.",
  });
  if (!spark.configured) {
    return apiOk({ pending: true, pendingReason: spark.pendingReason });
  }
  if (spark.error || spark.data === undefined) {
    return apiError(spark.error ?? "Analysis failed. You can retry safely.", 502);
  }
  const checked = validateSparkJson(spark.data);
  if (!checked.ok) {
    return apiError(`${checked.error} You can retry safely.`, 502);
  }
  const document = checked.doc;
  const evidence =
    typeof document.evidence === "string" && ["researched", "assumption", "mixed"].includes(document.evidence)
      ? (document.evidence as string)
      : "assumption";
  const latest = await db
    .select({ version: projectAnalyses.version })
    .from(projectAnalyses)
    .where(eq(projectAnalyses.projectId, id))
    .orderBy(desc(projectAnalyses.version))
    .limit(1);
  const version = (latest[0]?.version ?? 0) + 1;
  const [created] = await db
    .insert(projectAnalyses)
    .values({
      projectId: id,
      version,
      document,
      evidence,
      status: "completed",
      requestedBy: session.user.id,
    })
    .returning({ id: projectAnalyses.id });

  await notify({
    userId: project.ownerId,
    type: "project",
    title: `Analysis v${version} ready`,
    body: `AI-assisted analysis for "${project.title}" is ready for review.`,
    resourceType: "project",
    resourceId: id,
  });

  // Stub post to the group's conversation: a pointer only, never the content.
  if (project.groupId) {
    const { conversations } = await import("@/db/schema");
    const { postSystemMessage } = await import("@/lib/chat");
    const [groupConv] = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(and(eq(conversations.type, "group"), eq(conversations.groupId, project.groupId)))
      .limit(1);
    if (groupConv) {
      await postSystemMessage(
        groupConv.id,
        `Analysis v${version} for "${project.title}" is ready for review.`,
        { event: "project_analysis", projectId: id, version },
      );
    }
  }
  return apiOk({ analysisId: created.id, version }, 201);
}
