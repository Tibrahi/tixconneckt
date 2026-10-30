import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { projectFiles, projectFileVersions, projectFolders, users } from "@/db/schema";
import { apiError, apiOk } from "@/lib/api-response";
import { canEditFile, canViewFile, loadProjectWithAccess, logActivity } from "@/lib/project-access";
import { TEXT_CACHE_CHARS, tiptapToText } from "@/lib/project-docs";
import { getSession } from "@/lib/session";

type RouteContext = { params: Promise<{ id: string; fileId: string }> };

async function loadFile(projectId: string, fileId: string, userId: string, userRole: string) {
  const loaded = await loadProjectWithAccess(projectId, userId, userRole);
  if (!loaded.ok) return loaded;
  const db = getDb();
  const [file] = await db
    .select()
    .from(projectFiles)
    .where(and(eq(projectFiles.id, fileId), eq(projectFiles.projectId, projectId)))
    .limit(1);
  if (!file) return { ok: false as const, status: 404 as const, error: "Document not found." };
  const folders = await db
    .select({ id: projectFolders.id, parentFolderId: projectFolders.parentFolderId })
    .from(projectFolders)
    .where(eq(projectFolders.projectId, projectId))
    .limit(500);
  const map = new Map(folders.map((f) => [f.id, { id: f.id, parentFolderId: f.parentFolderId }]));
  if (!canViewFile(loaded.access, file, map, userId)) {
    return { ok: false as const, status: 403 as const, error: "This document is not shared with you." };
  }
  return { ok: true as const, access: loaded.access, file };
}

/**
 * Version history (newest first) with authors and milestones.
 * ?version=N returns that snapshot's content for preview before restore.
 */
export async function GET(req: Request, { params }: RouteContext) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const { id, fileId } = await params;
  const found = await loadFile(id, fileId, session.user.id, session.user.role);
  if (!found.ok) return apiError(found.error, found.status);

  const db = getDb();
  const wanted = Number(new URL(req.url).searchParams.get("version") ?? NaN);
  if (Number.isInteger(wanted) && wanted > 0) {
    const [snapshot] = await db
      .select()
      .from(projectFileVersions)
      .where(and(eq(projectFileVersions.fileId, fileId), eq(projectFileVersions.versionNumber, wanted)))
      .limit(1);
    if (!snapshot) return apiError("Version not found.", 404);
    return apiOk({
      version: {
        versionNumber: snapshot.versionNumber,
        title: snapshot.title,
        contentJson: snapshot.contentJson,
        metadata: snapshot.metadata,
        createdAt: snapshot.createdAt,
      },
    });
  }

  const versions = await db
    .select({
      versionNumber: projectFileVersions.versionNumber,
      title: projectFileVersions.title,
      metadata: projectFileVersions.metadata,
      createdAt: projectFileVersions.createdAt,
      authorName: users.name,
    })
    .from(projectFileVersions)
    .leftJoin(users, eq(users.id, projectFileVersions.createdBy))
    .where(eq(projectFileVersions.fileId, fileId))
    .orderBy(desc(projectFileVersions.versionNumber))
    .limit(100);
  return apiOk({ currentVersion: found.file.versionNumber, versions });
}

const restoreSchema = z.object({ versionNumber: z.number().int().positive() });

/**
 * Restore an old version as the NEW current version — history is never
 * rewritten, so the restore itself becomes a versioned event.
 */
export async function POST(req: Request, { params }: RouteContext) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const { id, fileId } = await params;
  const found = await loadFile(id, fileId, session.user.id, session.user.role);
  if (!found.ok) return apiError(found.error, found.status);
  if (!canEditFile(found.access, found.file, session.user.id)) {
    return apiError("You do not have edit access to this document.", 403);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body.");
  }
  const parsed = restoreSchema.safeParse(body);
  if (!parsed.success) return apiError("Choose a version to restore.", 400);

  const db = getDb();
  const [snapshot] = await db
    .select()
    .from(projectFileVersions)
    .where(and(eq(projectFileVersions.fileId, fileId), eq(projectFileVersions.versionNumber, parsed.data.versionNumber)))
    .limit(1);
  if (!snapshot) return apiError("Version not found.", 404);

  const nextVersion = found.file.versionNumber + 1;
  await db.transaction(async (tx) => {
    await tx
      .update(projectFiles)
      .set({
        contentJson: snapshot.contentJson,
        textCache: tiptapToText(snapshot.contentJson, TEXT_CACHE_CHARS),
        versionNumber: nextVersion,
        updatedBy: session.user.id,
      })
      .where(eq(projectFiles.id, fileId));
    await tx.insert(projectFileVersions).values({
      fileId,
      versionNumber: nextVersion,
      title: found.file.title,
      contentJson: snapshot.contentJson as Record<string, unknown>,
      metadata: { restoredFrom: snapshot.versionNumber },
      createdBy: session.user.id,
    });
  });
  await logActivity(id, session.user.id, "file.restored", "file", fileId, {
    title: found.file.title,
    fromVersion: snapshot.versionNumber,
    version: nextVersion,
  });
  return apiOk({ versionNumber: nextVersion });
}
