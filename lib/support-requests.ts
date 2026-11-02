import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { conversationMembers, conversations, messages, organizationMembers, organizations, supportRequests } from "@/db/schema";

/** Create the request-bound conversation once the requester/group approves external sharing. */
export async function ensureSupportConversation(requestId: string): Promise<string> {
  const db = getDb();
  const [request] = await db.select().from(supportRequests).where(eq(supportRequests.id, requestId)).limit(1);
  if (!request) throw new Error("Support request not found.");
  const [existing] = await db.select({ id: conversations.id }).from(conversations)
    .where(eq(conversations.supportRequestId, requestId)).limit(1);
  if (existing) return existing.id;

  let recipientId = request.targetProviderId;
  if (request.targetOrganizationId) {
    const [org] = await db.select({ ownerId: organizations.ownerId }).from(organizations)
      .where(eq(organizations.id, request.targetOrganizationId)).limit(1);
    if (!org) throw new Error("Organization not found.");
    recipientId = org.ownerId;
  }
  if (!recipientId) throw new Error("Support request has no recipient.");
  const memberRows = recipientId === request.requesterUserId ? [request.requesterUserId] : [request.requesterUserId, recipientId];
  return db.transaction(async (tx) => {
    const [conversation] = await tx.insert(conversations).values({
      type: "direct",
      supportRequestId: requestId,
      createdBy: request.requesterUserId,
    }).onConflictDoNothing().returning({ id: conversations.id });
    const [resolved] = conversation
      ? [conversation]
      : await tx.select({ id: conversations.id }).from(conversations).where(eq(conversations.supportRequestId, requestId)).limit(1);
    if (!resolved) throw new Error("Could not open the support conversation.");
    await tx.insert(conversationMembers).values(memberRows.map((userId) => ({ conversationId: resolved.id, userId, role: userId === request.requesterUserId ? "admin" : "member" }))).onConflictDoNothing();
    await tx.insert(messages).values({ conversationId: resolved.id, senderId: null, kind: "system", body: "A support request conversation was opened." }).onConflictDoNothing();
    return resolved.id;
  });
}

export async function isActiveOrganizationMember(organizationId: string, userId: string): Promise<boolean> {
  const [member] = await getDb().select({ id: organizationMembers.id }).from(organizationMembers).where(and(
    eq(organizationMembers.organizationId, organizationId),
    eq(organizationMembers.userId, userId),
    eq(organizationMembers.status, "active"),
  )).limit(1);
  return Boolean(member);
}
