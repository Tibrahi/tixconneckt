import { and, desc, eq, or } from "drizzle-orm";
import { getDb } from "@/db";
import { fundingRequests, groupMembers, projects, users } from "@/db/schema";
import { apiError, apiOk } from "@/lib/api-response";
import { notify } from "@/lib/notify";
import { getSession } from "@/lib/session";
import { fundingRequestSchema } from "@/lib/validation";

/** My outgoing requests + incoming requests where I am the provider. */
export async function GET() {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const db = getDb();
  const userId = session.user.id;

  const myMemberships = await db
    .select({ groupId: groupMembers.groupId })
    .from(groupMembers)
    .where(and(eq(groupMembers.userId, userId), eq(groupMembers.status, "active")));
  const myGroupIds = myMemberships.map((m) => m.groupId);

  const outgoing = await db
    .select({
      id: fundingRequests.id,
      projectId: fundingRequests.projectId,
      requesterType: fundingRequests.requesterType,
      status: fundingRequests.status,
      amountMinor: fundingRequests.amountMinor,
      currency: fundingRequests.currency,
      createdAt: fundingRequests.createdAt,
      projectTitle: projects.title,
      providerName: users.name,
    })
    .from(fundingRequests)
    .innerJoin(projects, eq(projects.id, fundingRequests.projectId))
    .innerJoin(users, eq(users.id, fundingRequests.providerId))
    .where(
      or(
        and(eq(fundingRequests.requesterType, "individual"), eq(fundingRequests.requesterId, userId)),
        ...(myGroupIds.length
          ? [and(eq(fundingRequests.requesterType, "group"), or(...myGroupIds.map((id) => eq(fundingRequests.requesterId, id))))]
          : []),
      ),
    )
    .orderBy(desc(fundingRequests.createdAt))
    .limit(100);

  const incoming = await db
    .select({
      id: fundingRequests.id,
      projectId: fundingRequests.projectId,
      requesterType: fundingRequests.requesterType,
      status: fundingRequests.status,
      amountMinor: fundingRequests.amountMinor,
      currency: fundingRequests.currency,
      createdAt: fundingRequests.createdAt,
      projectTitle: projects.title,
      requesterId: fundingRequests.requesterId,
    })
    .from(fundingRequests)
    .innerJoin(projects, eq(projects.id, fundingRequests.projectId))
    .where(eq(fundingRequests.providerId, userId))
    .orderBy(desc(fundingRequests.createdAt))
    .limit(100);

  return apiOk({ outgoing, incoming });
}

/**
 * Submit a funding request. Individual requests require project ownership;
 * group requests require group admin rights (internal approval happens first).
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
  const parsed = fundingRequestSchema.safeParse(body);
  if (!parsed.success) return apiError("Provide a project, recipient, and amount.", 400);
  const input = parsed.data;
  const db = getDb();
  const userId = session.user.id;

  const [project] = await db.select().from(projects).where(eq(projects.id, input.projectId)).limit(1);
  if (!project) return apiError("Project not found.", 404);

  if (input.requesterType === "individual") {
    if (project.ownerId !== userId || input.requesterId !== userId) {
      return apiError("Only the project owner can submit an individual request.", 403);
    }
  } else {
    const [admin] = await db
      .select()
      .from(groupMembers)
      .where(
        and(
          eq(groupMembers.groupId, input.requesterId),
          eq(groupMembers.userId, userId),
          eq(groupMembers.role, "admin"),
        ),
      )
      .limit(1);
    if (!admin) return apiError("Only group admins can submit group requests.", 403);
    if (project.groupId !== input.requesterId && project.ownerId !== userId) {
      return apiError("This project does not belong to the group.", 403);
    }
  }

  const providerId = input.providerId;
  if (providerId) {
    const [provider] = await db.select().from(users).where(eq(users.id, providerId)).limit(1);
    if (!provider || provider.role !== "provider" || provider.status !== "active") {
      return apiError("Provider not found.", 404);
    }
  } else {
    // Directed requests need a provider; open requests stay drafts for discovery.
    return apiError("Select a provider for this request.", 400);
  }

  const [created] = await db
    .insert(fundingRequests)
    .values({
      projectId: project.id,
      requesterType: input.requesterType,
      requesterId: input.requesterId,
      providerId,
      amountMinor: input.amountMinor,
      currency: input.currency.toUpperCase(),
      message: input.message,
      status: "pending",
    })
    .returning({ id: fundingRequests.id });

  const [provider] = await db.select().from(users).where(eq(users.id, providerId)).limit(1);
  if (provider) {
    await notify({
      userId: provider.id,
      type: "request",
      title: "New funding request",
      body: `"${project.title}" requests ${input.amountMinor / 100} ${input.currency}.`,
      resourceType: "request",
      resourceId: created.id,
      emailTo: provider.email,
    });
  }

  return apiOk({ requestId: created.id }, 201);
}

/** Requester closes their own request. */
export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body.");
  }
  const { z } = await import("zod");
  const parsed = z.object({ requestId: z.string().min(1) }).safeParse(body);
  if (!parsed.success) return apiError("Invalid request.", 400);

  const db = getDb();
  const [request] = await db
    .select()
    .from(fundingRequests)
    .where(eq(fundingRequests.id, parsed.data.requestId))
    .limit(1);
  if (!request) return apiError("Request not found.", 404);

  const owns =
    (request.requesterType === "individual" && request.requesterId === session.user.id) ||
    (request.requesterType === "group" &&
      (await db
        .select({ id: groupMembers.id })
        .from(groupMembers)
        .where(
          and(
            eq(groupMembers.groupId, request.requesterId),
            eq(groupMembers.userId, session.user.id),
            eq(groupMembers.role, "admin"),
          ),
        )
        .limit(1)).length > 0);
  if (!owns) return apiError("Only the requester can close this request.", 403);
  if (["funded", "closed"].includes(request.status)) {
    return apiError("This request is already closed.", 400);
  }

  await db.update(fundingRequests).set({ status: "closed" }).where(eq(fundingRequests.id, request.id));
  if (request.providerId) {
    await notify({
      userId: request.providerId,
      type: "request",
      title: "Funding request closed",
      resourceType: "request",
      resourceId: request.id,
    });
  }
  return apiOk({ closed: true });
}
