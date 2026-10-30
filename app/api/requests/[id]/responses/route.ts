import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { groupMembers, projectFiles, projectFileVersions, projectFolders } from "@/db/schema";
import { apiError, apiOk } from "@/lib/api-response";
import { loadRequestWithSide, logActivity } from "@/lib/project-access";
import { TEXT_CACHE_CHARS, tiptapToText, validateTiptapDoc } from "@/lib/project-docs";
import { notify } from "@/lib/notify";
import { getSession } from "@/lib/session";
import { providerResponseSchema } from "@/lib/validation";

/**
 * Provider response playground: the request's provider authors a response
 * document with a dynamic title and structure. The requester side is
 * notified on submit; drafts stay editable by the provider either way.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const { id } = await params;
  const loaded = await loadRequestWithSide(id, session.user.id);
  if ("error" in loaded) return apiError(loaded.error, loaded.status);
  if (loaded.side !== "provider") {
    return apiError("Only the request's provider can write a response.", 403);
  }
  const { request, project } = loaded;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body.");
  }
  const parsed = providerResponseSchema.safeParse(body);
  if (!parsed.success) return apiError("Give the response a title.", 400);
  const contentJson = parsed.data.contentJson ?? { type: "doc", content: [{ type: "paragraph" }] };
  const problem = validateTiptapDoc(contentJson);
  if (problem) return apiError(problem, 400);

  const db = getDb();
  let [folder] = await db
    .select({ id: projectFolders.id })
    .from(projectFolders)
    .where(and(eq(projectFolders.projectId, project.id), eq(projectFolders.name, "Provider Responses")))
    .limit(1);
  if (!folder) {
    const { ensureRootFolder } = await import("@/lib/project-access");
    const root = await ensureRootFolder(project.id, project.title, session.user.id);
    const [created] = await db
      .insert(projectFolders)
      .values({
        projectId: project.id,
        parentFolderId: root.id,
        name: "Provider Responses",
        description: "Response documents submitted by providers for funding requests.",
        createdBy: session.user.id,
      })
      .returning({ id: projectFolders.id });
    folder = created;
  }

  const [created] = await db
    .insert(projectFiles)
    .values({
      projectId: project.id,
      folderId: folder.id,
      title: parsed.data.title,
      documentType: parsed.data.documentType,
      contentJson,
      textCache: tiptapToText(contentJson, TEXT_CACHE_CHARS),
      metadata: {
        response: { requestId: id, providerId: session.user.id, submitted: parsed.data.submit },
      },
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

  if (parsed.data.submit) {
    // Notify the requester side (owner or group admins).
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
        body: `"${parsed.data.title}" was submitted for "${project.title}".`,
        resourceType: "request",
        resourceId: id,
      });
    }
  }

  await logActivity(project.id, session.user.id, "response.created", "file", created.id, {
    title: parsed.data.title,
    requestId: id,
    submitted: parsed.data.submit,
  });
  return apiOk({ fileId: created.id, submitted: parsed.data.submit }, 201);
}
