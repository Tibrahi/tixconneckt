import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { projectMembers, users } from "@/db/schema";
import { apiError, apiOk } from "@/lib/api-response";
import { loadProjectWithAccess, logActivity } from "@/lib/project-access";
import { notify } from "@/lib/notify";
import { getSession } from "@/lib/session";
import { projectMemberSchema } from "@/lib/validation";

/** List explicit collaborators (managers and members). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const { id } = await params;
  const loaded = await loadProjectWithAccess(id, session.user.id, session.user.role);
  if (!loaded.ok) return apiError(loaded.error, loaded.status);

  const db = getDb();
  const members = await db
    .select({ userId: projectMembers.userId, role: projectMembers.role, name: users.name, shortId: users.shortId })
    .from(projectMembers)
    .innerJoin(users, eq(users.id, projectMembers.userId))
    .where(eq(projectMembers.projectId, id))
    .limit(100);
  const [owner] = await db
    .select({ id: users.id, name: users.name, shortId: users.shortId })
    .from(users)
    .where(eq(users.id, loaded.project.ownerId))
    .limit(1);
  return apiOk({ owner, members });
}

/** Invite or re-role a collaborator (managers only). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const { id } = await params;
  const loaded = await loadProjectWithAccess(id, session.user.id, session.user.role);
  if (!loaded.ok) return apiError(loaded.error, loaded.status);
  if (!loaded.access.canManage) return apiError("Only managers can invite collaborators.", 403);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body.");
  }
  const parsed = projectMemberSchema.safeParse(body);
  if (!parsed.success) return apiError("Enter a valid member identifier and role.", 400);

  const db = getDb();
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.shortId, parsed.data.shortId))
    .limit(1);
  if (!user) return apiError("No account uses that identifier.", 404);
  if (user.id === loaded.project.ownerId) {
    return apiError("That person already owns this project.", 400);
  }
  await db
    .insert(projectMembers)
    .values({ projectId: id, userId: user.id, role: parsed.data.role })
    .onConflictDoUpdate({
      target: [projectMembers.projectId, projectMembers.userId],
      set: { role: parsed.data.role },
    });
  await notify({
    userId: user.id,
    type: "project",
    title: "Project access changed",
    body: `${session.user.name} set you as ${parsed.data.role} on "${loaded.project.title}".`,
    resourceType: "project",
    resourceId: id,
  });
  await logActivity(id, session.user.id, "member.upserted", "user", user.id, { role: parsed.data.role });
  return apiOk({ updated: true });
}

/** Remove a collaborator (managers only). The owner row cannot be removed. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const { id } = await params;
  const loaded = await loadProjectWithAccess(id, session.user.id, session.user.role);
  if (!loaded.ok) return apiError(loaded.error, loaded.status);
  if (!loaded.access.canManage) return apiError("Only managers can remove collaborators.", 403);

  const userId = new URL(req.url).searchParams.get("userId");
  if (!userId) return apiError("Choose a collaborator to remove.", 400);
  if (userId === loaded.project.ownerId) {
    return apiError("The project owner cannot be removed.", 400);
  }
  const db = getDb();
  await db
    .delete(projectMembers)
    .where(and(eq(projectMembers.projectId, id), eq(projectMembers.userId, userId)));
  await notify({
    userId,
    type: "project",
    title: "Removed from project",
    body: `Your access to "${loaded.project.title}" was removed.`,
    resourceType: "project",
    resourceId: id,
  });
  await logActivity(id, session.user.id, "member.removed", "user", userId);
  return apiOk({ removed: true });
}
