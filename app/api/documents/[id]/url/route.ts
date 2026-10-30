import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  conversationMembers,
  documents,
  messages,
  organizations,
  projectFiles,
  projectFolders,
} from "@/db/schema";
import { canViewFile, loadProjectWithAccess } from "@/lib/project-access";
import { apiError, apiOk } from "@/lib/api-response";
import { getSession } from "@/lib/session";
import { getPrivateObjectUrl } from "@/lib/storage";

/**
 * Mint a short-lived, authorized download URL for a private document.
 * Owners and admins always pass; chat attachments additionally pass for
 * members of a conversation whose live messages reference the file.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const { id } = await params;
  const db = getDb();
  const [doc] = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
  if (!doc) return apiError("Document not found.", 404);
  if (doc.ownerId !== session.user.id && session.user.role !== "admin") {
    // Organization logos on public profiles are visible to signed-in users.
    if (doc.module === "organization") {
      const [branded] = await db
        .select({ id: organizations.id })
        .from(organizations)
        .where(and(eq(organizations.logoDocumentId, doc.id), eq(organizations.visibility, "public")))
        .limit(1);
      if (!branded) return apiError("You don't have access to this document.", 403);
    } else if (doc.module === "project") {
      // Linked to a project file (upload or embedded image): whoever may
      // open the file may fetch bytes.
      const [linked] = await db
        .select({ id: projectFiles.id, projectId: projectFiles.projectId, folderId: projectFiles.folderId, metadata: projectFiles.metadata })
        .from(projectFiles)
        .where(eq(projectFiles.attachmentId, doc.id))
        .limit(1);
      const embedded =
        linked ??
        (await db
          .select({ id: projectFiles.id, projectId: projectFiles.projectId, folderId: projectFiles.folderId, metadata: projectFiles.metadata })
          .from(projectFiles)
          .where(sql`${projectFiles.metadata} @> ${JSON.stringify({ images: [doc.id] })}`)
          .limit(1))[0];
      if (!embedded) return apiError("You don't have access to this document.", 403);
      const loaded = await loadProjectWithAccess(embedded.projectId, session.user.id, session.user.role);
      if (!loaded.ok) return apiError("You don't have access to this document.", 403);
      const folders = await db
        .select({ id: projectFolders.id, parentFolderId: projectFolders.parentFolderId })
        .from(projectFolders)
        .where(eq(projectFolders.projectId, embedded.projectId))
        .limit(500);
      const map = new Map(folders.map((f) => [f.id, { id: f.id, parentFolderId: f.parentFolderId }]));
      if (!canViewFile(loaded.access, embedded, map, session.user.id)) {
        return apiError("You don't have access to this document.", 403);
      }
    } else if (doc.module !== "chat") {
      return apiError("You don't have access to this document.", 403);
    }
    // Chat attachment: member of a conversation referencing it in a live message.
    if (doc.module === "chat") {
      const refs = await db
        .select({ conversationId: messages.conversationId })
        .from(messages)
        .where(and(eq(messages.attachmentId, doc.id)))
        .limit(25);
      let allowed = false;
      for (const ref of refs) {
        const [member] = await db
          .select({ id: conversationMembers.id })
          .from(conversationMembers)
          .where(
            and(
              eq(conversationMembers.conversationId, ref.conversationId),
              eq(conversationMembers.userId, session.user.id),
            ),
          )
          .limit(1);
        if (member) {
          allowed = true;
          break;
        }
      }
      if (!allowed) return apiError("You don't have access to this document.", 403);
    }
  }
  const url = await getPrivateObjectUrl(doc.storageKey, 300);
  if (!url) return apiError("Document storage is unavailable.", 502);
  return apiOk({
    url,
    filename: doc.filename,
    mimeType: doc.mimeType,
    expiresInSeconds: 300,
  });
}
