import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { groupApprovals, groupMembers, groups, profiles, providerLinks, users } from "@/db/schema";
import { apiError, apiOk } from "@/lib/api-response";
import { invalidateDashboard } from "@/lib/dashboard-queries";
import { publicProfileFilter } from "@/lib/discovery";
import { notify } from "@/lib/notify";
import { emitToRoom } from "@/lib/realtime";
import { getSession } from "@/lib/session";
import { hasVerifiedProviderService } from "@/lib/provider-eligibility";

const linkRequestSchema = z.object({
  providerShortId: z.string().trim().length(4),
  groupId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
});

/** List eligible providers plus the caller's link requests and group approvals. */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const db = getDb();
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get("pageSize") ?? 50)));
  const requestedKind = url.searchParams.get("kind");
  const kindFilter = requestedKind === "loan" || requestedKind === "support" ? requestedKind : undefined;

  // Discovery portion: public providers only. Private providers never leak
  // into listings (enforced in SQL, not by frontend filtering).
  const providers = await db
    .select({ id: users.id, name: users.name, shortId: users.shortId, country: users.country, providerKind: users.providerKind })
    .from(users)
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .where(
      and(
        eq(users.role, "provider"),
        kindFilter ? eq(users.providerKind, kindFilter) : undefined,
        sql`EXISTS (SELECT 1 FROM organization_members om JOIN organizations o ON o.id = om.organization_id WHERE om.user_id = users.id AND om.status = 'active' AND om.role IN ('owner', 'admin') AND o.owner_id = users.id AND o.kind = 'provider' AND o.category = users.provider_kind AND o.verification_status = 'verified')`,
        eq(users.status, "active"),
        publicProfileFilter(),
      ),
    )
    .orderBy(users.createdAt)
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const mine = await db
    .select()
    .from(providerLinks)
    .where(
      or(
        eq(providerLinks.requestedBy, session.user.id),
        eq(providerLinks.providerId, session.user.id),
        and(eq(providerLinks.individualId, session.user.id)),
      ),
    )
    .orderBy(desc(providerLinks.createdAt))
    .limit(50);

  const incomingLinks = session.user.role === "provider"
    ? await db
        .select({
          id: providerLinks.id,
          status: providerLinks.status,
          providerId: providerLinks.providerId,
          individualId: providerLinks.individualId,
          groupId: providerLinks.groupId,
          createdAt: providerLinks.createdAt,
          individualName: users.name,
          groupName: groups.name,
        })
        .from(providerLinks)
        .leftJoin(users, eq(users.id, providerLinks.individualId))
        .leftJoin(groups, eq(groups.id, providerLinks.groupId))
        .where(and(eq(providerLinks.providerId, session.user.id), eq(providerLinks.status, "pending")))
        .orderBy(desc(providerLinks.createdAt))
        .limit(50)
    : [];

  const myMemberships = await db
    .select({ groupId: groupMembers.groupId, role: groupMembers.role })
    .from(groupMembers)
    .where(and(eq(groupMembers.userId, session.user.id), eq(groupMembers.status, "active")));
  const myGroupIds = myMemberships.map((m) => m.groupId);
  const amGroupAdmin = myMemberships.some((m) => m.role === "admin");

  const groupLinks =
    myGroupIds.length > 0
      ? await db
          .select()
          .from(providerLinks)
          .where(inArray(providerLinks.groupId, myGroupIds))
          .orderBy(desc(providerLinks.createdAt))
          .limit(50)
      : [];

  const approvals =
    myGroupIds.length > 0 && amGroupAdmin
      ? await db
          .select({
            id: groupApprovals.id,
            groupId: groupApprovals.groupId,
            kind: groupApprovals.kind,
            status: groupApprovals.status,
            note: groupApprovals.note,
            createdAt: groupApprovals.createdAt,
            requesterName: users.name,
            groupName: groups.name,
          })
          .from(groupApprovals)
          .innerJoin(users, eq(users.id, groupApprovals.requestedBy))
          .innerJoin(groups, eq(groups.id, groupApprovals.groupId))
          .where(
            and(
              inArray(groupApprovals.groupId, myGroupIds),
              eq(groupApprovals.status, "pending"),
            ),
          )
          .limit(50)
      : [];

  // Providers the caller already has a live link with (any visibility): an
  // established relationship, not discovery — project Share/Request dialogs
  // need these to keep working with private providers they already use.
  const linkedIds = new Set<string>();
  for (const link of [...mine, ...groupLinks]) {
    if ((link.status === "pending" || link.status === "approved") && link.providerId !== session.user.id) {
      linkedIds.add(link.providerId);
    }
  }
  const publicIds = new Set(providers.map((p) => p.id));
  const missingLinked = [...linkedIds].filter((id) => !publicIds.has(id));
  const linkedProviders =
    missingLinked.length > 0
      ? await db
          .select({ id: users.id, name: users.name, shortId: users.shortId, country: users.country, providerKind: users.providerKind })
          .from(users)
          .where(and(inArray(users.id, missingLinked), eq(users.status, "active"), kindFilter ? eq(users.providerKind, kindFilter) : undefined))
      : [];

  return apiOk({
    providers: [...providers, ...linkedProviders],
    myLinks: mine,
    incomingLinks,
    groupLinks,
    approvals,
    myGroupIds,
    page,
    pageSize,
  });
}

/**
 * Request a provider connection. Individuals link directly (provider decides).
 * Group requests go through group approval first (admins decide internally),
 * then the provider decides.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body.");
  }
  const parsed = linkRequestSchema.safeParse(body);
  if (!parsed.success) return apiError("Select a provider.", 400);

  const db = getDb();
  const [provider] = await db
    .select()
    .from(users)
    .where(eq(users.shortId, parsed.data.providerShortId.toUpperCase()))
    .limit(1);
  if (!provider || provider.status !== "active" || provider.role !== "provider") {
    return apiError("Provider not found.", 404);
  }
  if ((provider.providerKind !== "loan" && provider.providerKind !== "support") || !(await hasVerifiedProviderService(provider.id, provider.providerKind))) {
    return apiError("This provider needs an active verified service profile before receiving new connections.", 409);
  }
  if (provider.id === session.user.id) {
    return apiError("You cannot link with yourself.", 400);
  }

  if (!parsed.data.groupId) {
    const existing = await db
      .select({ id: providerLinks.id })
      .from(providerLinks)
      .where(
        and(
          eq(providerLinks.providerId, provider.id),
          eq(providerLinks.individualId, session.user.id),
          eq(providerLinks.status, "pending"),
        ),
      )
      .limit(1);
    if (existing.length > 0) return apiError("A request is already pending.", 409);

    const inserted = await db
      .insert(providerLinks)
      .values({
        providerId: provider.id,
        individualId: session.user.id,
        projectId: parsed.data.projectId,
        requestedBy: session.user.id,
        status: "pending",
      })
      .returning({ id: providerLinks.id });

    await notify({
      userId: provider.id,
      type: "connection",
      title: "New provider connection request",
      body: `${session.user.name} requests a connection.`,
      resourceType: "provider_link",
      resourceId: inserted[0].id,
      emailTo: provider.email,
    });
    invalidateDashboard(session.user.id, provider.id);
    return apiOk({ linkId: inserted[0].id }, 201);
  }

  // Group path: verify membership, then create an internal approval task.
  const membership = await db
    .select()
    .from(groupMembers)
    .where(
      and(
        eq(groupMembers.groupId, parsed.data.groupId),
        eq(groupMembers.userId, session.user.id),
        eq(groupMembers.status, "active"),
      ),
    )
    .limit(1);
  if (membership.length === 0) return apiError("You are not a member of this group.", 403);

  const inserted = await db
    .insert(groupApprovals)
    .values({
      groupId: parsed.data.groupId,
      requestedBy: session.user.id,
      kind: "provider_connection",
      referenceType: "provider",
      referenceId: provider.id,
      status: "pending",
      note: parsed.data.projectId ? `Project: ${parsed.data.projectId}` : null,
    })
    .returning({ id: groupApprovals.id });

  // Notify group admins + realtime fan-out concurrently: deliveries of an
  // already-persisted approval. Sequential awaits stacked SMTP/realtime
  // latencies onto the requester's loading state.
  const admins = await db
    .select({ userId: groupMembers.userId })
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, parsed.data.groupId), eq(groupMembers.role, "admin")));
  await Promise.all([
    ...admins
      .filter((admin) => admin.userId !== session.user.id)
      .map((admin) =>
        notify({
          userId: admin.userId,
          type: "group",
          title: "Provider connection needs approval",
          body: `${session.user.name} requested a provider connection for your group.`,
          resourceType: "group_approval",
          resourceId: inserted[0].id,
        }),
      ),
    emitToRoom(`private:group:${parsed.data.groupId}`, "group:approval", { id: inserted[0].id }),
  ]);

  invalidateDashboard(session.user.id);
  return apiOk({ approvalId: inserted[0].id }, 201);
}

const decideSchema = z.object({
  linkId: z.string().min(1),
  decision: z.enum(["approved", "rejected"]),
});

/** Provider accepts or rejects a connection request. */
export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body.");
  }
  const parsed = decideSchema.safeParse(body);
  if (!parsed.success) return apiError("Invalid decision.", 400);

  const db = getDb();
  const rows = await db
    .select()
    .from(providerLinks)
    .where(
      and(
        eq(providerLinks.id, parsed.data.linkId),
        eq(providerLinks.providerId, session.user.id),
        eq(providerLinks.status, "pending"),
      ),
    )
    .limit(1);
  if (rows.length === 0) return apiError("Request not found.", 404);

  await db
    .update(providerLinks)
    .set({ status: parsed.data.decision, decidedBy: session.user.id, decidedAt: new Date() })
    .where(eq(providerLinks.id, rows[0].id));

  await notify({
    userId: rows[0].requestedBy,
    type: "connection",
    title:
      parsed.data.decision === "approved"
        ? "Provider accepted your request"
        : "Provider declined your request",
    resourceType: "provider_link",
    resourceId: rows[0].id,
  });

  invalidateDashboard(rows[0].requestedBy, session.user.id);
  return apiOk({ decided: parsed.data.decision });
}
