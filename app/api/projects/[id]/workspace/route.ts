import { and, asc, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  fundingRequests,
  projectActivity,
  projectFiles,
  projectFolders,
  projectMembers,
  users,
} from "@/db/schema";
import { apiError, apiOk } from "@/lib/api-response";
import {
  canViewFile,
  ensureRootFolder,
  folderChain,
  loadProjectWithAccess,
} from "@/lib/project-access";
import { getSession } from "@/lib/session";

/**
 * Workspace listing: folder tree, files with search/sort/filters, members,
 * recent activity, and linked requests. Providers receive only the files
 * their active shares (or own responses) authorize.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const { id } = await params;
  const loaded = await loadProjectWithAccess(id, session.user.id, session.user.role);
  if (!loaded.ok) return apiError(loaded.error, loaded.status);
  const { project, access } = loaded;

  const url = new URL(req.url);
  const folderId = url.searchParams.get("folderId");
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 200);
  const type = (url.searchParams.get("type") ?? "").trim().slice(0, 60);
  const owner = (url.searchParams.get("owner") ?? "").trim();
  const sort = url.searchParams.get("sort") ?? "updated";
  const recentOnly = url.searchParams.get("recent") === "1";
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const pageSize = recentOnly ? 5 : Math.min(50, Math.max(1, Number(url.searchParams.get("pageSize") ?? 30)));

  const db = getDb();
  const root = await ensureRootFolder(project.id, project.title, session.user.id);
  const activeFolderId = folderId ?? root.id;

  const folders = await db
    .select()
    .from(projectFolders)
    .where(eq(projectFolders.projectId, project.id))
    .orderBy(asc(projectFolders.name))
    .limit(500);
  const foldersById = new Map(folders.map((f) => [f.id, { id: f.id, parentFolderId: f.parentFolderId }]));

  // Breadcrumb chain for the active folder.
  const chain = folderChain(activeFolderId, foldersById).reverse();
  const breadcrumb = chain
    .map((fid) => foldersById.get(fid))
    .filter((f): f is { id: string; parentFolderId: string | null } => !!f)
    .map((f) => ({ id: f.id, name: folders.find((x) => x.id === f.id)?.name ?? "Folder" }));

  const conditions = [
    eq(projectFiles.projectId, project.id),
    q
      ? sql`(${projectFiles.title} ILIKE ${`%${q.replace(/[%_\\]/g, "\\$&")}%`} OR ${projectFiles.textCache} ILIKE ${`%${q.replace(/[%_\\]/g, "\\$&")}%`})`
      : undefined,
    // Folder scoping applies to browsing; global search and recents span the workspace.
    !q && !recentOnly ? eq(projectFiles.folderId, activeFolderId) : undefined,
    type ? eq(projectFiles.documentType, type) : undefined,
    owner ? eq(projectFiles.createdBy, owner) : undefined,
  ];

  const order =
    recentOnly || (sort !== "title" && sort !== "created")
      ? desc(projectFiles.updatedAt)
      : sort === "title"
        ? asc(projectFiles.title)
        : desc(projectFiles.createdAt);

  const rows = await db
    .select({
      file: projectFiles,
      creatorName: users.name,
    })
    .from(projectFiles)
    .leftJoin(users, eq(users.id, projectFiles.createdBy))
    .where(and(...conditions.filter((c) => c !== undefined)))
    .orderBy(order)
    .limit(pageSize + 1)
    .offset((page - 1) * pageSize);
  const hasMore = rows.length > pageSize;

  const files = rows
    .slice(0, pageSize)
    .filter((r) => canViewFile(access, r.file, foldersById, session.user.id))
    .map((r) => ({
      id: r.file.id,
      folderId: r.file.folderId,
      title: r.file.title,
      documentType: r.file.documentType,
      versionNumber: r.file.versionNumber,
      hasAttachment: !!r.file.attachmentId,
      preview: r.file.textCache.slice(0, 280),
      createdBy: r.file.createdBy,
      creatorName: r.creatorName,
      updatedBy: r.file.updatedBy,
      updatedAt: r.file.updatedAt,
      createdAt: r.file.createdAt,
      isResponse: !!(r.file.metadata as Record<string, unknown>)?.response,
    }));

  const members = await db
    .select({ userId: projectMembers.userId, role: projectMembers.role, name: users.name, shortId: users.shortId })
    .from(projectMembers)
    .innerJoin(users, eq(users.id, projectMembers.userId))
    .where(eq(projectMembers.projectId, project.id))
    .limit(100);

  const activity = await db
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
    .where(eq(projectActivity.projectId, project.id))
    .orderBy(desc(projectActivity.createdAt))
    .limit(20);

  const requests = await db
    .select({ id: fundingRequests.id, status: fundingRequests.status, amountMinor: fundingRequests.amountMinor, currency: fundingRequests.currency })
    .from(fundingRequests)
    .where(eq(fundingRequests.projectId, project.id))
    .orderBy(desc(fundingRequests.createdAt))
    .limit(20);

  const types = await db
    .select({ documentType: projectFiles.documentType })
    .from(projectFiles)
    .where(eq(projectFiles.projectId, project.id))
    .groupBy(projectFiles.documentType)
    .limit(50);

  return apiOk({
    project: {
      id: project.id,
      title: project.title,
      summary: project.summary,
      visibility: project.visibility,
      stage: project.stage,
      groupId: project.groupId,
      ownerId: project.ownerId,
    },
    access: { role: access.role, canEdit: access.canEdit, canManage: access.canManage, via: access.via },
    rootFolderId: root.id,
    activeFolderId,
    breadcrumb,
    folders: folders.map((f) => ({
      id: f.id,
      parentFolderId: f.parentFolderId,
      name: f.name,
      description: f.description,
      updatedAt: f.updatedAt,
    })),
    files,
    page,
    pageSize,
    hasMore,
    documentTypes: types.map((t) => t.documentType),
    members,
    activity,
    requests,
  });
}
