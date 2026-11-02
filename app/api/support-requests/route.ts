import { and, desc, eq, inArray, isNotNull, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import {
  documents,
  groupApprovals,
  groupMembers,
  organizationMembers,
  organizations,
  projectFiles,
  projects,
  supportRequestDocuments,
  supportRequestEvents,
  supportRequests,
  users,
} from "@/db/schema";
import { apiError, apiOk } from "@/lib/api-response";
import { ensureSupportConversation } from "@/lib/support-requests";
import { eligibleSupportRecipient } from "@/lib/support-request-policy";
import { hasVerifiedProviderService } from "@/lib/provider-eligibility";
import { getSession } from "@/lib/session";
import { notify } from "@/lib/notify";

const createSchema = z.object({
  projectId: z.string().uuid(),
  groupId: z.string().uuid().optional(),
  targetOrganizationId: z.string().uuid().optional(),
  targetProviderId: z.string().uuid().optional(),
  serviceCategory: z.string().trim().min(2).max(100),
  summary: z.string().trim().min(8).max(240),
  details: z.string().trim().max(5000).optional(),
  priority: z.enum(["normal", "high"]).default("normal"),
  shareDocumentIds: z.array(z.string().uuid()).max(20).default([]),
}).refine((value) => Boolean(value.targetOrganizationId) !== Boolean(value.targetProviderId), {
  message: "Choose exactly one organization or support provider.",
  path: ["targetOrganizationId"],
});

/** Authorized case inbox. Group cases are visible only to active group members. */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const db = getDb();
  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId");
  if (projectId) {
    const groupId = url.searchParams.get("groupId");
    const [project] = await db.select({ id: projects.id, ownerId: projects.ownerId, groupId: projects.groupId }).from(projects).where(eq(projects.id, projectId)).limit(1);
    const isGroupAdmin = Boolean(groupId && project?.groupId === groupId && (await db.select({ id: groupMembers.id }).from(groupMembers).where(and(
      eq(groupMembers.groupId, groupId), eq(groupMembers.userId, session.user.id), eq(groupMembers.role, "admin"), eq(groupMembers.status, "active"),
    )).limit(1))[0]);
    if (!project || (project.ownerId !== session.user.id && !isGroupAdmin)) return apiError("Only the project owner or selected group admin can select files to share.", 403);
    const availableDocuments = await db.select({ id: documents.id, filename: documents.filename, title: projectFiles.title })
      .from(projectFiles).innerJoin(documents, eq(documents.id, projectFiles.attachmentId))
      .where(and(eq(projectFiles.projectId, projectId), isNotNull(projectFiles.attachmentId), eq(documents.ownerId, session.user.id)))
      .orderBy(desc(projectFiles.updatedAt)).limit(50);
    return apiOk({ documents: availableDocuments });
  }
  const [groups, organizationsForUser] = await Promise.all([
    db.select({ id: groupMembers.groupId }).from(groupMembers).where(and(eq(groupMembers.userId, session.user.id), eq(groupMembers.status, "active"))),
    db.select({ id: organizationMembers.organizationId, role: organizationMembers.role }).from(organizationMembers).where(and(eq(organizationMembers.userId, session.user.id), eq(organizationMembers.status, "active"))),
  ]);
  const verifiedSupportProvider = session.user.role === "provider" && session.user.providerKind === "support" && await hasVerifiedProviderService(session.user.id, "support");
  const managerOrgIds = organizationsForUser.filter((member) => member.role === "owner" || member.role === "admin").map((member) => member.id);
  const scopes = [
    eq(supportRequests.requesterUserId, session.user.id),
    verifiedSupportProvider ? and(eq(supportRequests.targetProviderId, session.user.id), ne(supportRequests.status, "pending_group_approval")) : undefined,
    eq(supportRequests.assignedUserId, session.user.id),
    groups.length ? inArray(supportRequests.requesterGroupId, groups.map((row) => row.id)) : undefined,
    managerOrgIds.length ? and(inArray(supportRequests.targetOrganizationId, managerOrgIds), ne(supportRequests.status, "pending_group_approval")) : undefined,
  ].filter(Boolean);
  const rows = await db.select({
    id: supportRequests.id,
    projectId: supportRequests.projectId,
    projectTitle: projects.title,
    requesterUserId: supportRequests.requesterUserId,
    requesterName: users.name,
    requesterGroupId: supportRequests.requesterGroupId,
    targetOrganizationId: supportRequests.targetOrganizationId,
    targetProviderId: supportRequests.targetProviderId,
    serviceCategory: supportRequests.serviceCategory,
    summary: supportRequests.summary,
    status: supportRequests.status,
    priority: supportRequests.priority,
    assignedUserId: supportRequests.assignedUserId,
    targetName: sql<string | null>`COALESCE((SELECT name FROM users WHERE id = ${supportRequests.targetProviderId}), (SELECT name FROM organizations WHERE id = ${supportRequests.targetOrganizationId}))`,
    createdAt: supportRequests.createdAt,
    updatedAt: supportRequests.updatedAt,
  }).from(supportRequests)
    .innerJoin(projects, eq(projects.id, supportRequests.projectId))
    .innerJoin(users, eq(users.id, supportRequests.requesterUserId))
    .where(scopes.length ? or(...scopes) : eq(supportRequests.requesterUserId, session.user.id))
    .orderBy(desc(supportRequests.updatedAt)).limit(50);
  return apiOk({ requests: rows });
}

/** Create a scoped support case and grant only the documents the requester selected. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  let raw: unknown;
  try { raw = await req.json(); } catch { return apiError("Invalid request body."); }
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) return apiError("Complete the support request details and choose one eligible recipient.", 400);
  const input = parsed.data;
  const db = getDb();

  const [project] = await db.select().from(projects).where(eq(projects.id, input.projectId)).limit(1);
  if (!project) return apiError("Project not found.", 404);
  if (input.groupId) {
    if (project.groupId !== input.groupId) return apiError("Choose a project owned by the selected group.", 403);
    const [member] = await db.select({ role: groupMembers.role }).from(groupMembers).where(and(
      eq(groupMembers.groupId, input.groupId), eq(groupMembers.userId, session.user.id), eq(groupMembers.status, "active"),
    )).limit(1);
    if (!member) return apiError("Active group membership is required.", 403);
  } else if (project.ownerId !== session.user.id) {
    return apiError("Only the project owner can submit a personal support request.", 403);
  }

  let recipientId: string;
  if (input.targetProviderId) {
    const [provider] = await db.select({ id: users.id, role: users.role, providerKind: users.providerKind, status: users.status }).from(users).where(eq(users.id, input.targetProviderId)).limit(1);
    if (!provider || !eligibleSupportRecipient({ providerRole: provider.role, providerKind: provider.providerKind, providerStatus: provider.status }) || !(await hasVerifiedProviderService(provider.id, "support"))) return apiError("That provider is not accepting non-financial support requests until its service profile is verified.", 400);
    recipientId = provider.id;
  } else {
    const [organization] = await db.select().from(organizations).where(eq(organizations.id, input.targetOrganizationId!)).limit(1);
    if (!organization || !eligibleSupportRecipient({ organizationKind: organization.kind, organizationCategory: organization.category, organizationVerificationStatus: organization.verificationStatus })) return apiError("Choose a verified organization that offers non-financial support.", 400);
    recipientId = organization.ownerId;
  }

  if (input.shareDocumentIds.length) {
    const owned = await db.select({ id: documents.id }).from(documents).where(and(
      inArray(documents.id, input.shareDocumentIds), eq(documents.ownerId, session.user.id), eq(documents.module, "project"),
    ));
    const attached = await db.select({ attachmentId: projectFiles.attachmentId }).from(projectFiles).where(and(
      eq(projectFiles.projectId, project.id), inArray(projectFiles.attachmentId, input.shareDocumentIds),
    ));
    const attachedIds = new Set(attached.map((row) => row.attachmentId));
    if (owned.length !== input.shareDocumentIds.length || input.shareDocumentIds.some((id) => !attachedIds.has(id))) {
      return apiError("Only project files you own and explicitly attach to this workspace can be shared.", 403);
    }
  }

  const groupSubmission = Boolean(input.groupId);
  const status = groupSubmission ? "pending_group_approval" : "pending";
  const created = await db.transaction(async (tx) => {
    const [request] = await tx.insert(supportRequests).values({
      projectId: project.id,
      requesterUserId: session.user.id,
      requesterGroupId: input.groupId ?? null,
      targetOrganizationId: input.targetOrganizationId ?? null,
      targetProviderId: input.targetProviderId ?? null,
      serviceCategory: input.serviceCategory,
      summary: input.summary,
      details: input.details || null,
      priority: input.priority,
      status,
    }).returning({ id: supportRequests.id });
    await tx.insert(supportRequestEvents).values({
      requestId: request.id,
      actorId: session.user.id,
      event: groupSubmission ? "submitted_for_group_approval" : "submitted",
      toStatus: status,
    });
    if (input.shareDocumentIds.length) {
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await tx.insert(supportRequestDocuments).values(input.shareDocumentIds.map((documentId) => ({
        requestId: request.id, documentId, grantedBy: session.user.id, permission: "view", expiresAt,
      })));
    }
    if (groupSubmission) await tx.insert(groupApprovals).values({
      groupId: input.groupId!, requestedBy: session.user.id, kind: "support_request",
      referenceType: "support_request", referenceId: request.id,
    });
    return request;
  });

  let conversationId: string | null = null;
  if (!groupSubmission) {
    try { conversationId = await ensureSupportConversation(created.id); }
    catch (error) { console.error(`[support-request:conversation] ${created.id}:`, error instanceof Error ? error.message : error); }
  }
  if (!groupSubmission) await notify({
    userId: recipientId,
    type: "support_request",
    title: "New support request",
    body: input.summary,
    resourceType: "support_request",
    resourceId: created.id,
  });
  return apiOk({ requestId: created.id, status, conversationId }, 201);
}
