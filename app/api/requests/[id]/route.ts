import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { agreements, fundingRequests, groupMembers, projects, users } from "@/db/schema";
import { apiError, apiOk } from "@/lib/api-response";
import { notify } from "@/lib/notify";
import { getSession } from "@/lib/session";
import { agreementSchema } from "@/lib/validation";
import { decideEntry, ensureWallet, recordPendingEntry } from "@/lib/wallet";

type Db = ReturnType<typeof getDb>;

async function loadRequest(db: Db, id: string) {
  const [request] = await db.select().from(fundingRequests).where(eq(fundingRequests.id, id)).limit(1);
  if (!request) return null;
  const [project] = await db.select().from(projects).where(eq(projects.id, request.projectId)).limit(1);
  return { request, project };
}

async function isRequester(db: Db, request: { requesterType: string; requesterId: string }, userId: string, isAdmin: boolean): Promise<boolean> {
  if (isAdmin) return true;
  if (request.requesterType === "individual") return request.requesterId === userId;
  const rows = await db
    .select({ id: groupMembers.id })
    .from(groupMembers)
    .where(
      and(
        eq(groupMembers.groupId, request.requesterId),
        eq(groupMembers.userId, userId),
        eq(groupMembers.status, "active"),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * Request detail with staged visibility: providers see the permitted summary;
 * private project details stay hidden until an agreement is accepted.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const { id } = await params;
  const db = getDb();
  const loaded = await loadRequest(db, id);
  if (!loaded || !loaded.project) return apiError("Request not found.", 404);
  const { request, project } = loaded;
  const userId = session.user.id;
  const isAdmin = session.user.role === "admin";
  const requesterSide = await isRequester(db, request, userId, isAdmin);
  const providerSide = request.providerId === userId;

  if (!requesterSide && !providerSide) {
    return apiError("You do not have access to this request.", 403);
  }

  const agreementRows = await db
    .select()
    .from(agreements)
    .where(eq(agreements.requestId, id))
    .orderBy(desc(agreements.version))
    .limit(20);
  const acceptedAgreement = agreementRows.find((a) => a.status === "accepted");

  const canSeeDetails =
    requesterSide ||
    project.visibility === "public" ||
    Boolean(acceptedAgreement) ||
    ["approved", "funded"].includes(request.status);

  const [provider] = request.providerId
    ? await db.select({ id: users.id, name: users.name, shortId: users.shortId }).from(users).where(eq(users.id, request.providerId)).limit(1)
    : [null];

  return apiOk({
    request: {
      id: request.id,
      status: request.status,
      amountMinor: request.amountMinor,
      currency: request.currency,
      message: request.message,
      requesterType: request.requesterType,
      requesterId: request.requesterId,
      createdAt: request.createdAt,
    },
    project: {
      id: project.id,
      title: project.title,
      summary: project.summary,
      details: canSeeDetails ? project.details : null,
      detailsHidden: !canSeeDetails,
      stage: project.stage,
      visibility: project.visibility,
    },
    provider,
    agreements: agreementRows.map((a) => ({
      id: a.id,
      version: a.version,
      title: a.title,
      terms: requesterSide || providerSide ? a.terms : null,
      status: a.status,
      createdAt: a.createdAt,
      decidedAt: a.decidedAt,
    })),
    viewer: { requesterSide, providerSide },
  });
}

const reviewSchema = z.object({
  decision: z.enum(["under_review", "approved", "rejected"]),
});

/** Provider reviews the request. Approval here is not funding — agreements fund. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body.");
  }
  const parsed = reviewSchema.safeParse(body);
  if (!parsed.success) return apiError("Invalid decision.", 400);

  const db = getDb();
  const loaded = await loadRequest(db, id);
  if (!loaded) return apiError("Request not found.", 404);
  if (loaded.request.providerId !== session.user.id) {
    return apiError("Only the assigned provider can review this request.", 403);
  }
  if (!["pending", "under_review"].includes(loaded.request.status)) {
    return apiError("This request has already been decided.", 400);
  }

  await db
    .update(fundingRequests)
    .set({ status: parsed.data.decision })
    .where(eq(fundingRequests.id, id));

  const notifyTarget =
    loaded.request.requesterType === "individual"
      ? loaded.request.requesterId
      : (
          await db
            .select({ userId: groupMembers.userId })
            .from(groupMembers)
            .where(and(eq(groupMembers.groupId, loaded.request.requesterId), eq(groupMembers.role, "admin")))
        ).map((m) => m.userId);
  const targets = Array.isArray(notifyTarget) ? notifyTarget : [notifyTarget];
  for (const target of targets) {
    await notify({
      userId: target,
      type: "request",
      title: `Funding request ${parsed.data.decision.replace(/_/g, " ")}`,
      resourceType: "request",
      resourceId: id,
    });
  }
  return apiOk({ decided: parsed.data.decision });
}

/** Provider creates a new agreement version for the request. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body.");
  }
  const parsed = agreementSchema.safeParse({ ...(body as object), requestId: id });
  if (!parsed.success) return apiError("Provide an agreement title.", 400);

  const db = getDb();
  const loaded = await loadRequest(db, id);
  if (!loaded) return apiError("Request not found.", 404);
  if (loaded.request.providerId !== session.user.id) {
    return apiError("Only the assigned provider can draft agreements.", 403);
  }
  if (!["under_review", "approved", "pending"].includes(loaded.request.status)) {
    return apiError("Agreements cannot be added at this stage.", 400);
  }

  const existing = await db
    .select({ version: agreements.version })
    .from(agreements)
    .where(eq(agreements.requestId, id))
    .orderBy(desc(agreements.version))
    .limit(1);
  const version = (existing[0]?.version ?? 0) + 1;
  const [created] = await db
    .insert(agreements)
    .values({
      requestId: id,
      version,
      title: parsed.data.title,
      terms: parsed.data.terms,
      status: "pending",
      createdBy: session.user.id,
    })
    .returning({ id: agreements.id });

  // Supersede older pending versions (history preserved).
  await db
    .update(agreements)
    .set({ status: "rejected" })
    .where(and(eq(agreements.requestId, id), eq(agreements.status, "pending")));

  // Re-activate the new version (the update above caught it too).
  await db.update(agreements).set({ status: "pending" }).where(eq(agreements.id, created.id));

  const notifyTarget =
    loaded.request.requesterType === "individual"
      ? [loaded.request.requesterId]
      : (
          await db
            .select({ userId: groupMembers.userId })
            .from(groupMembers)
            .where(and(eq(groupMembers.groupId, loaded.request.requesterId), eq(groupMembers.role, "admin")))
        ).map((m) => m.userId);
  for (const target of notifyTarget) {
    await notify({
      userId: target,
      type: "request",
      title: `Agreement v${version} ready for review`,
      body: parsed.data.title,
      resourceType: "agreement",
      resourceId: created.id,
    });
  }
  return apiOk({ agreementId: created.id, version }, 201);
}

const agreementDecisionSchema = z.object({
  agreementId: z.string().min(1),
  decision: z.enum(["accepted", "rejected"]),
});

/**
 * Requester accepts or rejects the latest agreement. Acceptance records the
 * decision and releases provider funding to the recipient wallet as an
 * approved ledger entry — agreement acceptance and funding stay linked.
 */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body.");
  }
  const parsed = agreementDecisionSchema.safeParse(body);
  if (!parsed.success) return apiError("Invalid decision.", 400);

  const db = getDb();
  const loaded = await loadRequest(db, id);
  if (!loaded) return apiError("Request not found.", 404);
  const { request } = loaded;
  const isAdmin = session.user.role === "admin";

  let authorized = false;
  if (isAdmin) authorized = true;
  else if (request.requesterType === "individual") authorized = request.requesterId === session.user.id;
  else {
    const [admin] = await db
      .select()
      .from(groupMembers)
      .where(
        and(
          eq(groupMembers.groupId, request.requesterId),
          eq(groupMembers.userId, session.user.id),
          eq(groupMembers.role, "admin"),
        ),
      )
      .limit(1);
    authorized = Boolean(admin);
  }
  if (!authorized) return apiError("Only the requester can decide agreements.", 403);

  const [agreement] = await db
    .select()
    .from(agreements)
    .where(
      and(
        eq(agreements.id, parsed.data.agreementId),
        eq(agreements.requestId, id),
        eq(agreements.status, "pending"),
      ),
    )
    .limit(1);
  if (!agreement) return apiError("Agreement not found or already decided.", 404);

  await db
    .update(agreements)
    .set({ status: parsed.data.decision, decidedBy: session.user.id, decidedAt: new Date() })
    .where(eq(agreements.id, agreement.id));

  if (parsed.data.decision === "accepted") {
    // Release funding: approved provider_funding credit to the recipient wallet.
    // requesterId is a user id for individual requests, a group id for group requests.
    const ownerType = request.requesterType === "individual" ? "user" : "group";
    const targetWallet = await ensureWallet(ownerType, request.requesterId, request.currency);
    const entry = await recordPendingEntry({
      walletId: targetWallet.id,
      direction: "credit",
      amountMinor: request.amountMinor,
      currency: request.currency,
      kind: "provider_funding",
      relatedType: "funding_request",
      relatedId: request.id,
      metadata: { agreementId: agreement.id, agreementVersion: agreement.version, providerId: request.providerId },
      createdBy: request.providerId ?? undefined,
    });
    await decideEntry({
      entryId: entry.id,
      decision: "approved",
      actorId: request.providerId ?? session.user.id,
      reason: `Agreement v${agreement.version} accepted; funding released`,
    });
    await db.update(fundingRequests).set({ status: "funded" }).where(eq(fundingRequests.id, id));
  }

  if (request.providerId) {
    await notify({
      userId: request.providerId,
      type: "request",
      title:
        parsed.data.decision === "accepted"
          ? "Agreement accepted — funding released"
          : "Agreement rejected",
      resourceType: "agreement",
      resourceId: agreement.id,
    });
  }
  return apiOk({ decided: parsed.data.decision });
}
