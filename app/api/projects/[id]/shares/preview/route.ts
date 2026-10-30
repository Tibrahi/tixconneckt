import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { projectFiles, projectFolders } from "@/db/schema";
import { apiError, apiOk } from "@/lib/api-response";
import { folderChain, loadProjectWithAccess } from "@/lib/project-access";
import { getSession } from "@/lib/session";
import { fundingRequestDocumentsSchema } from "@/lib/validation";

/**
 * "What the provider will see" preview: resolves the selected files and
 * folders (folders expand to their current files) and states plainly what
 * stays private. Nothing is granted by previewing.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const { id } = await params;
  const loaded = await loadProjectWithAccess(id, session.user.id, session.user.role);
  if (!loaded.ok) return apiError(loaded.error, loaded.status);
  if (!loaded.access.canManage) return apiError("Only managers can prepare shares.", 403);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body.");
  }
  const parsed = fundingRequestDocumentsSchema.safeParse(body);
  if (!parsed.success) return apiError("Choose files or folders to preview.", 400);

  const db = getDb();
  const folders = await db
    .select({ id: projectFolders.id, parentFolderId: projectFolders.parentFolderId, name: projectFolders.name })
    .from(projectFolders)
    .where(eq(projectFolders.projectId, id))
    .limit(500);
  const foldersById = new Map(folders.map((f) => [f.id, { id: f.id, parentFolderId: f.parentFolderId }]));
  const folderSet = new Set(parsed.data.folderIds);

  const files = await db
    .select({ id: projectFiles.id, folderId: projectFiles.folderId, title: projectFiles.title, documentType: projectFiles.documentType })
    .from(projectFiles)
    .where(eq(projectFiles.projectId, id))
    .limit(1000);

  const explicitFiles = new Set(parsed.data.fileIds);
  const visible = files.filter(
    (f) => explicitFiles.has(f.id) || folderChain(f.folderId, foldersById).some((fid) => folderSet.has(fid)),
  );
  const selectedFolders = folders.filter((f) => folderSet.has(f.id));

  // Validate every selection belongs to this project.
  if (selectedFolders.length !== folderSet.size) {
    return apiError("One of the selected folders is not in this project.", 400);
  }
  const knownFiles = new Set(files.map((f) => f.id));
  for (const fid of explicitFiles) {
    if (!knownFiles.has(fid)) return apiError("One of the selected documents is not in this project.", 400);
  }
  return apiOk({
    folders: selectedFolders.map((f) => ({ id: f.id, name: f.name })),
    files: visible.map((f) => ({ id: f.id, folderId: f.folderId, title: f.title, documentType: f.documentType })),
    privateCount: files.length - visible.length,
    expiresInDays: parsed.data.accessDays ?? null,
  });
}
