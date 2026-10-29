import { and, count, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { fundingRequests, groups, projects, users } from "@/db/schema";
import { apiError, apiOk } from "@/lib/api-response";
import { audit } from "@/lib/audit";
import { getSession } from "@/lib/session";

async function requireAdminSession() {
  const session = await getSession();
  if (!session || session.user.role !== "admin") return null;
  return session;
}

/** Moderation queues: groups, projects, and funding requests. */
export async function GET(req: Request) {
  const session = await requireAdminSession();
  if (!session) return apiError("Administrators only.", 403);
  const url = new URL(req.url);
  const queue = url.searchParams.get("queue") ?? "projects";
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const pageSize = 20;
  const db = getDb();

  if (queue === "groups") {
    const rows = await db
      .select({
        id: groups.id,
        name: groups.name,
        objective: groups.objective,
        createdAt: groups.createdAt,
        ownerName: users.name,
      })
      .from(groups)
      .innerJoin(users, eq(users.id, groups.ownerId))
      .orderBy(desc(groups.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    const [total] = await db.select({ n: count() }).from(groups);
    return apiOk({ queue, items: rows, page, pageSize, total: total?.n ?? 0 });
  }

  if (queue === "requests") {
    const rows = await db
      .select({
        id: fundingRequests.id,
        projectId: fundingRequests.projectId,
        requesterType: fundingRequests.requesterType,
        status: fundingRequests.status,
        amountMinor: fundingRequests.amountMinor,
        currency: fundingRequests.currency,
        createdAt: fundingRequests.createdAt,
        projectTitle: projects.title,
      })
      .from(fundingRequests)
      .innerJoin(projects, eq(projects.id, fundingRequests.projectId))
      .orderBy(desc(fundingRequests.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    const [total] = await db.select({ n: count() }).from(fundingRequests);
    return apiOk({ queue, items: rows, page, pageSize, total: total?.n ?? 0 });
  }

  const rows = await db
    .select({
      id: projects.id,
      title: projects.title,
      summary: projects.summary,
      visibility: projects.visibility,
      stage: projects.stage,
      createdAt: projects.createdAt,
      ownerName: users.name,
    })
    .from(projects)
    .innerJoin(users, eq(users.id, projects.ownerId))
    .orderBy(desc(projects.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  const [total] = await db.select({ n: count() }).from(projects);
  return apiOk({ queue, items: rows, page, pageSize, total: total?.n ?? 0 });
}

const moderateSchema = z.object({
  queue: z.enum(["projects", "groups", "requests"]),
  id: z.string().min(1),
  action: z.enum(["archive", "close"]),
  reason: z.string().max(500).optional(),
});

/** Archive a project, or close a funding request. Recorded in the audit log. */
export async function PATCH(req: Request) {
  const session = await requireAdminSession();
  if (!session) return apiError("Administrators only.", 403);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body.");
  }
  const parsed = moderateSchema.safeParse(body);
  if (!parsed.success) return apiError("Invalid moderation action.", 400);

  const db = getDb();
  if (parsed.data.queue === "projects" && parsed.data.action === "archive") {
    await db.update(projects).set({ stage: "archived" }).where(eq(projects.id, parsed.data.id));
  } else if (parsed.data.queue === "requests" && parsed.data.action === "close") {
    await db
      .update(fundingRequests)
      .set({ status: "closed" })
      .where(
        and(eq(fundingRequests.id, parsed.data.id)),
      );
  } else {
    return apiError("Unsupported moderation action.", 400);
  }

  await audit({
    actorId: session.user.id,
    action: "admin.moderate",
    targetType: parsed.data.queue,
    targetId: parsed.data.id,
    metadata: { action: parsed.data.action, reason: parsed.data.reason },
  });
  return apiOk({ moderated: true });
}
