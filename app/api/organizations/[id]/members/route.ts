import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { conversationMembers, conversations, organizationAccessRequests, organizationMembers, organizations, supportRequests, users } from "@/db/schema";
import { apiError, apiOk } from "@/lib/api-response";
import { getSession } from "@/lib/session";
import { audit } from "@/lib/audit";

const requestSchema = z.object({
  jobTitle: z.string().trim().min(2).max(120),
  message: z.string().trim().max(1000).optional(),
});
const decisionSchema = z.object({
  requestId: z.string().uuid(),
  decision: z.enum(["approved", "rejected"]),
});
const revokeSchema = z.object({ memberId: z.string().uuid() });

async function membershipFor(organizationId: string, userId: string) {
  const db = getDb();
  const [membership] = await db.select({ role: organizationMembers.role })
    .from(organizationMembers)
    .where(and(
      eq(organizationMembers.organizationId, organizationId),
      eq(organizationMembers.userId, userId),
      eq(organizationMembers.status, "active"),
    )).limit(1);
  return membership;
}

/** Organization staff list; only owners/admins can view pending access requests. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const { id } = await params;
  const db = getDb();
  const [org] = await db.select({ ownerId: organizations.ownerId }).from(organizations).where(eq(organizations.id, id)).limit(1);
  if (!org) return apiError("Organization not found.", 404);
  const membership = await membershipFor(id, session.user.id);
  const manager = session.user.role === "admin" || org.ownerId === session.user.id || membership?.role === "owner" || membership?.role === "admin";
  if (!manager && !membership) return apiError("Organization membership required.", 403);
  const members = await db.select({ id: organizationMembers.id, userId: organizationMembers.userId, name: users.name, role: organizationMembers.role, status: organizationMembers.status, jobTitle: organizationMembers.jobTitle, createdAt: organizationMembers.createdAt })
    .from(organizationMembers).innerJoin(users, eq(users.id, organizationMembers.userId))
    .where(and(eq(organizationMembers.organizationId, id), eq(organizationMembers.status, "active")))
    .orderBy(organizationMembers.createdAt).limit(100);
  const requests = manager
    ? await db.select({ id: organizationAccessRequests.id, userId: organizationAccessRequests.userId, name: users.name, email: users.email, jobTitle: organizationAccessRequests.jobTitle, message: organizationAccessRequests.message, createdAt: organizationAccessRequests.createdAt })
      .from(organizationAccessRequests).innerJoin(users, eq(users.id, organizationAccessRequests.userId))
      .where(and(eq(organizationAccessRequests.organizationId, id), eq(organizationAccessRequests.status, "pending")))
      .orderBy(desc(organizationAccessRequests.createdAt)).limit(50)
    : [];
  return apiOk({ members, requests, canManage: manager });
}

/** Request access to an existing organization; approval is explicit and scoped. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return apiError("Enter your role and a short access request.", 400);
  const db = getDb();
  const [org] = await db.select().from(organizations).where(eq(organizations.id, id)).limit(1);
  if (!org) return apiError("Organization not found.", 404);
  if (org.ownerId === session.user.id || await membershipFor(id, session.user.id)) return apiError("You already have organization access.", 409);
  if (session.user.category !== org.kind) return apiError("This organization is for a different account category.", 403);
  const [request] = await db.insert(organizationAccessRequests).values({
    organizationId: id,
    userId: session.user.id,
    jobTitle: parsed.data.jobTitle,
    message: parsed.data.message || null,
  }).onConflictDoUpdate({
    target: [organizationAccessRequests.organizationId, organizationAccessRequests.userId],
    set: { jobTitle: parsed.data.jobTitle, message: parsed.data.message || null, status: "pending", decidedBy: null, decidedAt: null, createdAt: new Date() },
  }).returning({ id: organizationAccessRequests.id });
  await audit({ actorId: session.user.id, action: "organization.access.requested", targetType: "organization", targetId: id, metadata: { requestId: request.id } });
  return apiOk({ requestId: request.id, status: "pending" }, 201);
}

/** Owner/admin decision: approve adds a scoped staff membership. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = decisionSchema.safeParse(body);
  if (!parsed.success) return apiError("Choose a valid access request and decision.", 400);
  const db = getDb();
  const [org] = await db.select({ ownerId: organizations.ownerId }).from(organizations).where(eq(organizations.id, id)).limit(1);
  if (!org) return apiError("Organization not found.", 404);
  const actorMembership = await membershipFor(id, session.user.id);
  if (session.user.role !== "admin" && org.ownerId !== session.user.id && actorMembership?.role !== "owner" && actorMembership?.role !== "admin") {
    return apiError("Only an organization owner or admin can review access requests.", 403);
  }
  const result = await db.transaction(async (tx) => {
    const [request] = await tx.update(organizationAccessRequests).set({
      status: parsed.data.decision,
      decidedBy: session.user.id,
      decidedAt: new Date(),
    }).where(and(
      eq(organizationAccessRequests.id, parsed.data.requestId),
      eq(organizationAccessRequests.organizationId, id),
      eq(organizationAccessRequests.status, "pending"),
    )).returning({ userId: organizationAccessRequests.userId, jobTitle: organizationAccessRequests.jobTitle });
    if (!request) return null;
    if (parsed.data.decision === "approved") {
      await tx.insert(organizationMembers).values({
        organizationId: id,
        userId: request.userId,
        role: "staff",
        status: "active",
        jobTitle: request.jobTitle,
        invitedBy: session.user.id,
        decidedBy: session.user.id,
      }).onConflictDoUpdate({
        target: [organizationMembers.organizationId, organizationMembers.userId],
        set: { role: "staff", status: "active", jobTitle: request.jobTitle, invitedBy: session.user.id, decidedBy: session.user.id, updatedAt: new Date() },
      });
    }
    return { userId: request.userId };
  });
  if (!result) return apiError("Access request not found or already reviewed.", 404);
  await audit({ actorId: session.user.id, action: `organization.access.${parsed.data.decision}`, targetType: "organization", targetId: id, metadata: { userId: result.userId, requestId: parsed.data.requestId } });
  return apiOk({ decision: parsed.data.decision });
}

/** Revoke a staff membership and immediately remove their case conversations. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = revokeSchema.safeParse(body);
  if (!parsed.success) return apiError("Choose a valid organization member.", 400);
  const db = getDb();
  const [org] = await db.select({ ownerId: organizations.ownerId }).from(organizations).where(eq(organizations.id, id)).limit(1);
  if (!org) return apiError("Organization not found.", 404);
  const actor = await membershipFor(id, session.user.id);
  if (session.user.role !== "admin" && org.ownerId !== session.user.id && actor?.role !== "owner" && actor?.role !== "admin") {
    return apiError("Only an organization owner or admin can revoke staff access.", 403);
  }
  const [member] = await db.select({ id: organizationMembers.id, userId: organizationMembers.userId, role: organizationMembers.role })
    .from(organizationMembers).where(and(eq(organizationMembers.id, parsed.data.memberId), eq(organizationMembers.organizationId, id), eq(organizationMembers.status, "active"))).limit(1);
  if (!member) return apiError("Active organization member not found.", 404);
  if (member.role === "owner") return apiError("Transfer organization ownership before removing its owner.", 409);

  const cases = await db.select({ conversationId: conversations.id, requesterUserId: supportRequests.requesterUserId, requestId: supportRequests.id })
    .from(supportRequests).innerJoin(conversations, eq(conversations.supportRequestId, supportRequests.id))
    .where(eq(supportRequests.targetOrganizationId, id));
  const conversationIds = cases.filter((row) => row.requesterUserId !== member.userId).map((row) => row.conversationId);
  await db.transaction(async (tx) => {
    await tx.update(organizationMembers).set({ status: "revoked", updatedAt: new Date(), decidedBy: session.user.id })
      .where(eq(organizationMembers.id, member.id));
    if (conversationIds.length) await tx.delete(conversationMembers).where(and(
      eq(conversationMembers.userId, member.userId), inArray(conversationMembers.conversationId, conversationIds),
    ));
    await tx.update(supportRequests).set({ assignedUserId: null, updatedAt: new Date() }).where(and(
      eq(supportRequests.targetOrganizationId, id), eq(supportRequests.assignedUserId, member.userId),
    ));
  });
  await audit({ actorId: session.user.id, action: "organization.member.revoked", targetType: "organization", targetId: id, metadata: { memberId: member.userId } });
  return apiOk({ revoked: true });
}
