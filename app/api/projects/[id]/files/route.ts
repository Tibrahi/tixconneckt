import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { documents, projectFiles, projectFileVersions, projectFolders } from "@/db/schema";
import { apiError, apiOk } from "@/lib/api-response";
import { loadProjectWithAccess, logActivity, projectAudience } from "@/lib/project-access";
import { TEXT_CACHE_CHARS, tiptapToText, validateTiptapDoc } from "@/lib/project-docs";
import { notify } from "@/lib/notify";
import { getSession } from "@/lib/session";
import { projectFileCreateSchema } from "@/lib/validation";

/** Create a document in a folder (editors and above). Starts at version 1. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const { id } = await params;
  const loaded = await loadProjectWithAccess(id, session.user.id, session.user.role);
  if (!loaded.ok) return apiError(loaded.error, loaded.status);
  if (!loaded.access.canEdit) return apiError("You need edit access to create documents.", 403);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body.");
  }
  const parsed = projectFileCreateSchema.safeParse(body);
  if (!parsed.success) return apiError("Give the document a title.", 400);

  const db = getDb();
  const [folder] = await db
    .select({ id: projectFolders.id })
    .from(projectFolders)
    .where(and(eq(projectFolders.id, parsed.data.folderId), eq(projectFolders.projectId, loaded.project.id)))
    .limit(1);
  if (!folder) return apiError("Folder not found.", 404);

  if (parsed.data.attachmentId) {
    const [doc] = await db
      .select({ id: documents.id, ownerId: documents.ownerId, module: documents.module })
      .from(documents)
      .where(eq(documents.id, parsed.data.attachmentId))
      .limit(1);
    if (!doc || doc.ownerId !== session.user.id) return apiError("Attachment not found.", 404);
    if (doc.module !== "project") return apiError("Only files uploaded for projects can attach here.", 400);
  }

  const contentJson = parsed.data.contentJson ?? { type: "doc", content: [{ type: "paragraph" }] };
  const problem = validateTiptapDoc(contentJson);
  if (problem) return apiError(problem, 400);

  const [created] = await db
    .insert(projectFiles)
    .values({
      projectId: loaded.project.id,
      folderId: folder.id,
      title: parsed.data.title,
      documentType: parsed.data.documentType,
      contentJson,
      textCache: tiptapToText(contentJson, TEXT_CACHE_CHARS),
      metadata: parsed.data.metadata ?? {},
      attachmentId: parsed.data.attachmentId,
      versionNumber: 1,
      createdBy: session.user.id,
      updatedBy: session.user.id,
    })
    .returning({ id: projectFiles.id });
  await db.insert(projectFileVersions).values({
    fileId: created.id,
    versionNumber: 1,
    title: parsed.data.title,
    contentJson,
    metadata: { initial: true },
    createdBy: session.user.id,
  });
  await logActivity(loaded.project.id, session.user.id, "file.created", "file", created.id, {
    title: parsed.data.title,
  });
  for (const userId of await projectAudience(loaded.project.id)) {
    if (userId === session.user.id) continue;
    await notify({
      userId,
      type: "project",
      title: "Document created",
      body: `${session.user.name} created "${parsed.data.title}" in "${loaded.project.title}".`,
      resourceType: "project_file",
      resourceId: created.id,
    });
  }
  return apiOk({ fileId: created.id }, 201);
}
