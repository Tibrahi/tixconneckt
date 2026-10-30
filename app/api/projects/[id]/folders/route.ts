import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { projectFolders } from "@/db/schema";
import { apiError, apiOk } from "@/lib/api-response";
import { ensureRootFolder, loadProjectWithAccess, logActivity, projectAudience } from "@/lib/project-access";
import { notify } from "@/lib/notify";
import { getSession } from "@/lib/session";
import { projectFolderSchema } from "@/lib/validation";

/** Create a workspace folder (editors and above). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const { id } = await params;
  const loaded = await loadProjectWithAccess(id, session.user.id, session.user.role);
  if (!loaded.ok) return apiError(loaded.error, loaded.status);
  if (!loaded.access.canEdit) return apiError("You need edit access to create folders.", 403);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body.");
  }
  const parsed = projectFolderSchema.safeParse(body);
  if (!parsed.success) return apiError("Give the folder a name.", 400);

  const db = getDb();
  const root = await ensureRootFolder(loaded.project.id, loaded.project.title, session.user.id);
  const parentId = parsed.data.parentFolderId ?? root.id;
  const [parent] = await db
    .select({ id: projectFolders.id })
    .from(projectFolders)
    .where(and(eq(projectFolders.id, parentId), eq(projectFolders.projectId, loaded.project.id)))
    .limit(1);
  if (!parent) return apiError("Parent folder not found.", 404);

  const [created] = await db
    .insert(projectFolders)
    .values({
      projectId: loaded.project.id,
      parentFolderId: parent.id,
      name: parsed.data.name,
      description: parsed.data.description,
      metadata: parsed.data.metadata ?? {},
      createdBy: session.user.id,
    })
    .returning({ id: projectFolders.id });
  await logActivity(loaded.project.id, session.user.id, "folder.created", "folder", created.id, {
    name: parsed.data.name,
  });
  for (const userId of await projectAudience(loaded.project.id)) {
    if (userId === session.user.id) continue;
    await notify({
      userId,
      type: "project",
      title: "Folder created",
      body: `${session.user.name} created "${parsed.data.name}" in "${loaded.project.title}".`,
      resourceType: "project_folder",
      resourceId: created.id,
    });
  }
  return apiOk({ folderId: created.id }, 201);
}
