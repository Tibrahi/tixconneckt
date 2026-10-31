import { and, count, desc, eq, gt, inArray, or, sql } from "drizzle-orm";
import { getDb, isDatabaseUnavailable, withDbRead } from "@/db";
import {
  conversationMembers,
  fundingRequests,
  groupApprovals,
  groupMembers,
  groups,
  ledgerEntries,
  matchResults,
  messages,
  notifications,
  profiles,
  projects,
  scheduledActions,
  users,
  wallets,
} from "@/db/schema";
import { apiError, apiOk } from "@/lib/api-response";
import {
  getDashboardCounts,
  summaryCache,
  unavailableHeaders,
} from "@/lib/dashboard-queries";
import { getSession } from "@/lib/session";

function unavailable() {
  return apiError(
    "Dashboard data is temporarily unavailable. Please retry in a moment.",
    503,
    undefined,
    unavailableHeaders(),
  );
}

/** Dashboard summary — every value from a defined database query. */
export async function GET() {
  let session;
  try {
    session = await getSession({ throwOnDatabaseUnavailable: true });
  } catch (error) {
    if (isDatabaseUnavailable(error)) return unavailable();
    throw error;
  }
  if (!session) return apiError("Sign in required.", 401);
  const userId = session.user.id;

  try {
    const data = await summaryCache.get(userId, () => buildSummary(userId));
    return apiOk(data);
  } catch (error) {
    if (isDatabaseUnavailable(error)) return unavailable();
    throw error;
  }
}

async function buildSummary(userId: string): Promise<Record<string, unknown>> {
  const db = getDb();
  // Queries run sequentially (never Promise.all fan-out): each holds one
  // pool connection briefly, so concurrent dashboard loads queue instead of
  // exhausting the pool and failing with 503s.
  const [profile] = await withDbRead(() =>
    db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1),
  );
  const [user] = await withDbRead(() =>
    db.select().from(users).where(eq(users.id, userId)).limit(1),
  );

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

  const counts = await getDashboardCounts(db, userId);

  const [matchingOpportunities] = await withDbRead(() =>
    db
      .select({ n: count() })
      .from(matchResults)
      .where(and(eq(matchResults.userId, userId), eq(matchResults.status, "suggested"))),
  );
  const myGroups = await withDbRead(() =>
    db
      .select({ groupId: groupMembers.groupId, role: groupMembers.role })
      .from(groupMembers)
      .where(and(eq(groupMembers.userId, userId), eq(groupMembers.status, "active"))),
  );
  const myWallets = await withDbRead(() =>
    db
      .select()
      .from(wallets)
      .where(and(eq(wallets.ownerType, "user"), eq(wallets.ownerId, userId))),
  );

  const myConversations = db
    .select({ id: conversationMembers.conversationId })
    .from(conversationMembers)
    .where(eq(conversationMembers.userId, userId));
  const recentMessages = await withDbRead(() =>
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
  );

  const myGroupIds = myGroups.map((g) => g.groupId);
  const recentProjects = await withDbRead(() =>
    db
      .select({ id: projects.id, title: projects.title, stage: projects.stage, updatedAt: projects.updatedAt })
      .from(projects)
      .where(
        or(
          eq(projects.ownerId, userId),
          myGroupIds.length > 0 ? inArray(projects.groupId, myGroupIds) : sql`false`,
        ),
      )
      .orderBy(desc(projects.updatedAt))
      .limit(5),
  );

  const [pendingApprovals] = myGroupIds.length
    ? await withDbRead(() =>
        db
          .select({ n: count() })
          .from(groupApprovals)
          .where(
            and(
              inArray(groupApprovals.groupId, myGroupIds),
              eq(groupApprovals.status, "pending"),
            ),
          ),
      )
    : [{ n: 0 }];

  const myProjectIds = db.select({ id: projects.id }).from(projects).where(eq(projects.ownerId, userId));
  const upcomingActions = await withDbRead(() =>
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
  );
  const [openFunding] = await withDbRead(() =>
    db
      .select({ n: count() })
      .from(fundingRequests)
      .where(
        and(
          sql`${fundingRequests.projectId} IN (${myProjectIds})`,
          or(eq(fundingRequests.status, "pending"), eq(fundingRequests.status, "under_review")),
        ),
      ),
  );
  const recentNotifications = await withDbRead(() =>
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
  );
  const [approvedVolume] = await withDbRead(() =>
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
  );

  const groupNames = myGroupIds.length
    ? await withDbRead(() =>
        db
          .select({ id: groups.id, name: groups.name })
          .from(groups)
          .where(inArray(groups.id, myGroupIds)),
      )
    : [];

  return {
    profileCompletion,
    shortId: user?.shortId ?? "",
    unreadChat: counts.chat,
    unreadNotifications: counts.notifications,
    pendingConnections: counts.conneckt,
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
  };
}
