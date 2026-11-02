import { and, desc, eq, gt, inArray, or, sql } from "drizzle-orm";
import { dbFailureCode, getDb, isDatabaseUnavailable, withDbRead } from "@/db";
import {
  conversationMembers,
  groupMembers,
  groups,
  ledgerEntries,
  messages,
  notifications,
  organizationMembers,
  organizations,
  profiles,
  projects,
  scheduledActions,
  users,
  wallets,
} from "@/db/schema";
import { apiError, apiOk } from "@/lib/api-response";
import {
  getCachedDashboardCounts,
  getCachedWithStale,
  summaryCache,
  unavailableHeaders,
} from "@/lib/dashboard-queries";
import { getSession } from "@/lib/session";

function unavailable(stage: "session" | "summary", error: unknown) {
  // Structured trace for every 503: endpoint + stage + failure category.
  console.warn(`[api:dashboard:summary:503] stage=${stage} code=${dbFailureCode(error)}`);
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
    if (isDatabaseUnavailable(error)) return unavailable("session", error);
    throw error;
  }
  if (!session) return apiError("Sign in required.", 401);
  const userId = session.user.id;

  try {
    // Transient outages serve the last-known summary flagged stale; only a
    // cold cache plus a down database still 503s (genuinely unavailable).
    const data = await getCachedWithStale(summaryCache, userId, () => buildSummary(userId), "dashboard:summary");
    return apiOk(data);
  } catch (error) {
    if (isDatabaseUnavailable(error)) return unavailable("summary", error);
    throw error;
  }
}

async function buildSummary(userId: string): Promise<Record<string, unknown>> {
  const db = getDb();
  // Queries run sequentially (never Promise.all fan-out): each holds one
  // pool connection briefly, so concurrent dashboard loads queue instead of
  // exhausting the pool and failing with 503s. Independent scalars ride
  // together in single round trips to keep the count low.
  const [identity] = await withDbRead(() =>
    db
      .select({
        name: users.name,
        phone: users.phone,
        country: users.country,
        shortId: users.shortId,
        role: users.role,
        category: users.category,
        providerKind: users.providerKind,
        educationLevel: profiles.educationLevel,
        objectives: profiles.objectives,
        major: profiles.major,
        skills: profiles.skills,
        fields: profiles.fields,
        bio: profiles.bio,
      })
      .from(users)
      .leftJoin(profiles, eq(profiles.userId, users.id))
      .where(eq(users.id, userId))
      .limit(1),
  );

  // Profile completion from filled fields.
  const fields = [
    identity?.name,
    identity?.phone,
    identity?.country,
    identity?.educationLevel,
    identity?.objectives,
    identity?.major,
    (identity?.skills?.length ?? 0) > 0 ? "x" : "",
    (identity?.fields?.length ?? 0) > 0 ? "x" : "",
    identity?.bio,
  ];
  const filled = fields.filter((f) => f && String(f).trim().length > 0).length;
  const profileCompletion = Math.round((filled / fields.length) * 100);

  // Shared with the nav-badge poll: one cached execution, not two queries.
  const counts = await getCachedDashboardCounts(userId);

  // Independent tallies in one round trip (same values as three COUNTs).
  const tallyRows = await withDbRead(() => db.execute(sql`
    SELECT
      (SELECT COUNT(*)::int FROM "match_results" WHERE "user_id" = ${userId} AND "status" = 'suggested') AS "matching",
      (SELECT COUNT(*)::int FROM "group_approvals"
        WHERE "status" = 'pending'
          AND "group_id" IN (SELECT "group_id" FROM "group_members" WHERE "user_id" = ${userId} AND "status" = 'active')
      ) AS "approvals",
      (SELECT COUNT(*)::int FROM "funding_requests"
        WHERE "status" IN ('pending', 'under_review')
          AND "project_id" IN (SELECT "id" FROM "projects" WHERE "owner_id" = ${userId})
      ) AS "funding",
      (SELECT COUNT(*)::int FROM "funding_requests"
        WHERE "status" IN ('pending', 'under_review') AND "provider_id" = ${userId}
          AND EXISTS (SELECT 1 FROM "users" u JOIN "organizations" o ON o."owner_id" = u."id" JOIN "organization_members" om ON om."organization_id" = o."id" WHERE u."id" = ${userId} AND u."provider_kind" = 'loan' AND o."kind" = 'provider' AND o."category" = 'loan' AND o."verification_status" = 'verified' AND om."user_id" = u."id" AND om."role" IN ('owner', 'admin') AND om."status" = 'active')
      ) + (SELECT COUNT(*)::int FROM "provider_links"
        WHERE "status" = 'pending' AND "provider_id" = ${userId}
          AND EXISTS (SELECT 1 FROM "users" u JOIN "organizations" o ON o."owner_id" = u."id" JOIN "organization_members" om ON om."organization_id" = o."id" WHERE u."id" = ${userId} AND u."provider_kind" = 'loan' AND o."kind" = 'provider' AND o."category" = 'loan' AND o."verification_status" = 'verified' AND om."user_id" = u."id" AND om."role" IN ('owner', 'admin') AND om."status" = 'active')
      ) AS "providerQueue",
      (SELECT COUNT(*)::int FROM "support_requests" sr
        WHERE sr."status" IN ('pending', 'triage', 'awaiting_requester', 'accepted')
          AND ((sr."target_provider_id" = ${userId} AND EXISTS (SELECT 1 FROM "users" u JOIN "organizations" o ON o."owner_id" = u."id" JOIN "organization_members" om ON om."organization_id" = o."id" WHERE u."id" = ${userId} AND u."provider_kind" = 'support' AND o."kind" = 'provider' AND o."category" = 'support' AND o."verification_status" = 'verified' AND om."user_id" = u."id" AND om."role" IN ('owner', 'admin') AND om."status" = 'active')) OR sr."assigned_user_id" = ${userId}
            OR sr."requester_user_id" = ${userId}
            OR sr."target_organization_id" IN (
              SELECT "organization_id" FROM "organization_members"
              WHERE "user_id" = ${userId} AND "status" = 'active' AND "role" IN ('owner', 'admin')
            ))
      ) AS "supportQueue"
  `));
  const tally = (tallyRows.rows[0] ?? {}) as Partial<{ matching: number; approvals: number; funding: number; providerQueue: number; supportQueue: number }>;
  const myGroups = await withDbRead(() =>
    db
      .select({ groupId: groupMembers.groupId, role: groupMembers.role, name: groups.name })
      .from(groupMembers)
      .innerJoin(groups, eq(groups.id, groupMembers.groupId))
      .where(and(eq(groupMembers.userId, userId), eq(groupMembers.status, "active"))),
  );
  const myWallets = await withDbRead(() =>
    db
      .select({ currency: wallets.currency, balanceMinor: wallets.balanceMinor })
      .from(wallets)
      .where(and(eq(wallets.ownerType, "user"), eq(wallets.ownerId, userId))),
  );
  const myOrganizations = await withDbRead(() => db.select({
    id: organizations.id,
    name: organizations.name,
    kind: organizations.kind,
    verificationStatus: organizations.verificationStatus,
    role: organizationMembers.role,
  }).from(organizationMembers).innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
    .where(and(eq(organizationMembers.userId, userId), eq(organizationMembers.status, "active")))
    .orderBy(desc(organizations.updatedAt)).limit(5));

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

  return {
    profileCompletion,
    shortId: identity?.shortId ?? "",
    // Role context for the role-aware overview (matrix in lib/roles.ts).
    actor: {
      role: identity?.role ?? "user",
      category: identity?.category ?? "individual",
      providerKind: identity?.providerKind ?? null,
    },
    providerQueue: tally?.providerQueue ?? 0,
    supportQueue: tally?.supportQueue ?? 0,
    organizations: myOrganizations,
    unreadChat: counts.chat,
    unreadNotifications: counts.notifications,
    pendingConnections: counts.conneckt,
    matchingOpportunities: tally?.matching ?? 0,
    groupCount: myGroups.length,
    groups: myGroups.map((g) => ({ id: g.groupId, name: g.name })),
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
    pendingApprovals: tally?.approvals ?? 0,
    openFunding: tally?.funding ?? 0,
    upcomingActions,
    recentNotifications,
  };
}
