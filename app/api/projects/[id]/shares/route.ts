import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  fundingRequests,
  projectFiles,
  projectFolders,
  projectShares,
  users,
} from "@/db/schema";
import { apiError, apiOk } from "@/lib/api-response";
import { loadProjectWithAccess, logActivity } from "@/lib/project-access";
import { notify } from "@/lib/notify";
import { getSession } from "@/lib/session";
import { projectShareSchema } from "@/lib/validation";

/** List share grants (managers see all; members see their own view). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const { id } = await params;
  const loaded = await loadProjectWithAccess(id, session.user.id, session.user.role);
  if (!loaded.ok) return apiError(loaded.error, loaded.status);
  if (loaded.access.role !== "owner" && loaded.access.role !== "editor" && !loaded.access.canManage) {
    return apiError("Only project managers and editors can review shares.", 403);
  }

  const db = getDb();
  const shares = await db
    .select({
      id: projectShares.id,
      providerId: projectShares.providerId,
      providerName: users.name,
      requestId: projectShares.requestId,
      permission: projectShares.permission,
      fileIds: projectShares.fileIds,
      folderIds: projectShares.folderIds,
      expiresAt: projectShares.expiresAt,
      createdAt: projectShares.createdAt,
    })
    .from(projectShares)
    .innerJoin(users, eq(users.id, projectShares.providerId))
    .where(eq(projectShares.projectId, id))
    .orderBy(desc(projectShares.createdAt))
    .limit(100);
  return apiOk({ shares });
}

/**
 * Grant a provider explicit access to files/folders, optionally scoped to
 * a request with an expiry. Every id is verified to belong to this project
 * — nothing outside the grant is ever implied.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const { id } = await params;
  const loaded = await loadProjectWithAccess(id, session.user.id, session.user.role);
  if (!loaded.ok) return apiError(loaded.error, loaded.status);
  if (!loaded.access.canManage) return apiError("Only managers can share with providers.", 403);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body.");
  }
  const parsed = projectShareSchema.safeParse(body);
  if (!parsed.success) return apiError("Choose files or folders to share.", 400);
  if (parsed.data.fileIds.length === 0 && parsed.data.folderIds.length === 0) {
    return apiError("Choose at least one file or folder to share.", 400);
  }

  const db = getDb();
  const [provider] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.id, parsed.data.providerId))
    .limit(1);
  if (!provider || provider.role !== "provider") {
    return apiError("Shares go to provider accounts only.", 400);
  }

  if (parsed.data.fileIds.length > 0) {
    const rows = await db
      .select({ id: projectFiles.id })
      .from(projectFiles)
      .where(and(eq(projectFiles.projectId, id), inArray(projectFiles.id, parsed.data.fileIds)));
    if (rows.length !== new Set(parsed.data.fileIds).size) {
      return apiError("One of the shared documents is not in this project.", 400);
    }
  }
  if (parsed.data.folderIds.length > 0) {
    const rows = await db
      .select({ id: projectFolders.id })
      .from(projectFolders)
      .where(and(eq(projectFolders.projectId, id), inArray(projectFolders.id, parsed.data.folderIds)));
    if (rows.length !== new Set(parsed.data.folderIds).size) {
      return apiError("One of the shared folders is not in this project.", 400);
    }
  }
  if (parsed.data.requestId) {
    const [request] = await db
      .select({ id: fundingRequests.id })
      .from(fundingRequests)
      .where(and(eq(fundingRequests.id, parsed.data.requestId), eq(fundingRequests.projectId, id)))
      .limit(1);
    if (!request) return apiError("That request does not belong to this project.", 400);
  }

  const [created] = await db
    .insert(projectShares)
    .values({
      projectId: id,
      requestId: parsed.data.requestId,
      providerId: provider.id,
      permission: "view",
      fileIds: [...new Set(parsed.data.fileIds)],
      folderIds: [...new Set(parsed.data.folderIds)],
      grantedBy: session.user.id,
      expiresAt: parsed.data.accessDays ? new Date(Date.now() + parsed.data.accessDays * 86_400_000) : null,
    })
    .returning({ id: projectShares.id });

  await notify({
    userId: provider.id,
    type: "project",
    title: parsed.data.reviewRequested ? "Documents shared for review" : "Documents shared with you",
    body: `${session.user.name} shared ${parsed.data.fileIds.length + parsed.data.folderIds.length} item(s) from "${loaded.project.title}"${parsed.data.reviewRequested ? " and asked for your review" : ""}.`,
    resourceType: "project",
    resourceId: id,
  });
  await logActivity(id, session.user.id, "share.granted", "share", created.id, {
    providerId: provider.id,
    files: parsed.data.fileIds.length,
    folders: parsed.data.folderIds.length,
    requestId: parsed.data.requestId ?? null,
  });
  return apiOk({ shareId: created.id }, 201);
}

/** Revoke a share grant immediately (managers only). */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const { id } = await params;
  const loaded = await loadProjectWithAccess(id, session.user.id, session.user.role);
  if (!loaded.ok) return apiError(loaded.error, loaded.status);
  if (!loaded.access.canManage) return apiError("Only managers can revoke shares.", 403);

  const shareId = new URL(req.url).searchParams.get("shareId");
  if (!shareId) return apiError("Choose a share to revoke.", 400);
  const db = getDb();
  const [share] = await db
    .select()
    .from(projectShares)
    .where(and(eq(projectShares.id, shareId), eq(projectShares.projectId, id)))
    .limit(1);
  if (!share) return apiError("Share not found.", 404);
  await db.delete(projectShares).where(eq(projectShares.id, share.id));
  await notify({
    userId: share.providerId,
    type: "project",
    title: "Shared access revoked",
    body: `Your access to shared documents in "${loaded.project.title}" was revoked.`,
    resourceType: "project",
    resourceId: id,
  });
  await logActivity(id, session.user.id, "share.revoked", "share", share.id, { providerId: share.providerId });
  return apiOk({ revoked: true });
}
