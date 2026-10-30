import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  fundingRequests,
  groupMembers,
  projectActivity,
  projectFolders,
  projectMembers,
  projectShares,
  projects,
} from "@/db/schema";

export type ProjectRole = "owner" | "editor" | "viewer" | "provider" | "none";

export interface ActiveShare {
  id: string;
  requestId: string | null;
  permission: string;
  fileIds: string[];
  folderIds: string[];
  expiresAt: Date | null;
}

export interface ProjectAccess {
  role: ProjectRole;
  canView: boolean;
  canEdit: boolean;
  /** Members, shares, settings. */
  canManage: boolean;
  via: "owner" | "member" | "group" | "share" | "public" | "admin" | "none";
  shares: ActiveShare[];
  groupAdmin: boolean;
}

const NONE: ProjectAccess = {
  role: "none",
  canView: false,
  canEdit: false,
  canManage: false,
  via: "none",
  shares: [],
  groupAdmin: false,
};

/**
 * Resolve a user's access to a project (Project.md §13/§15). Every file,
 * folder, member, and share operation goes through this — never UI hiding.
 */
export async function resolveProjectAccess(
  project: typeof projects.$inferSelect,
  userId: string,
  userRole: string,
): Promise<ProjectAccess> {
  const db = getDb();
  if (userRole === "admin") {
    return { role: "owner", canView: true, canEdit: true, canManage: true, via: "admin", shares: [], groupAdmin: true };
  }
  if (project.ownerId === userId) {
    return { role: "owner", canView: true, canEdit: true, canManage: true, via: "owner", shares: [], groupAdmin: false };
  }

  const [member] = await db
    .select()
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, project.id), eq(projectMembers.userId, userId)))
    .limit(1);
  if (member) {
    const role = (member.role === "owner" || member.role === "editor" ? member.role : "viewer") as ProjectRole;
    return {
      role,
      canView: true,
      canEdit: role !== "viewer",
      canManage: role === "owner",
      via: "member",
      shares: [],
      groupAdmin: false,
    };
  }

  let groupAdmin = false;
  if (project.groupId) {
    const [gm] = await db
      .select({ role: groupMembers.role })
      .from(groupMembers)
      .where(
        and(
          eq(groupMembers.groupId, project.groupId),
          eq(groupMembers.userId, userId),
          eq(groupMembers.status, "active"),
        ),
      )
      .limit(1);
    if (gm) {
      // Group members read by default; group admins also manage membership.
      groupAdmin = gm.role === "admin";
      return {
        role: "viewer",
        canView: true,
        canEdit: false,
        canManage: groupAdmin,
        via: "group",
        shares: [],
        groupAdmin,
      };
    }
  }

  // Explicit provider shares (unexpired only).
  const shares = await db
    .select()
    .from(projectShares)
    .where(and(eq(projectShares.projectId, project.id), eq(projectShares.providerId, userId)));
  const now = Date.now();
  const active = shares.filter((s) => !s.expiresAt || s.expiresAt.getTime() > now);
  if (active.length > 0) {
    return {
      role: "provider",
      canView: true,
      canEdit: false,
      canManage: false,
      via: "share",
      shares: active.map((s) => ({
        id: s.id,
        requestId: s.requestId,
        permission: s.permission,
        fileIds: (s.fileIds ?? []) as string[],
        folderIds: (s.folderIds ?? []) as string[],
        expiresAt: s.expiresAt,
      })),
      groupAdmin: false,
    };
  }

  if (project.visibility === "public") {
    return { role: "viewer", canView: true, canEdit: false, canManage: false, via: "public", shares: [], groupAdmin: false };
  }
  return NONE;
}

export interface ResponseMeta {
  requestId: string;
  providerId: string;
  submitted: boolean;
}

/** Provider-response authorship from file metadata (null for normal files). */
export function responseMetaOf(metadata: unknown): ResponseMeta | null {
  const meta = (metadata ?? {}) as Record<string, unknown>;
  const r = meta.response as Record<string, unknown> | undefined;
  if (!r || typeof r.requestId !== "string" || typeof r.providerId !== "string") return null;
  return { requestId: r.requestId, providerId: r.providerId, submitted: r.submitted === true };
}

/** Folder chain from a file's folder up to the root (cycle-safe). */
export function folderChain(
  folderId: string,
  foldersById: Map<string, { id: string; parentFolderId: string | null }>,
): string[] {
  const chain: string[] = [];
  const seen = new Set<string>();
  let current: string | null = folderId;
  while (current && !seen.has(current)) {
    seen.add(current);
    chain.push(current);
    current = foldersById.get(current)?.parentFolderId ?? null;
  }
  return chain;
}

/** File visibility under an access grant (providers see only shared files). */
export function canViewFile(
  access: ProjectAccess,
  file: { id: string; folderId: string; metadata: unknown },
  foldersById: Map<string, { id: string; parentFolderId: string | null }>,
  userId: string,
): boolean {
  if (access.role === "owner" || access.role === "editor" || access.role === "viewer") return true;
  if (access.role !== "provider") return false;
  const response = responseMetaOf(file.metadata);
  // Providers always see their own response documents.
  if (response && response.providerId === userId) return true;
  const chain = new Set(folderChain(file.folderId, foldersById));
  return access.shares.some(
    (s) => s.fileIds.includes(file.id) || s.folderIds.some((f) => chain.has(f)),
  );
}

/**
 * File edit rights. Provider responses are author-only — even the project
 * owner cannot rewrite a provider's signed response document.
 */
export function canEditFile(
  access: ProjectAccess,
  file: { metadata: unknown },
  userId: string,
): boolean {
  const response = responseMetaOf(file.metadata);
  if (response) return response.providerId === userId;
  return access.canEdit;
}

/** Lazily ensure the root workspace folder (named for the project). */
export async function ensureRootFolder(
  projectId: string,
  projectTitle: string,
  userId: string,
): Promise<{ id: string; name: string }> {
  const db = getDb();
  const folders = await db
    .select({ id: projectFolders.id, name: projectFolders.name, parentFolderId: projectFolders.parentFolderId })
    .from(projectFolders)
    .where(eq(projectFolders.projectId, projectId))
    .limit(100);
  const root = folders.find((f) => f.parentFolderId === null) ?? folders[0];
  if (root) return { id: root.id, name: root.name };
  const [created] = await db
    .insert(projectFolders)
    .values({ projectId, parentFolderId: null, name: projectTitle, createdBy: userId })
    .returning({ id: projectFolders.id, name: projectFolders.name });
  return created;
}

/** Append a project activity record. Never throws to callers. */
export async function logActivity(
  projectId: string,
  actorId: string | null,
  action: string,
  targetType?: string,
  targetId?: string,
  details?: Record<string, unknown>,
): Promise<void> {
  try {
    const db = getDb();
    await db.insert(projectActivity).values({
      projectId,
      actorId,
      action,
      targetType,
      targetId,
      details: details ?? {},
    });
  } catch (error) {
    console.error("[project-activity:failed]", error instanceof Error ? error.message : error);
  }
}

export type RequestSide = "provider" | "requester";

export interface LoadedRequest {
  request: typeof fundingRequests.$inferSelect;
  side: RequestSide;
  project: typeof projects.$inferSelect;
}

/**
 * Request access: the provider, the individual requester, or an active
 * group admin for group requests. Returns which side the user is on.
 */
export async function loadRequestWithSide(
  requestId: string,
  userId: string,
): Promise<LoadedRequest | { error: string; status: 404 | 403 }> {
  const db = getDb();
  const [request] = await db
    .select()
    .from(fundingRequests)
    .where(eq(fundingRequests.id, requestId))
    .limit(1);
  if (!request) return { error: "Request not found.", status: 404 };
  const [project] = await db.select().from(projects).where(eq(projects.id, request.projectId)).limit(1);
  if (!project) return { error: "Request not found.", status: 404 };

  let side: RequestSide | null = null;
  if (request.providerId === userId) side = "provider";
  else if (request.requesterType === "individual" && request.requesterId === userId) side = "requester";
  else if (request.requesterType === "group") {
    const [admin] = await db
      .select({ id: groupMembers.id })
      .from(groupMembers)
      .where(
        and(
          eq(groupMembers.groupId, request.requesterId),
          eq(groupMembers.userId, userId),
          eq(groupMembers.status, "active"),
          eq(groupMembers.role, "admin"),
        ),
      )
      .limit(1);
    if (admin) side = "requester";
  }
  if (!side) return { error: "You do not have access to this request.", status: 403 };
  return { request, side, project };
}

/**
 * Notification audience for project events: the owner, direct members,
 * and active members of the owning group (when any). Never throws.
 */
export async function projectAudience(projectId: string): Promise<string[]> {
  try {
    const db = getDb();
    const ids = new Set<string>();
    const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    if (!project) return [];
    ids.add(project.ownerId);
    const members = await db
      .select({ userId: projectMembers.userId })
      .from(projectMembers)
      .where(eq(projectMembers.projectId, projectId))
      .limit(100);
    for (const m of members) ids.add(m.userId);
    if (project.groupId) {
      const gms = await db
        .select({ userId: groupMembers.userId })
        .from(groupMembers)
        .where(and(eq(groupMembers.groupId, project.groupId), eq(groupMembers.status, "active")))
        .limit(100);
      for (const m of gms) ids.add(m.userId);
    }
    return [...ids].slice(0, 100);
  } catch {
    return [];
  }
}

/** Convenience: access + project load with 404/403 semantics for routes. */
export async function loadProjectWithAccess(
  projectId: string,
  userId: string,
  userRole: string,
): Promise<
  | { ok: true; project: typeof projects.$inferSelect; access: ProjectAccess }
  | { ok: false; status: 404 | 403; error: string }
> {
  const db = getDb();
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) return { ok: false, status: 404, error: "Project not found." };
  const access = await resolveProjectAccess(project, userId, userRole);
  if (!access.canView) return { ok: false, status: 403, error: "You do not have access to this project." };
  return { ok: true, project, access };
}
