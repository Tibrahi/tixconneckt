import { and, count, desc, eq, gt, inArray, isNull, ne, notInArray, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  connections,
  conversationMembers,
  fundingRequests,
  groupApprovals,
  groupMembers,
  groups,
  ledgerEntries,
  matchResults,
  messageReads,
  messages,
  notifications,
  profiles,
  projects,
  scheduledActions,
  users,
  wallets,
} from "@/db/schema";
import { apiError, apiOk } from "@/lib/api-response";
import { getSession } from "@/lib/session";

/** Dashboard summary — every value from a defined database query. */
export async function GET() {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const userId = session.user.id;
  const db = getDb();

  const [[profile], [user]] = await Promise.all([
    db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1),
    db.select().from(users).where(eq(users.id, userId)).limit(1),
  ]);

  // Profile completion from filled fields.
  const fields = [
    user?.name,
    user?.phone,
    user?.country,
    profile?.educationLevel,
    profile?.objectives,
    profile?.major,
    (profile?.skills?.length ?? 0) > 0 ? "x" : "",
    (profile?.fields?.length ?? 0) > 0 ? "x" : "",
    profile?.bio,
  ];
  const filled = fields.filter((f) => f && String(f).trim().length > 0).length;
  const profileCompletion = Math.round((filled / fields.length) * 100);

  const myConversations = db
    .select({ id: conversationMembers.conversationId })
    .from(conversationMembers)
    .where(eq(conversationMembers.userId, userId));
  const readIds = db
    .select({ id: messageReads.messageId })
    .from(messageReads)
    .where(eq(messageReads.userId, userId));
  const [
    [unreadChat],
    [unreadNotifications],
    [pendingConnections],
    [matchingOpportunities],
    myGroups,
    myWallets,
    recentMessages,
  ] = await Promise.all([
    db
      .select({ n: count() })
      .from(messages)
      .where(
        and(
          sql`${messages.conversationId} IN (${myConversations})`,
          ne(messages.senderId, userId),
          notInArray(messages.id, readIds),
        ),
      ),
    db
      .select({ n: count() })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt))),
    db
      .select({ n: count() })
      .from(connections)
      .where(and(eq(connections.addresseeId, userId), eq(connections.status, "pending"))),
    db
      .select({ n: count() })
      .from(matchResults)
      .where(and(eq(matchResults.userId, userId), eq(matchResults.status, "suggested"))),
    db
      .select({ groupId: groupMembers.groupId, role: groupMembers.role })
      .from(groupMembers)
      .where(and(eq(groupMembers.userId, userId), eq(groupMembers.status, "active"))),
    db
      .select()
      .from(wallets)
      .where(and(eq(wallets.ownerType, "user"), eq(wallets.ownerId, userId))),
    db
      .select({
        id: messages.id,
        body: messages.body,
        createdAt: messages.createdAt,
        conversationId: messages.conversationId,
        senderName: users.name,
      })
      .from(messages)
      .innerJoin(users, eq(users.id, messages.senderId))
      .where(sql`${messages.conversationId} IN (${myConversations})`)
      .orderBy(desc(messages.createdAt))
      .limit(5),
  ]);

  const myProjectIds = db.select({ id: projects.id }).from(projects).where(eq(projects.ownerId, userId));
  const myGroupIds = myGroups.map((g) => g.groupId);
  const recentProjects = await db
    .select({ id: projects.id, title: projects.title, stage: projects.stage, updatedAt: projects.updatedAt })
    .from(projects)
    .where(
      or(
        eq(projects.ownerId, userId),
        myGroupIds.length > 0 ? inArray(projects.groupId, myGroupIds) : sql`false`,
      ),
    )
    .orderBy(desc(projects.updatedAt))
    .limit(5);

  const [pendingApprovals] = myGroupIds.length
    ? await db
        .select({ n: count() })
        .from(groupApprovals)
        .where(
          and(
            inArray(groupApprovals.groupId, myGroupIds),
            eq(groupApprovals.status, "pending"),
          ),
        )
    : [{ n: 0 }];

  const [upcomingActions, [openFunding], recentNotifications, [approvedVolume]] = await Promise.all([
    db
      .select({
        id: scheduledActions.id,
        title: scheduledActions.title,
        kind: scheduledActions.kind,
        scheduledFor: scheduledActions.scheduledFor,
        timezone: scheduledActions.timezone,
      })
      .from(scheduledActions)
      .where(
        and(
          eq(scheduledActions.userId, userId),
          eq(scheduledActions.status, "confirmed"),
          gt(scheduledActions.scheduledFor, new Date()),
        ),
      )
      .orderBy(scheduledActions.scheduledFor)
      .limit(5),
    db
      .select({ n: count() })
      .from(fundingRequests)
      .where(
        and(
          sql`${fundingRequests.projectId} IN (${myProjectIds})`,
          or(eq(fundingRequests.status, "pending"), eq(fundingRequests.status, "under_review")),
        ),
      ),
    db
      .select({
        id: notifications.id,
        type: notifications.type,
        title: notifications.title,
        createdAt: notifications.createdAt,
        readAt: notifications.readAt,
        resourceType: notifications.resourceType,
        resourceId: notifications.resourceId,
      })
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(5),
    db
      .select({ total: sql<number>`COALESCE(SUM(${ledgerEntries.amountMinor}), 0)` })
      .from(ledgerEntries)
      .innerJoin(wallets, eq(wallets.id, ledgerEntries.walletId))
      .where(
        and(
          eq(wallets.ownerType, "user"),
          eq(wallets.ownerId, userId),
          inArray(ledgerEntries.status, ["approved", "credited"]),
          eq(ledgerEntries.direction, "credit"),
        ),
      ),
  ]);

  const groupNames = myGroupIds.length
    ? await db
        .select({ id: groups.id, name: groups.name })
        .from(groups)
        .where(inArray(groups.id, myGroupIds))
    : [];

  return apiOk({
    profileCompletion,
    shortId: user?.shortId ?? "",
    unreadChat: unreadChat?.n ?? 0,
    unreadNotifications: unreadNotifications?.n ?? 0,
    pendingConnections: pendingConnections?.n ?? 0,
    matchingOpportunities: matchingOpportunities?.n ?? 0,
    groupCount: myGroups.length,
    groups: groupNames,
    wallets: myWallets.map((w) => ({ currency: w.currency, balanceMinor: w.balanceMinor })),
    approvedCreditsMinor: Number(approvedVolume?.total ?? 0),
    recentMessages: recentMessages.map((m) => ({
      id: m.id,
      preview: m.body.slice(0, 120),
      senderName: m.senderName,
      createdAt: m.createdAt,
      conversationId: m.conversationId,
    })),
    recentProjects,
    pendingApprovals: pendingApprovals?.n ?? 0,
    openFunding: openFunding?.n ?? 0,
    upcomingActions,
    recentNotifications,
  });
}
