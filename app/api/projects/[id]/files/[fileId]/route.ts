import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { documents, projectFiles, projectFileVersions, projectFolders, users } from "@/db/schema";
import { getPrivateObjectUrl } from "@/lib/storage";
import { apiError, apiOk } from "@/lib/api-response";
import {
  canEditFile,
  canViewFile,
  folderChain,
  loadProjectWithAccess,
  logActivity,
  projectAudience,
} from "@/lib/project-access";
import { notify } from "@/lib/notify";
import { TEXT_CACHE_CHARS, tiptapToText, validateTiptapDoc } from "@/lib/project-docs";
import { getSession } from "@/lib/session";
import { projectFileSaveSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string; fileId: string }> };

async function foldersById(projectId: string) {
  const db = getDb();
  const folders = await db
    .select({ id: projectFolders.id, parentFolderId: projectFolders.parentFolderId })
    .from(projectFolders)
    .where(eq(projectFolders.projectId, projectId))
    .limit(500);
  return new Map(folders.map((f) => [f.id, { id: f.id, parentFolderId: f.parentFolderId }]));
}

/**
 * Open a document: full content for viewers, edit rights computed
 * server-side. Providers opening shared files are activity-logged.
 */
export async function GET(_req: Request, { params }: RouteContext) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const { id, fileId } = await params;
  const loaded = await loadProjectWithAccess(id, session.user.id, session.user.role);
  if (!loaded.ok) return apiError(loaded.error, loaded.status);

  const db = getDb();
  const [file] = await db
    .select()
    .from(projectFiles)
    .where(and(eq(projectFiles.id, fileId), eq(projectFiles.projectId, loaded.project.id)))
    .limit(1);
  if (!file) return apiError("Document not found.", 404);

  const map = await foldersById(loaded.project.id);
  if (!canViewFile(loaded.access, file, map, session.user.id)) {
    return apiError("This document is not shared with you.", 403);
  }

  const [updater] = file.updatedBy
    ? await db.select({ name: users.name }).from(users).where(eq(users.id, file.updatedBy)).limit(1)
    : [];
  const editable = canEditFile(loaded.access, file, session.user.id);

  // Resolve embedded tixdoc:// image references for this authorized viewer.
  // Only ids linked to this file (embedded list or attachment) resolve —
  // anything else is redacted so stray references never leak bytes.
  interface ContentNode {
    type?: string;
    attrs?: { src?: string };
    content?: ContentNode[];
  }
  const contentJson = structuredClone(file.contentJson) as { content?: ContentNode[] };
  const meta = (file.metadata ?? {}) as Record<string, unknown>;
  const linkedIds = new Set<string>(
    [...(Array.isArray(meta.images) ? meta.images : []), file.attachmentId].filter(
      (v): v is string => typeof v === "string",
    ),
  );
  // signedUrl -> tixdoc ref so the client can restore refs before saving.
  const imageRefs: Record<string, string> = {};
  const resolveImages = async (nodes: ContentNode[]) => {
    for (const node of nodes) {
      if (node.type === "image" && typeof node.attrs?.src === "string" && node.attrs.src.startsWith("tixdoc://")) {
        const ref = node.attrs.src;
        const docId = ref.slice("tixdoc://".length);
        if (linkedIds.has(docId)) {
          const [doc] = await db
            .select({ storageKey: documents.storageKey })
            .from(documents)
            .where(eq(documents.id, docId))
            .limit(1);
          const url = doc ? await getPrivateObjectUrl(doc.storageKey, 900) : null;
          node.attrs.src = url ?? "";
          if (url) imageRefs[url] = ref;
        } else {
          node.attrs.src = "";
        }
      }
      if (Array.isArray(node.content)) await resolveImages(node.content);
    }
  };
  if (Array.isArray(contentJson.content)) await resolveImages(contentJson.content);

  if (loaded.access.role === "provider") {
    await logActivity(loaded.project.id, session.user.id, "file.opened", "file", file.id, {
      title: file.title,
    });
  }

  return apiOk({
    file: {
      id: file.id,
      folderId: file.folderId,
      title: file.title,
      documentType: file.documentType,
      contentJson,
      metadata: file.metadata,
      attachmentId: file.attachmentId,
      versionNumber: file.versionNumber,
      updatedAt: file.updatedAt,
      updatedByName: updater?.name ?? null,
    },
    editable,
    imageRefs,
    breadcrumb: folderChain(file.folderId, map)
      .reverse()
      .map((fid) => ({ id: fid })),
  });
}

/**
 * Save with optimistic concurrency: the client sends the version it edited
 * (baseVersion). A mismatch returns 409 with the current version — the
 * server never silently overwrites a newer save. Every save snapshots a
 * version row; history is never rewritten.
 */
export async function PATCH(req: Request, { params }: RouteContext) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const { id, fileId } = await params;
  const loaded = await loadProjectWithAccess(id, session.user.id, session.user.role);
  if (!loaded.ok) return apiError(loaded.error, loaded.status);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body.");
  }
  const parsed = projectFileSaveSchema.safeParse(body);
  if (!parsed.success) return apiError("Invalid document save.", 400);
  const problem = validateTiptapDoc(parsed.data.contentJson);
  if (problem) return apiError(problem, 400);
  // Image sources must be project references or plain https embeds —
  // no javascript:, data:, or stray signed URLs persisted into history.
  const contentRoot = parsed.data.contentJson as { content?: unknown[] };
  const stack = [...(Array.isArray(contentRoot.content) ? contentRoot.content : [])];
  while (stack.length > 0) {
    const node = stack.pop() as { type?: string; attrs?: { src?: string }; content?: unknown[] };
    if (node && typeof node === "object") {
      if (node.type === "image") {
        const src = typeof node.attrs?.src === "string" ? node.attrs.src : "";
        if (!src.startsWith("tixdoc://") && !src.startsWith("https://")) {
          return apiError("Images must be uploaded project images or https embeds.", 400);
        }
        if (src.includes("X-Amz-Signature=")) {
          return apiError("Reload the document before saving (stale image links).", 400);
        }
      }
      if (Array.isArray(node.content)) stack.push(...node.content);
    }
  }

  const db = getDb();
  const [file] = await db
    .select()
    .from(projectFiles)
    .where(and(eq(projectFiles.id, fileId), eq(projectFiles.projectId, loaded.project.id)))
    .limit(1);
  if (!file) return apiError("Document not found.", 404);

  const map = await foldersById(loaded.project.id);
  if (!canViewFile(loaded.access, file, map, session.user.id)) {
    return apiError("This document is not shared with you.", 403);
  }
  if (!canEditFile(loaded.access, file, session.user.id)) {
    return apiError("You do not have edit access to this document.", 403);
  }
  if (parsed.data.baseVersion !== file.versionNumber) {
    return apiError(
      `Someone saved version ${file.versionNumber} while you were editing. Reload to merge your changes.`,
      409,
    );
  }

  const nextVersion = file.versionNumber + 1;
  const title = parsed.data.title ?? file.title;
  // Guarded metadata merge: a response's identity (request/provider) can
  // never be rewritten through a save — only the submitted flag may flip.
  const prevMeta = (file.metadata ?? {}) as Record<string, unknown>;
  const incomingMeta = (parsed.data.metadata ?? {}) as Record<string, unknown>;
  const mergedMeta: Record<string, unknown> = { ...prevMeta, ...incomingMeta };
  const prevResponse = prevMeta.response as { requestId?: string; providerId?: string; submitted?: boolean } | undefined;
  if (prevResponse && typeof prevResponse === "object") {
    const incomingResponse = (incomingMeta.response ?? {}) as { submitted?: boolean };
    mergedMeta.response = {
      requestId: prevResponse.requestId,
      providerId: prevResponse.providerId,
      submitted: incomingResponse.submitted === true ? true : prevResponse.submitted === true,
    };
  }
  try {
    await db.transaction(async (tx) => {
      const updated = await tx
        .update(projectFiles)
        .set({
          title,
          documentType: parsed.data.documentType ?? file.documentType,
          contentJson: parsed.data.contentJson,
          textCache: tiptapToText(parsed.data.contentJson, TEXT_CACHE_CHARS),
          metadata: mergedMeta,
          versionNumber: nextVersion,
          updatedBy: session.user.id,
        })
        .where(and(eq(projectFiles.id, file.id), eq(projectFiles.versionNumber, file.versionNumber)))
        .returning({ id: projectFiles.id });
      if (updated.length === 0) {
        throw new ConflictError("Someone saved a newer version while you were editing. Reload to merge your changes.");
      }
      await tx.insert(projectFileVersions).values({
        fileId: file.id,
        versionNumber: nextVersion,
        title,
        contentJson: parsed.data.contentJson,
        metadata: parsed.data.milestone ? { milestone: parsed.data.milestone } : {},
        createdBy: session.user.id,
      });
    });
  } catch (error) {
    if (error instanceof ConflictError) return apiError(error.message, 409);
    throw error;
  }
  await logActivity(loaded.project.id, session.user.id, "file.saved", "file", file.id, {
    title,
    version: nextVersion,
    milestone: parsed.data.milestone ?? null,
  });
  // A provider response transitioning to submitted notifies the requester side.
  const responseMeta = (file.metadata ?? {}) as { response?: { requestId?: string; submitted?: boolean } };
  const submittedNow = (parsed.data.metadata as { response?: { submitted?: boolean } } | undefined)?.response?.submitted === true;
  if (responseMeta.response?.requestId && submittedNow && !responseMeta.response.submitted) {
    const { fundingRequests, groupMembers } = await import("@/db/schema");
    const [request] = await db
      .select()
      .from(fundingRequests)
      .where(eq(fundingRequests.id, responseMeta.response.requestId))
      .limit(1);
    if (request) {
      const recipients = new Set<string>();
      if (request.requesterType === "individual") recipients.add(request.requesterId);
      else {
        const admins = await db
          .select({ userId: groupMembers.userId })
          .from(groupMembers)
          .where(
            and(
              eq(groupMembers.groupId, request.requesterId),
              eq(groupMembers.status, "active"),
              eq(groupMembers.role, "admin"),
            ),
          );
        for (const a of admins) recipients.add(a.userId);
      }
      for (const recipient of recipients) {
        await notify({
          userId: recipient,
          type: "request",
          title: "Provider response submitted",
          body: `"${title}" was submitted for "${loaded.project.title}".`,
          resourceType: "request",
          resourceId: request.id,
        });
      }
      await logActivity(loaded.project.id, session.user.id, "response.created", "file", file.id, {
        title,
        requestId: request.id,
        submitted: true,
      });
    }
  }
  for (const userId of await projectAudience(loaded.project.id)) {
    if (userId === session.user.id) continue;
    await notify({
      userId,
      type: "project",
      title: "Document updated",
      body: `${session.user.name} saved "${title}" (v${nextVersion}) in "${loaded.project.title}".`,
      resourceType: "project_file",
      resourceId: file.id,
    });
  }
  return apiOk({ versionNumber: nextVersion });
}

class ConflictError extends Error {}

/** Delete a document (editors and above, never a provider response by others). */
export async function DELETE(_req: Request, { params }: RouteContext) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const { id, fileId } = await params;
  const loaded = await loadProjectWithAccess(id, session.user.id, session.user.role);
  if (!loaded.ok) return apiError(loaded.error, loaded.status);

  const db = getDb();
  const [file] = await db
    .select()
    .from(projectFiles)
    .where(and(eq(projectFiles.id, fileId), eq(projectFiles.projectId, loaded.project.id)))
    .limit(1);
  if (!file) return apiError("Document not found.", 404);
  if (!canEditFile(loaded.access, file, session.user.id)) {
    return apiError("You do not have delete access to this document.", 403);
  }
  await db.delete(projectFiles).where(eq(projectFiles.id, file.id));
  await logActivity(loaded.project.id, session.user.id, "file.deleted", "file", file.id, { title: file.title });
  return apiOk({ deleted: true });
}

/** Move a document between folders (same edit rights as saving). */
export async function PUT(req: Request, { params }: RouteContext) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const { id, fileId } = await params;
  const loaded = await loadProjectWithAccess(id, session.user.id, session.user.role);
  if (!loaded.ok) return apiError(loaded.error, loaded.status);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body.");
  }
  const folderId = (body as { folderId?: unknown }).folderId;
  if (typeof folderId !== "string" || !folderId) return apiError("Choose a destination folder.", 400);

  const db = getDb();
  const [file] = await db
    .select()
    .from(projectFiles)
    .where(and(eq(projectFiles.id, fileId), eq(projectFiles.projectId, loaded.project.id)))
    .limit(1);
  if (!file) return apiError("Document not found.", 404);
  if (!canEditFile(loaded.access, file, session.user.id)) {
    return apiError("You do not have edit access to this document.", 403);
  }
  const [folder] = await db
    .select({ id: projectFolders.id })
    .from(projectFolders)
    .where(and(eq(projectFolders.id, folderId), eq(projectFolders.projectId, loaded.project.id)))
    .limit(1);
  if (!folder) return apiError("Folder not found.", 404);
  await db.update(projectFiles).set({ folderId: folder.id }).where(eq(projectFiles.id, file.id));
  await logActivity(loaded.project.id, session.user.id, "file.moved", "file", file.id, { title: file.title });
  return apiOk({ moved: true });
}
