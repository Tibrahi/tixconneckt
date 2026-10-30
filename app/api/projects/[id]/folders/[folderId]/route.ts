import { and, eq, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { projectFiles, projectFolders } from "@/db/schema";
import { apiError, apiOk } from "@/lib/api-response";
import { loadProjectWithAccess, logActivity } from "@/lib/project-access";
import { getSession } from "@/lib/session";
import { projectFolderSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string; folderId: string }> };

async function loadFolder(projectId: string, folderId: string) {
  const db = getDb();
  const [folder] = await db
    .select()
    .from(projectFolders)
    .where(and(eq(projectFolders.id, folderId), eq(projectFolders.projectId, projectId)))
    .limit(1);
  return folder ?? null;
}

/** Rename / describe / move a folder. Moving into itself or a descendant is rejected. */
export async function PATCH(req: Request, { params }: RouteContext) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const { id, folderId } = await params;
  const loaded = await loadProjectWithAccess(id, session.user.id, session.user.role);
  if (!loaded.ok) return apiError(loaded.error, loaded.status);
  if (!loaded.access.canEdit) return apiError("You need edit access to change folders.", 403);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body.");
  }
  const parsed = projectFolderSchema.partial().safeParse(body);
  if (!parsed.success) return apiError("Invalid folder change.", 400);

  const folder = await loadFolder(id, folderId);
  if (!folder) return apiError("Folder not found.", 404);

  const db = getDb();
  if (parsed.data.parentFolderId !== undefined) {
    if (parsed.data.parentFolderId === folder.id) {
      return apiError("A folder cannot contain itself.", 400);
    }
    // Walk up from the new parent: it must never reach this folder.
    let current: string | null = parsed.data.parentFolderId;
    const seen = new Set<string>();
    while (current) {
      if (current === folder.id) {
        return apiError("A folder cannot move into one of its own subfolders.", 400);
      }
      if (seen.has(current)) break;
      seen.add(current);
      const [row] = await db
        .select({ parentFolderId: projectFolders.parentFolderId })
        .from(projectFolders)
        .where(and(eq(projectFolders.id, current), eq(projectFolders.projectId, id)))
        .limit(1);
      if (!row) return apiError("Parent folder not found.", 404);
      current = row.parentFolderId;
    }
  }

  const patch: Partial<typeof projectFolders.$inferInsert> = {};
  if (parsed.data.name !== undefined) patch.name = parsed.data.name;
  if (parsed.data.description !== undefined) patch.description = parsed.data.description;
  if (parsed.data.parentFolderId !== undefined) patch.parentFolderId = parsed.data.parentFolderId;
  if (Object.keys(patch).length === 0) return apiError("Nothing to change.", 400);
  await db.update(projectFolders).set(patch).where(eq(projectFolders.id, folder.id));
  await logActivity(id, session.user.id, "folder.updated", "folder", folder.id, { name: patch.name ?? folder.name });
  return apiOk({ updated: true });
}

/** Delete an empty folder. Non-empty folders must be emptied first — never cascade silently. */
export async function DELETE(_req: Request, { params }: RouteContext) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const { id, folderId } = await params;
  const loaded = await loadProjectWithAccess(id, session.user.id, session.user.role);
  if (!loaded.ok) return apiError(loaded.error, loaded.status);
  if (!loaded.access.canEdit) return apiError("You need edit access to delete folders.", 403);

  const folder = await loadFolder(id, folderId);
  if (!folder) return apiError("Folder not found.", 404);
  if (folder.parentFolderId === null) {
    return apiError("The root folder cannot be deleted.", 400);
  }

  const db = getDb();
  const [child] = await db
    .select({ id: projectFolders.id })
    .from(projectFolders)
    .where(and(eq(projectFolders.parentFolderId, folder.id), ne(projectFolders.id, folder.id)))
    .limit(1);
  if (child) return apiError("Move or delete the subfolders first.", 400);
  const [file] = await db
    .select({ id: projectFiles.id })
    .from(projectFiles)
    .where(eq(projectFiles.folderId, folder.id))
    .limit(1);
  if (file) return apiError("Move or delete the documents inside first.", 400);

  await db.delete(projectFolders).where(eq(projectFolders.id, folder.id));
  await logActivity(id, session.user.id, "folder.deleted", "folder", folder.id, { name: folder.name });
  return apiOk({ deleted: true });
}
