import { and, desc, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import {
  conversationMembers,
  conversations,
  documents,
  groupMembers,
  organizationMembers,
  organizations,
  projects,
  supportRequestDocuments,
  supportRequestEvents,
  supportRequests,
  users,
} from "@/db/schema";
import { apiError, apiOk } from "@/lib/api-response";
import { getSession } from "@/lib/session";
import { notify } from "@/lib/notify";
import { canTransitionSupportRequest, type SupportStatus } from "@/lib/support-request-policy";
import { hasVerifiedProviderService } from "@/lib/provider-eligibility";

const updateSchema = z.object({
  status: z.enum(["withdrawn", "triage", "awaiting_requester", "accepted", "declined", "resolved"]).optional(),
  assignedUserId: z.string().uuid().nullable().optional(),
  note: z.string().trim().max(2000).optional(),
}).refine((value) => value.status !== undefined || value.assignedUserId !== undefined, "Make a case update.");

async function authorized(requestId: string, userId: string, role: string) {
  const db = getDb();
  const [request] = await db.select().from(supportRequests).where(eq(supportRequests.id, requestId)).limit(1);
  if (!request) return null;
  if (role === "admin" || request.requesterUserId === userId) return request;
  if (request.status === "pending_group_approval") {
    if (!request.requesterGroupId) return null;
    const [member] = await db.select({ id: groupMembers.id }).from(groupMembers).where(and(
      eq(groupMembers.groupId, request.requesterGroupId), eq(groupMembers.userId, userId), eq(groupMembers.status, "active"),
    )).limit(1);
    return member ? request : null;
  }
  if (request.targetProviderId === userId && role === "provider") {
    const [provider] = await db.select({ providerKind: users.providerKind, status: users.status }).from(users).where(eq(users.id, userId)).limit(1);
    if (provider?.status === "active" && provider.providerKind === "support" && await hasVerifiedProviderService(userId, "support")) return request;
  }
  if (request.requesterGroupId) {
    const [groupMember] = await db.select({ id: groupMembers.id }).from(groupMembers).where(and(
      eq(groupMembers.groupId, request.requesterGroupId), eq(groupMembers.userId, userId), eq(groupMembers.status, "active"),
    )).limit(1);
    if (groupMember) return request;
  }
  if (request.targetOrganizationId) {
    const [member] = await db.select({ id: organizationMembers.id, role: organizationMembers.role }).from(organizationMembers).innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId)).where(and(
      eq(organizationMembers.organizationId, request.targetOrganizationId),
      eq(organizationMembers.userId, userId),
      eq(organizationMembers.status, "active"),
      eq(organizations.verificationStatus, "verified"),
    )).limit(1);
    if (member && (member.role === "owner" || member.role === "admin" || request.assignedUserId === userId)) return request;
  }
  return null;
}

/** Case details include only fields submitted to this recipient and granted files. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const { id } = await params;
  const request = await authorized(id, session.user.id, session.user.role);
  if (!request) return apiError("Support request not found or access denied.", 404);
  const db = getDb();
  const [project] = await db.select({ id: projects.id, title: projects.title, summary: projects.summary, stage: projects.stage })
    .from(projects).where(eq(projects.id, request.projectId)).limit(1);
  const [requester] = await db.select({ name: users.name, shortId: users.shortId }).from(users).where(eq(users.id, request.requesterUserId)).limit(1);
  const [conversation] = await db.select({ id: conversations.id }).from(conversations).where(eq(conversations.supportRequestId, id)).limit(1);
  const isRequester = request.requesterUserId === session.user.id || Boolean(request.requesterGroupId && (await db.select({ id: groupMembers.id }).from(groupMembers).where(and(
    eq(groupMembers.groupId, request.requesterGroupId), eq(groupMembers.userId, session.user.id), eq(groupMembers.role, "admin"), eq(groupMembers.status, "active"),
  )).limit(1))[0]);
  let memberRole: string | null = null;
  if (request.targetOrganizationId) {
    const [member] = await db.select({ role: organizationMembers.role }).from(organizationMembers).innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId)).where(and(
      eq(organizationMembers.organizationId, request.targetOrganizationId), eq(organizationMembers.userId, session.user.id), eq(organizationMembers.status, "active"), eq(organizations.verificationStatus, "verified"),
    )).limit(1);
    memberRole = member?.role ?? null;
  }
  const verifiedSupportProvider = request.targetProviderId === session.user.id && session.user.role === "provider" && session.user.providerKind === "support" && await hasVerifiedProviderService(session.user.id, "support");
  const canRespond = request.status !== "pending_group_approval" && (session.user.role === "admin" || verifiedSupportProvider || Boolean(memberRole && (memberRole === "owner" || memberRole === "admin" || request.assignedUserId === session.user.id)));
  const canAssign = request.status !== "pending_group_approval" && (session.user.role === "admin" || memberRole === "owner" || memberRole === "admin" || verifiedSupportProvider);
  const assignees = canAssign && request.targetOrganizationId ? await db.select({ id: organizationMembers.userId, name: users.name, jobTitle: organizationMembers.jobTitle })
    .from(organizationMembers).innerJoin(users, eq(users.id, organizationMembers.userId))
    .where(and(eq(organizationMembers.organizationId, request.targetOrganizationId), eq(organizationMembers.status, "active"))).limit(100) : [];
  const files = await db.select({
    grantId: supportRequestDocuments.id,
    documentId: documents.id,
    filename: documents.filename,
    mimeType: documents.mimeType,
    expiresAt: supportRequestDocuments.expiresAt,
  }).from(supportRequestDocuments).innerJoin(documents, eq(documents.id, supportRequestDocuments.documentId))
    .where(and(eq(supportRequestDocuments.requestId, id), gt(supportRequestDocuments.expiresAt, new Date())));
  const events = await db.select({
    id: supportRequestEvents.id,
    event: supportRequestEvents.event,
    fromStatus: supportRequestEvents.fromStatus,
    toStatus: supportRequestEvents.toStatus,
    note: supportRequestEvents.note,
    createdAt: supportRequestEvents.createdAt,
    actorName: users.name,
  }).from(supportRequestEvents).leftJoin(users, eq(users.id, supportRequestEvents.actorId))
    .where(eq(supportRequestEvents.requestId, id)).orderBy(desc(supportRequestEvents.createdAt)).limit(100);
  return apiOk({ request, project, requester, conversationId: conversation?.id ?? null, files, events, assignees, permissions: { canRespond, canWithdraw: isRequester, canAssign } });
}

/** Explicit requester withdrawal and authorized recipient triage/assignment. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return apiError("Invalid case update.", 400);
  const db = getDb();
  const request = await authorized(id, session.user.id, session.user.role);
  if (!request) return apiError("Support request not found or access denied.", 404);

  const requester = request.requesterUserId === session.user.id || Boolean(request.requesterGroupId && (await db.select({ id: groupMembers.id }).from(groupMembers).where(and(
    eq(groupMembers.groupId, request.requesterGroupId), eq(groupMembers.userId, session.user.id), eq(groupMembers.role, "admin"), eq(groupMembers.status, "active"),
  )).limit(1))[0]);
  const directProvider = request.targetProviderId === session.user.id && session.user.role === "provider" && session.user.providerKind === "support" && await hasVerifiedProviderService(session.user.id, "support");
  let orgMembership: { role: string } | undefined;
  if (request.targetOrganizationId) {
    const [member] = await db.select({ role: organizationMembers.role }).from(organizationMembers).innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId)).where(and(
      eq(organizationMembers.organizationId, request.targetOrganizationId), eq(organizationMembers.userId, session.user.id), eq(organizationMembers.status, "active"), eq(organizations.verificationStatus, "verified"),
    )).limit(1);
    orgMembership = member;
  }
  const recipient = directProvider || Boolean(orgMembership);
  const canAssign = directProvider || orgMembership?.role === "owner" || orgMembership?.role === "admin";
  if (!requester && !recipient && session.user.role !== "admin") return apiError("Only case participants can update this request.", 403);

  if (parsed.data.status) {
    const actor = session.user.role === "admin" ? "admin" : requester ? "requester" : recipient ? "recipient" : "requester";
    if (parsed.data.status === "withdrawn" && !requester && session.user.role !== "admin") return apiError("Only the requester can withdraw this case.", 403);
    if (parsed.data.status !== "withdrawn" && !recipient && session.user.role !== "admin") return apiError("Only the assigned recipient can change this case.", 403);
    if (!canTransitionSupportRequest(request.status as SupportStatus, parsed.data.status as SupportStatus, actor)) return apiError("That case transition is not allowed.", 409);
  }
  if (parsed.data.assignedUserId !== undefined) {
    if (!canAssign && session.user.role !== "admin") return apiError("Only a case manager can assign this request.", 403);
    if (parsed.data.assignedUserId && request.targetOrganizationId) {
      const [assignee] = await db.select({ id: organizationMembers.id }).from(organizationMembers).where(and(
        eq(organizationMembers.organizationId, request.targetOrganizationId), eq(organizationMembers.userId, parsed.data.assignedUserId), eq(organizationMembers.status, "active"),
      )).limit(1);
      if (!assignee) return apiError("The assignee must be an active member of the receiving organization.", 400);
    } else if (parsed.data.assignedUserId && request.targetProviderId !== parsed.data.assignedUserId) {
      return apiError("A direct provider request can only be assigned to that provider.", 400);
    }
  }

  const nextStatus = parsed.data.status ?? request.status;
  await db.transaction(async (tx) => {
    await tx.update(supportRequests).set({
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
      ...(parsed.data.assignedUserId !== undefined ? { assignedUserId: parsed.data.assignedUserId } : {}),
      ...(parsed.data.note !== undefined ? { decisionNote: parsed.data.note || null } : {}),
      ...(parsed.data.status === "resolved" || parsed.data.status === "withdrawn" || parsed.data.status === "declined" ? { resolvedAt: new Date() } : {}),
      updatedAt: new Date(),
    }).where(eq(supportRequests.id, id));
    await tx.insert(supportRequestEvents).values({
      requestId: id,
      actorId: session.user.id,
      event: parsed.data.status ? "status_changed" : "assigned",
      fromStatus: parsed.data.status ? request.status : null,
      toStatus: parsed.data.status ?? null,
      note: parsed.data.note ?? null,
    });
    if (["resolved", "withdrawn", "declined"].includes(nextStatus)) {
      await tx.update(supportRequestDocuments).set({ expiresAt: new Date() }).where(eq(supportRequestDocuments.requestId, id));
    }
    if (parsed.data.assignedUserId) {
      const [conversation] = await tx.select({ id: conversations.id }).from(conversations).where(eq(conversations.supportRequestId, id)).limit(1);
      if (conversation) await tx.insert(conversationMembers).values({ conversationId: conversation.id, userId: parsed.data.assignedUserId, role: "member" }).onConflictDoNothing();
    }
  });
  await notify({
    userId: request.requesterUserId,
    type: "support_request",
    title: parsed.data.status ? `Support case ${parsed.data.status.replace(/_/g, " ")}` : "Support case assigned",
    body: parsed.data.note,
    resourceType: "support_request",
    resourceId: id,
  });
  return apiOk({ updated: true, status: nextStatus });
}
