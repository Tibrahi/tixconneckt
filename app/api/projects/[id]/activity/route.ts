import { and, desc, eq, lt } from "drizzle-orm";
import { getDb } from "@/db";
import { projectActivity, users } from "@/db/schema";
import { apiError, apiOk } from "@/lib/api-response";
import { loadProjectWithAccess } from "@/lib/project-access";
import { getSession } from "@/lib/session";

/** Append-only activity feed for the info panel (paginated). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const { id } = await params;
  const loaded = await loadProjectWithAccess(id, session.user.id, session.user.role);
  if (!loaded.ok) return apiError(loaded.error, loaded.status);

  const url = new URL(req.url);
  const before = url.searchParams.get("before");
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? 20)));

  const db = getDb();
  const rows = await db
    .select({
      id: projectActivity.id,
      action: projectActivity.action,
      targetType: projectActivity.targetType,
      targetId: projectActivity.targetId,
      details: projectActivity.details,
      createdAt: projectActivity.createdAt,
      actorName: users.name,
    })
    .from(projectActivity)
    .leftJoin(users, eq(users.id, projectActivity.actorId))
    .where(
      before
        ? and(eq(projectActivity.projectId, id), lt(projectActivity.createdAt, new Date(before)))
        : eq(projectActivity.projectId, id),
    )
    .orderBy(desc(projectActivity.createdAt))
    .limit(limit + 1);

  const page = rows.slice(0, limit);
  return apiOk({
    activity: page,
    hasMore: rows.length > limit,
    nextBefore: page.length > 0 ? page[page.length - 1].createdAt : null,
  });
}
