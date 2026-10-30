import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { documents, projectFiles, projectFolders } from "@/db/schema";
import { apiError, apiOk } from "@/lib/api-response";
import { loadProjectWithAccess, logActivity, projectAudience } from "@/lib/project-access";
import { notify } from "@/lib/notify";
import { getSession } from "@/lib/session";
import { buildStorageKey, uploadPrivateObject, validateProjectUpload } from "@/lib/storage";
import { rateLimit } from "@/lib/rate-limit";

function documentTypeFor(mime: string): string {
  const base = mime.split(";")[0].trim().toLowerCase();
  if (base.startsWith("image/")) return "image";
  if (base === "application/pdf") return "pdf";
  if (base === "text/csv") return "spreadsheet";
  if (base === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") return "spreadsheet";
  if (base === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "word";
  if (base === "text/markdown") return "markdown";
  return "text";
}

/**
 * Upload a binary or text file into a project folder: validated by content
 * sniffing, stored in private object storage, and registered as a real
 * project file row (binary stays out of JSONB). Members are notified.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const rl = await rateLimit("project-upload", session.user.id, 30, "1 h");
  if (!rl.allowed) return apiError("Too many uploads. Please try again later.", 429);
  const { id } = await params;
  const loaded = await loadProjectWithAccess(id, session.user.id, session.user.role);
  if (!loaded.ok) return apiError(loaded.error, loaded.status);
  if (!loaded.access.canEdit) return apiError("You do not have edit access to this project.", 403);

  const form = await req.formData();
  const file = form.get("file");
  const folderId = String(form.get("folderId") ?? "");
  const title = String(form.get("title") ?? "").trim();
  if (!(file instanceof File)) return apiError("No file provided.", 400);
  if (!folderId) return apiError("Choose a folder for the upload.", 400);

  const db = getDb();
  const [folder] = await db
    .select({ id: projectFolders.id, projectId: projectFolders.projectId })
    .from(projectFolders)
    .where(eq(projectFolders.id, folderId))
    .limit(1);
  if (!folder || folder.projectId !== id) {
    return apiError("That folder is not in this project.", 400);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const problem = validateProjectUpload(file.type || "application/octet-stream", buffer.length, buffer);
  if (problem) return apiError(problem, 400);

  const key = buildStorageKey(session.user.id, "project", file.name);
  const uploaded = await uploadPrivateObject(key, buffer, file.type || "application/octet-stream");
  if (!uploaded.ok) {
    return apiError(
      uploaded.error === "File storage is disabled for phase one"
        ? "File uploads are unavailable in phase one. Your file was not saved."
        : "We couldn't store your file. Please try again.",
      502,
    );
  }

  const [doc] = await db
    .insert(documents)
    .values({
      ownerId: session.user.id,
      module: "project",
      filename: file.name.slice(0, 200),
      mimeType: file.type || "application/octet-stream",
      sizeBytes: buffer.length,
      storageKey: key,
    })
    .returning({ id: documents.id });

  const name = (title || file.name).slice(0, 200);
  const [created] = await db
    .insert(projectFiles)
    .values({
      projectId: id,
      folderId,
      title: name,
      documentType: documentTypeFor(file.type || ""),
      contentJson: {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: `Uploaded file: ${file.name}` }] }],
      },
      textCache: `${name}\n${file.name}`.slice(0, 2000),
      metadata: { attachment: { documentId: doc.id, filename: file.name.slice(0, 200), mimeType: file.type, sizeBytes: buffer.length } },
      attachmentId: doc.id,
      versionNumber: 1,
      createdBy: session.user.id,
      updatedBy: session.user.id,
    })
    .returning({ id: projectFiles.id });

  await logActivity(id, session.user.id, "file.uploaded", "file", created.id, {
    title: name,
    filename: file.name.slice(0, 200),
  });
  for (const userId of await projectAudience(id)) {
    if (userId === session.user.id) continue;
    await notify({
      userId,
      type: "project",
      title: "File uploaded",
      body: `${session.user.name} uploaded "${name}" to "${loaded.project.title}".`,
      resourceType: "project_file",
      resourceId: created.id,
    });
  }
  return apiOk({ fileId: created.id, documentId: doc.id }, 201);
}
