import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { projectFiles, projectFolders, projectShares } from "@/db/schema";
import { apiError, apiOk } from "@/lib/api-response";
import { folderChain, loadRequestWithSide, responseMetaOf } from "@/lib/project-access";
import { getSession } from "@/lib/session";

/**
 * Provider folder view for a request: the provider sees exactly the shared
 * files/folders plus their own response documents. The requester side sees
 * the shared set plus every submitted response.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const { id } = await params;
  const loaded = await loadRequestWithSide(id, session.user.id);
  if ("error" in loaded) return apiError(loaded.error, loaded.status);
  const { side, project } = loaded;

  const db = getDb();
  const folders = await db
    .select({ id: projectFolders.id, parentFolderId: projectFolders.parentFolderId, name: projectFolders.name })
    .from(projectFolders)
    .where(eq(projectFolders.projectId, project.id))
    .limit(500);
  const foldersById = new Map(folders.map((f) => [f.id, { id: f.id, parentFolderId: f.parentFolderId }]));

  const files = await db
    .select({
      id: projectFiles.id,
      folderId: projectFiles.folderId,
      title: projectFiles.title,
      documentType: projectFiles.documentType,
      metadata: projectFiles.metadata,
      updatedAt: projectFiles.updatedAt,
      versionNumber: projectFiles.versionNumber,
    })
    .from(projectFiles)
    .where(eq(projectFiles.projectId, project.id))
    .limit(1000);

  const shares = await db
    .select()
    .from(projectShares)
    .where(and(eq(projectShares.projectId, project.id), eq(projectShares.requestId, id)));
  const now = Date.now();
  const live = shares.filter((s) => !s.expiresAt || s.expiresAt.getTime() > now);
  const myShares =
    side === "provider" ? live.filter((s) => s.providerId === session.user.id) : live;

  const visible = files.filter((f) => {
    const response = responseMetaOf(f.metadata);
    if (response && response.requestId === id) {
      // Responses: the authoring provider + the requester side.
      return side === "requester" || response.providerId === session.user.id;
    }
    if (response) return false; // another request's responses stay hidden
    if (side === "requester") {
      // Requester side: show the shared set (their own access is workspace-wide).
      return myShares.some(
        (s) =>
          (s.fileIds as string[]).includes(f.id) ||
          (s.folderIds as string[]).some((fid) => folderChain(f.folderId, foldersById).includes(fid)),
      );
    }
    const chain = new Set(folderChain(f.folderId, foldersById));
    return myShares.some(
      (s) => (s.fileIds as string[]).includes(f.id) || (s.folderIds as string[]).some((fid) => chain.has(fid)),
    );
  });

  const visibleFolderIds = new Set<string>();
  for (const f of visible) {
    for (const fid of folderChain(f.folderId, foldersById)) visibleFolderIds.add(fid);
  }

  return apiOk({
    side,
    project: { id: project.id, title: project.title },
    folders: folders
      .filter((f) => visibleFolderIds.has(f.id))
      .map((f) => ({ id: f.id, parentFolderId: f.parentFolderId, name: f.name })),
    files: visible.map((f) => {
      const response = responseMetaOf(f.metadata);
      return {
        id: f.id,
        folderId: f.folderId,
        title: f.title,
        documentType: f.documentType,
        updatedAt: f.updatedAt,
        versionNumber: f.versionNumber,
        isResponse: !!response,
        submitted: response?.submitted ?? false,
        mine: response?.providerId === session.user.id,
      };
    }),
    shares: myShares.map((s) => ({
      id: s.id,
      expiresAt: s.expiresAt,
      fileCount: (s.fileIds as string[]).length,
      folderCount: (s.folderIds as string[]).length,
    })),
  });
}
