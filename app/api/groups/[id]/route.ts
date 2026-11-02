import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { conversationMembers, conversations, groupApprovals, groupMembers, groups, organizations, providerLinks, supportRequestDocuments, supportRequestEvents, supportRequests, users } from "@/db/schema";
import { apiError, apiOk } from "@/lib/api-response";
import { postSystemMessage } from "@/lib/chat";
import { notify } from "@/lib/notify";
import { emitToRoom } from "@/lib/realtime";
import { getSession } from "@/lib/session";
import { ensureSupportConversation } from "@/lib/support-requests";
import { hasVerifiedProviderService } from "@/lib/provider-eligibility";

async function membership(db: ReturnType<typeof getDb>, groupId: string, userId: string) {
  const rows = await db
    .select()
    .from(groupMembers)
    .where(
      and(
        eq(groupMembers.groupId, groupId),
        eq(groupMembers.userId, userId),
        eq(groupMembers.status, "active"),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

/** Group detail for members: info, members, approvals, provider links. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const { id } = await params;
  const db = getDb();
  const mine = await membership(db, id, session.user.id);
  if (!mine) return apiError("You are not a member of this group.", 403);

  const [group] = await db.select().from(groups).where(eq(groups.id, id)).limit(1);
  if (!group) return apiError("Group not found.", 404);

  const members = await db
    .select({
      userId: groupMembers.userId,
      role: groupMembers.role,
      joinedAt: groupMembers.joinedAt,
      name: users.name,
      shortId: users.shortId,
    })
    .from(groupMembers)
    .innerJoin(users, eq(users.id, groupMembers.userId))
    .where(and(eq(groupMembers.groupId, id), eq(groupMembers.status, "active")));

  const approvals = await db
    .select({
      id: groupApprovals.id,
      kind: groupApprovals.kind,
      status: groupApprovals.status,
      note: groupApprovals.note,
      referenceType: groupApprovals.referenceType,
      referenceId: groupApprovals.referenceId,
      createdAt: groupApprovals.createdAt,
      requesterName: users.name,
      requesterShortId: users.shortId,
    })
    .from(groupApprovals)
    .innerJoin(users, eq(users.id, groupApprovals.requestedBy))
    .where(eq(groupApprovals.groupId, id))
    .orderBy(desc(groupApprovals.createdAt))
    .limit(50);

  const links = await db
    .select({
      id: providerLinks.id,
      status: providerLinks.status,
      createdAt: providerLinks.createdAt,
      providerName: users.name,
      providerShortId: users.shortId,
    })
    .from(providerLinks)
    .innerJoin(users, eq(users.id, providerLinks.providerId))
    .where(eq(providerLinks.groupId, id))
    .orderBy(desc(providerLinks.createdAt))
    .limit(50);

  return apiOk({ group, myRole: mine.role, members, approvals, providerLinks: links });
}

const memberSchema = z.object({
  shortId: z.string().trim().length(4),
  role: z.enum(["admin", "member"]).default("member"),
});

/** Admin adds a member by short identifier. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const { id } = await params;
  const db = getDb();
  const mine = await membership(db, id, session.user.id);
  if (!mine || mine.role !== "admin") return apiError("Only group admins can add members.", 403);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body.");
  }
  const parsed = memberSchema.safeParse(body);
  if (!parsed.success) return apiError("Enter a valid 4-character identifier.", 400);

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.shortId, parsed.data.shortId.toUpperCase()))
    .limit(1);
  if (!user || user.status !== "active") return apiError("User not found.", 404);

  await db
    .insert(groupMembers)
    .values({ groupId: id, userId: user.id, role: parsed.data.role, status: "active" })
    .onConflictDoUpdate({
      target: [groupMembers.groupId, groupMembers.userId],
      set: { role: parsed.data.role, status: "active" },
    });

  await notify({
    userId: user.id,
    type: "group",
    title: "Added to a group",
    body: `${session.user.name} added you to a group.`,
    resourceType: "group",
    resourceId: id,
    emailTo: user.email,
  });
  await emitToRoom(`private:group:${id}`, "group:members", {});

  // Sync the group's conversation: membership + a system message in history.
  const [groupConv] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(and(eq(conversations.type, "group"), eq(conversations.groupId, id)))
    .limit(1);
  if (groupConv) {
    await db
      .insert(conversationMembers)
      .values({ conversationId: groupConv.id, userId: user.id, role: "member" })
      .onConflictDoNothing();
    await postSystemMessage(groupConv.id, `${user.name} joined the group.`, {
      event: "member_joined",
      userId: user.id,
    });
  }
  return apiOk({ added: true }, 201);
}

const approvalSchema = z.object({
  approvalId: z.string().min(1),
  decision: z.enum(["approved", "rejected"]),
});

/**
 * Admin decides a group approval. Approving a provider_connection approval
 * creates the outward provider link (the provider still decides finally).
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const { id } = await params;
  const db = getDb();
  const mine = await membership(db, id, session.user.id);
  if (!mine || mine.role !== "admin") return apiError("Only group admins can decide approvals.", 403);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body.");
  }
  const parsed = approvalSchema.safeParse(body);
  if (!parsed.success) return apiError("Invalid decision.", 400);

  const rows = await db
    .select()
    .from(groupApprovals)
    .where(
      and(
        eq(groupApprovals.id, parsed.data.approvalId),
        eq(groupApprovals.groupId, id),
        eq(groupApprovals.status, "pending"),
      ),
    )
    .limit(1);
  if (rows.length === 0) return apiError("Approval not found.", 404);
  const approval = rows[0];

  if (parsed.data.decision === "approved" && approval.kind === "provider_connection" && approval.referenceId) {
    const [provider] = await db.select({ role: users.role, providerKind: users.providerKind, status: users.status }).from(users).where(eq(users.id, approval.referenceId)).limit(1);
    if (!provider || provider.role !== "provider" || provider.status !== "active" || (provider.providerKind !== "loan" && provider.providerKind !== "support") || !(await hasVerifiedProviderService(approval.referenceId, provider.providerKind))) {
      return apiError("This provider needs an active verified service profile before a group can connect.", 409);
    }
  }
  if (parsed.data.decision === "approved" && approval.kind === "support_request" && approval.referenceId) {
    const [supportRequest] = await db.select().from(supportRequests).where(and(
      eq(supportRequests.id, approval.referenceId), eq(supportRequests.requesterGroupId, id), eq(supportRequests.status, "pending_group_approval"),
    )).limit(1);
    if (!supportRequest) return apiError("This support request is no longer awaiting group approval.", 409);
    if (supportRequest.targetProviderId) {
      const [provider] = await db.select({ providerKind: users.providerKind, status: users.status, role: users.role }).from(users).where(eq(users.id, supportRequest.targetProviderId)).limit(1);
      if (!provider || provider.role !== "provider" || provider.providerKind !== "support" || provider.status !== "active" || !(await hasVerifiedProviderService(supportRequest.targetProviderId, "support"))) return apiError("The selected support provider is not currently verified.", 409);
    }
    if (supportRequest.targetOrganizationId) {
      const [organization] = await db.select({ verificationStatus: organizations.verificationStatus }).from(organizations).where(eq(organizations.id, supportRequest.targetOrganizationId)).limit(1);
      if (organization?.verificationStatus !== "verified") return apiError("The selected organization is not currently verified.", 409);
    }
  }

  await db
    .update(groupApprovals)
    .set({ status: parsed.data.decision, decidedBy: session.user.id, decidedAt: new Date() })
    .where(eq(groupApprovals.id, approval.id));

  if (parsed.data.decision === "approved" && approval.kind === "provider_connection" && approval.referenceId) {
    const [provider] = await db.select().from(users).where(eq(users.id, approval.referenceId)).limit(1);
    if (provider) {
      const inserted = await db
        .insert(providerLinks)
        .values({
          providerId: provider.id,
          groupId: id,
          requestedBy: approval.requestedBy,
          status: "pending",
        })
        .returning({ id: providerLinks.id });
      await notify({
        userId: provider.id,
        type: "connection",
        title: "Group requests a provider connection",
        body: "A group approved an internal request to connect with you.",
        resourceType: "provider_link",
        resourceId: inserted[0].id,
        emailTo: provider.email,
      });
    }
  }

  if (approval.kind === "support_request" && approval.referenceId) {
    const [supportRequest] = await db.select().from(supportRequests).where(and(
      eq(supportRequests.id, approval.referenceId),
      eq(supportRequests.requesterGroupId, id),
      eq(supportRequests.status, "pending_group_approval"),
    )).limit(1);
    if (supportRequest) {
      const toStatus = parsed.data.decision === "approved" ? "pending" : "declined";
      await db.transaction(async (tx) => {
        await tx.update(supportRequests).set({ status: toStatus, updatedAt: new Date(), ...(toStatus === "declined" ? { resolvedAt: new Date() } : {}) }).where(eq(supportRequests.id, supportRequest.id));
        await tx.insert(supportRequestEvents).values({
          requestId: supportRequest.id,
          actorId: session.user.id,
          event: "group_approval_decided",
          fromStatus: "pending_group_approval",
          toStatus,
        });
        if (toStatus === "declined") await tx.update(supportRequestDocuments).set({ expiresAt: new Date() }).where(eq(supportRequestDocuments.requestId, supportRequest.id));
      });
      if (toStatus === "pending") {
        const conversationId = await ensureSupportConversation(supportRequest.id);
        const [organization] = supportRequest.targetOrganizationId
          ? await db.select({ ownerId: organizations.ownerId }).from(organizations).where(eq(organizations.id, supportRequest.targetOrganizationId)).limit(1)
          : [];
        const recipientId = supportRequest.targetProviderId ?? organization?.ownerId;
        if (recipientId) {
          await notify({ userId: recipientId, type: "support_request", title: "New group support request", body: supportRequest.summary, resourceType: "support_request", resourceId: supportRequest.id });
        }
        await notify({ userId: supportRequest.requesterUserId, type: "support_request", title: "Group approved your support request", body: "The request is now with the selected recipient.", resourceType: "support_request", resourceId: supportRequest.id });
        await emitToRoom(`private:group:${id}`, "group:approval", { id: approval.id, status: parsed.data.decision, supportRequestId: supportRequest.id, conversationId });
      } else {
        await notify({ userId: supportRequest.requesterUserId, type: "support_request", title: "Group declined the support request", resourceType: "support_request", resourceId: supportRequest.id });
      }
    }
  }

  await notify({
    userId: approval.requestedBy,
    type: "group",
    title: `Group request ${parsed.data.decision}`,
    body: `Your ${approval.kind.replace(/_/g, " ")} request was ${parsed.data.decision}.`,
    resourceType: "group_approval",
    resourceId: approval.id,
  });
  await emitToRoom(`private:group:${id}`, "group:approval", { id: approval.id, status: parsed.data.decision });

  return apiOk({ decided: parsed.data.decision });
}
