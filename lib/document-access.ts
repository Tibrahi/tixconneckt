import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  conversationMembers,
  messages,
  organizations,
  projectFiles,
  projectFolders,
  organizationMembers,
  supportRequestDocuments,
  supportRequests,
} from "@/db/schema";
import { canViewFile, loadProjectWithAccess } from "./project-access";

export interface DocumentIdentity {
  id: string;
  ownerId: string;
  module: string;
}

export interface AccessDenied {
  error: string;
  status: number;
}

/**
 * Shared authorization for private document bytes. Owners and admins always
 * pass; organization logos on public profiles pass for signed-in users; chat
 * attachments pass for members of a conversation whose live messages
 * reference the file; project files pass for viewers authorized to open the
 * linked file. Returns null when access is granted.
 */
export async function authorizeDocumentAccess(
  doc: DocumentIdentity,
  userId: string,
  userRole: string,
): Promise<AccessDenied | null> {
  if (doc.ownerId === userId || userRole === "admin") return null;
  const db = getDb();
  const grants = await db.select({ requestId: supportRequestDocuments.requestId })
    .from(supportRequestDocuments)
    .innerJoin(supportRequests, eq(supportRequests.id, supportRequestDocuments.requestId))
    .where(and(
      eq(supportRequestDocuments.documentId, doc.id),
      sql`(${supportRequestDocuments.expiresAt} IS NULL OR ${supportRequestDocuments.expiresAt} > now())`,
      sql`${supportRequests.status} <> 'pending_group_approval'`,
    )).limit(20);
  for (const grant of grants) {
    const [caseRow] = await db.select({ providerId: supportRequests.targetProviderId, organizationId: supportRequests.targetOrganizationId, assignedUserId: supportRequests.assignedUserId })
      .from(supportRequests).where(eq(supportRequests.id, grant.requestId)).limit(1);
    if (!caseRow) continue;
    if (caseRow.providerId === userId) return null;
    if (caseRow.organizationId) {
      const [member] = await db.select({ id: organizationMembers.id, role: organizationMembers.role })
        .from(organizationMembers)
        .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
        .where(and(
          eq(organizationMembers.organizationId, caseRow.organizationId),
          eq(organizationMembers.userId, userId),
          eq(organizationMembers.status, "active"),
          eq(organizations.verificationStatus, "verified"),
        )).limit(1);
      if (member && (member.role === "owner" || member.role === "admin" || caseRow.assignedUserId === userId)) return null;
    }
  }
  if (doc.module === "organization") {
    const [branded] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(and(eq(organizations.logoDocumentId, doc.id), eq(organizations.visibility, "public")))
      .limit(1);
    if (!branded) return { error: "You don't have access to this document.", status: 403 };
    return null;
  }
  if (doc.module === "project") {
    const [linked] = await db
      .select({
        id: projectFiles.id,
        projectId: projectFiles.projectId,
        folderId: projectFiles.folderId,
        metadata: projectFiles.metadata,
      })
      .from(projectFiles)
      .where(eq(projectFiles.attachmentId, doc.id))
      .limit(1);
    const embedded =
      linked ??
      (await db
        .select({
          id: projectFiles.id,
          projectId: projectFiles.projectId,
          folderId: projectFiles.folderId,
          metadata: projectFiles.metadata,
        })
        .from(projectFiles)
        .where(sql`${projectFiles.metadata} @> ${JSON.stringify({ images: [doc.id] })}`)
        .limit(1))[0];
    if (!embedded) return { error: "You don't have access to this document.", status: 403 };
    const loaded = await loadProjectWithAccess(embedded.projectId, userId, userRole);
    if (!loaded.ok) return { error: "You don't have access to this document.", status: 403 };
    const folders = await db
      .select({ id: projectFolders.id, parentFolderId: projectFolders.parentFolderId })
      .from(projectFolders)
      .where(eq(projectFolders.projectId, embedded.projectId))
      .limit(500);
    const map = new Map(folders.map((f) => [f.id, { id: f.id, parentFolderId: f.parentFolderId }]));
    if (!canViewFile(loaded.access, embedded, map, userId)) {
      return { error: "You don't have access to this document.", status: 403 };
    }
    return null;
  }
  if (doc.module !== "chat") return { error: "You don't have access to this document.", status: 403 };
  const refs = await db
    .select({ conversationId: messages.conversationId })
    .from(messages)
    .where(and(eq(messages.attachmentId, doc.id)))
    .limit(25);
  for (const ref of refs) {
    const [member] = await db
      .select({ id: conversationMembers.id })
      .from(conversationMembers)
      .where(
        and(
          eq(conversationMembers.conversationId, ref.conversationId),
          eq(conversationMembers.userId, userId),
        ),
      )
      .limit(1);
    if (member) return null;
  }
  return { error: "You don't have access to this document.", status: 403 };
}
