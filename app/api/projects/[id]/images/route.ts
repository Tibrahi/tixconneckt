import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { documents, projectFiles, projectFolders } from "@/db/schema";
import { apiError, apiOk } from "@/lib/api-response";
import { canEditFile, canViewFile, loadProjectWithAccess } from "@/lib/project-access";
import { getSession } from "@/lib/session";
import { buildStorageKey, uploadPrivateObject, validateProjectUpload } from "@/lib/storage";
import { rateLimit } from "@/lib/rate-limit";

const IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

/**
 * Upload an inline image for the document being edited. The image is stored
 * privately and linked into the file's metadata — the editor embeds a
 * `tixdoc://` reference that the file endpoint resolves to a signed URL
 * only for viewers authorized to open the file.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const rl = await rateLimit("project-image", session.user.id, 60, "1 h");
  if (!rl.allowed) return apiError("Too many uploads. Please try again later.", 429);
  const { id } = await params;
  const loaded = await loadProjectWithAccess(id, session.user.id, session.user.role);
  if (!loaded.ok) return apiError(loaded.error, loaded.status);

  const form = await req.formData();
  const file = form.get("file");
  const fileId = String(form.get("fileId") ?? "");
  if (!(file instanceof File)) return apiError("No file provided.", 400);
  if (!fileId) return apiError("Choose the document for this image.", 400);

  const db = getDb();
  const [target] = await db
    .select()
    .from(projectFiles)
    .where(and(eq(projectFiles.id, fileId), eq(projectFiles.projectId, id)))
    .limit(1);
  if (!target) return apiError("Document not found.", 404);
  const folders = await db
    .select({ id: projectFolders.id, parentFolderId: projectFolders.parentFolderId })
    .from(projectFolders)
    .where(eq(projectFolders.projectId, id))
    .limit(500);
  const map = new Map(folders.map((f) => [f.id, { id: f.id, parentFolderId: f.parentFolderId }]));
  if (!canViewFile(loaded.access, target, map, session.user.id)) {
    return apiError("This document is not shared with you.", 403);
  }
  if (!canEditFile(loaded.access, target, session.user.id)) {
    return apiError("You do not have edit access to this document.", 403);
  }

  const mime = (file.type || "").split(";")[0].trim().toLowerCase();
  if (!IMAGE_MIMES.has(mime)) return apiError("Only PNG, JPEG, GIF, or WebP images can be embedded.", 400);
  const buffer = Buffer.from(await file.arrayBuffer());
  const problem = validateProjectUpload(mime, buffer.length, buffer);
  if (problem) return apiError(problem, 400);

  const key = buildStorageKey(session.user.id, "project", file.name);
  const uploaded = await uploadPrivateObject(key, buffer, mime);
  if (!uploaded.ok) return apiError("We couldn't store your image. Please try again.", 502);

  const [doc] = await db
    .insert(documents)
    .values({
      ownerId: session.user.id,
      module: "project",
      filename: file.name.slice(0, 200),
      mimeType: mime,
      sizeBytes: buffer.length,
      storageKey: key,
    })
    .returning({ id: documents.id });

  const meta = (target.metadata ?? {}) as Record<string, unknown>;
  const images = Array.isArray(meta.images) ? (meta.images as string[]).filter((v) => typeof v === "string") : [];
  images.push(doc.id);
  await db
    .update(projectFiles)
    .set({ metadata: { ...meta, images: images.slice(-100) }, updatedBy: session.user.id })
    .where(eq(projectFiles.id, target.id));

  return apiOk({ documentId: doc.id, ref: `tixdoc://${doc.id}` }, 201);
}
