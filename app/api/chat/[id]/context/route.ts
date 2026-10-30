import { and, desc, eq, inArray, or } from "drizzle-orm";
import { getDb } from "@/db";
import {
  agreements,
  conversationMembers,
  conversations,
  fundingRequests,
  groupMembers,
  groups,
  projects,
  providerLinks,
  users,
} from "@/db/schema";
import { apiError, apiOk } from "@/lib/api-response";
import { requireConversationMembership } from "@/lib/chat";
import { getSession } from "@/lib/session";

/**
 * Conversation context for the details panel and quick links: members and
 * roles, group info, linked projects (titles only — never private details),
 * provider connection + related requests/agreements. Everything is scoped
 * to what this conversation actually references.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const { id } = await params;
  const membership = await requireConversationMembership(id, session.user.id);
  if (!membership) return apiError("You are not a member of this conversation.", 403);

  const db = getDb();
  const [conv] = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
  if (!conv) return apiError("Conversation not found.", 404);

  const members = await db
    .select({
      userId: conversationMembers.userId,
      role: conversationMembers.role,
      name: users.name,
      shortId: users.shortId,
      providerKind: users.providerKind,
      userRole: users.role,
    })
    .from(conversationMembers)
    .innerJoin(users, eq(users.id, conversationMembers.userId))
    .where(eq(conversationMembers.conversationId, id));

  let group: {
    id: string;
    name: string;
    description: string | null;
    objective: string | null;
    myRole: string | null;
    memberCount: number;
  } | null = null;
  let groupProjects: Array<{ id: string; title: string; stage: string; visibility: string }> = [];
  if (conv.groupId) {
    const [g] = await db.select().from(groups).where(eq(groups.id, conv.groupId)).limit(1);
    if (g) {
      const [mine] = await db
        .select({ role: groupMembers.role })
        .from(groupMembers)
        .where(and(eq(groupMembers.groupId, g.id), eq(groupMembers.userId, session.user.id)))
        .limit(1);
      const gm = await db
        .select({ id: groupMembers.id })
        .from(groupMembers)
        .where(and(eq(groupMembers.groupId, g.id), eq(groupMembers.status, "active")));
      group = {
        id: g.id,
        name: g.name,
        description: g.description,
        objective: g.objective,
        myRole: mine?.role ?? null,
        memberCount: gm.length,
      };
      // Titles only: the project page enforces full visibility rules.
      groupProjects = await db
        .select({ id: projects.id, title: projects.title, stage: projects.stage, visibility: projects.visibility })
        .from(projects)
        .where(eq(projects.groupId, g.id))
        .orderBy(desc(projects.updatedAt))
        .limit(20);
    }
  }

  let provider: {
    linkId: string;
    status: string;
    providerName: string | null;
    providerKind: string | null;
    project: { id: string; title: string } | null;
    requests: Array<{ id: string; status: string; amountMinor: number; currency: string }>;
    agreements: Array<{ id: string; requestId: string; title: string; status: string; version: number }>;
  } | null = null;
  if (conv.providerLinkId) {
    const [link] = await db
      .select()
      .from(providerLinks)
      .where(eq(providerLinks.id, conv.providerLinkId))
      .limit(1);
    if (link) {
      const [providerUser] = await db
        .select({ name: users.name, providerKind: users.providerKind })
        .from(users)
        .where(eq(users.id, link.providerId))
        .limit(1);
      const project = link.projectId
        ? (
            await db
              .select({ id: projects.id, title: projects.title })
              .from(projects)
              .where(eq(projects.id, link.projectId))
              .limit(1)
          )[0] ?? null
        : null;
      const requestClauses = [
        eq(fundingRequests.providerId, link.providerId),
        ...(link.individualId
          ? [and(eq(fundingRequests.requesterType, "individual"), eq(fundingRequests.requesterId, link.individualId))]
          : []),
        ...(link.groupId
          ? [and(eq(fundingRequests.requesterType, "group"), eq(fundingRequests.requesterId, link.groupId))]
          : []),
      ];
      const requests =
        requestClauses.length > 1
          ? await db
              .select({
                id: fundingRequests.id,
                status: fundingRequests.status,
                amountMinor: fundingRequests.amountMinor,
                currency: fundingRequests.currency,
              })
              .from(fundingRequests)
              .where(and(requestClauses[0], or(...requestClauses.slice(1))))
              .orderBy(desc(fundingRequests.createdAt))
              .limit(20)
          : [];
      const requestIds = requests.map((r) => r.id);
      const linkedAgreements =
        requestIds.length > 0
          ? await db
              .select({
                id: agreements.id,
                requestId: agreements.requestId,
                title: agreements.title,
                status: agreements.status,
                version: agreements.version,
              })
              .from(agreements)
              .where(inArray(agreements.requestId, requestIds))
              .orderBy(desc(agreements.createdAt))
              .limit(20)
          : [];
      provider = {
        linkId: link.id,
        status: link.status,
        providerName: providerUser?.name ?? null,
        providerKind: providerUser?.providerKind ?? null,
        project,
        requests,
        agreements: linkedAgreements,
      };
    }
  }

  return apiOk({
    conversation: { id: conv.id, type: conv.type, title: conv.title, groupId: conv.groupId },
    members,
    group,
    groupProjects,
    provider,
  });
}
