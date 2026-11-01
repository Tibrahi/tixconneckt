import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { connections, profiles, users } from "@/db/schema";
import { apiError, apiOk } from "@/lib/api-response";
import { invalidateDashboard } from "@/lib/dashboard-queries";
import { notify } from "@/lib/notify";
import { emitToRoom } from "@/lib/realtime";
import { getSession } from "@/lib/session";
import { connectionRequestSchema, projectInterestCopy } from "@/lib/validation";

/**
 * List incoming, outgoing, and accepted individual connections.
 * `?view=connected` returns a paginated accepted-only list with lightweight
 * profile previews for the Connected section.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const userId = session.user.id;
  const db = getDb();
  const url = new URL(req.url);

  if (url.searchParams.get("view") === "connected") {
    const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
    const pageSize = Math.min(20, Math.max(1, Number(url.searchParams.get("pageSize") ?? 10)));
    const where = and(
      or(eq(connections.requesterId, userId), eq(connections.addresseeId, userId)),
      eq(connections.status, "accepted"),
    );
    const rows = await db
      .select({
        id: connections.id,
        createdAt: connections.createdAt,
        requesterId: connections.requesterId,
        addresseeId: connections.addresseeId,
      })
      .from(connections)
      .where(where)
      .orderBy(desc(connections.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    const otherIds = [...new Set(rows.map((r) => (r.requesterId === userId ? r.addresseeId : r.requesterId)))];
    const others =
      otherIds.length > 0
        ? await db
            .select({
              id: users.id,
              name: users.name,
              shortId: users.shortId,
              country: users.country,
              role: users.role,
              major: profiles.major,
              skills: profiles.skills,
            })
            .from(users)
            .leftJoin(profiles, eq(profiles.userId, users.id))
            .where(inArray(users.id, otherIds))
        : [];
    const byId = new Map(others.map((o) => [o.id, o]));
    const [total] = await db.select({ n: sql<number>`COUNT(*)::int` }).from(connections).where(where);
    return apiOk({
      items: rows.map((r) => {
        const otherId = r.requesterId === userId ? r.addresseeId : r.requesterId;
        const other = byId.get(otherId);
        return {
          id: r.id,
          createdAt: r.createdAt,
          other: other
            ? {
                shortId: other.shortId,
                name: other.name,
                headline: other.major ?? null,
                skills: (other.skills ?? []).slice(0, 5),
                country: other.country,
                role: other.role,
              }
            : { shortId: "----", name: "Unknown user", headline: null, skills: [], country: null, role: "user" },
        };
      }),
      total: total?.n ?? 0,
      page,
      pageSize,
    });
  }

  const rows = await db
    .select({
      id: connections.id,
      status: connections.status,
      createdAt: connections.createdAt,
      requesterId: connections.requesterId,
      addresseeId: connections.addresseeId,
      requesterName: users.name,
      requesterShortId: users.shortId,
    })
    .from(connections)
    .innerJoin(users, eq(users.id, connections.requesterId))
    .where(or(eq(connections.requesterId, userId), eq(connections.addresseeId, userId)))
    .orderBy(desc(connections.createdAt))
    .limit(100);

  const otherIds = [...new Set(rows.map((r) => (r.requesterId === userId ? r.addresseeId : r.requesterId)))];
  const others =
    otherIds.length > 0
      ? await db
          .select({ id: users.id, name: users.name, shortId: users.shortId })
          .from(users)
          .where(inArray(users.id, otherIds))
      : [];
  const byId = new Map(others.map((o) => [o.id, o]));

  const shaped = rows.map((r) => {
    const otherId = r.requesterId === userId ? r.addresseeId : r.requesterId;
    const other = byId.get(otherId);
    return {
      id: r.id,
      status: r.status,
      createdAt: r.createdAt,
      direction: r.requesterId === userId ? ("outgoing" as const) : ("incoming" as const),
      other: other ?? { id: otherId, name: "Unknown user", shortId: "----" },
    };
  });

  return apiOk({
    incoming: shaped.filter((s) => s.direction === "incoming" && s.status === "pending"),
    outgoing: shaped.filter((s) => s.direction === "outgoing" && s.status === "pending"),
    accepted: shaped.filter((s) => s.status === "accepted"),
  });
}

/** Send a connection request by short identifier. Prevents duplicates. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body.");
  }
  const parsed = connectionRequestSchema.safeParse(body);
  if (!parsed.success) return apiError("Enter a valid 4-character identifier.", 400);

  const db = getDb();
  const [target] = await db
    .select()
    .from(users)
    .where(eq(users.shortId, parsed.data.shortId))
    .limit(1);
  if (!target || target.status !== "active") {
    return apiError("No user found with this identifier.", 404);
  }
  if (target.id === session.user.id) {
    return apiError("You cannot connect with yourself.", 400);
  }

  // Project-interest context: the requester must be able to view the project
  // (public projects are visible to every signed-in user, including private
  // providers) and the target must own it. Privacy checks stay server-side.
  let interestProject: { id: string; title: string } | null = null;
  if (parsed.data.projectId) {
    const { loadProjectWithAccess } = await import("@/lib/project-access");
    const loaded = await loadProjectWithAccess(parsed.data.projectId, session.user.id, session.user.role);
    if (!loaded.ok) return apiError(loaded.error, loaded.status);
    if (loaded.project.ownerId !== target.id) {
      return apiError("This project does not belong to that user.", 400);
    }
    interestProject = { id: loaded.project.id, title: loaded.project.title };
  }

  const existing = await db
    .select()
    .from(connections)
    .where(
      or(
        and(eq(connections.requesterId, session.user.id), eq(connections.addresseeId, target.id)),
        and(eq(connections.requesterId, target.id), eq(connections.addresseeId, session.user.id)),
      ),
    )
    .limit(1);
  if (existing.length > 0) {
    const status = existing[0].status;
    if (status === "pending") return apiError("A request is already pending.", 409);
    if (status === "accepted") return apiError("You are already connected.", 409);
    // Rejected/blocked: allow a fresh request by resetting the record.
    await db
      .update(connections)
      .set({ status: "pending", requesterId: session.user.id, addresseeId: target.id, decidedBy: null, decidedAt: null })
      .where(eq(connections.id, existing[0].id));
  } else {
    await db.insert(connections).values({
      requesterId: session.user.id,
      addresseeId: target.id,
      status: "pending",
    });
  }

  // Notify + realtime fan-out run concurrently: both are best-effort
  // deliveries of an already-persisted request. Sequential awaits kept the
  // sender stuck on loading for the sum of both latencies.
  const copy = interestProject
    ? projectInterestCopy(session.user.name, interestProject.title)
    : { title: "New connection request", body: `${session.user.name} wants to connect with you.` };
  await Promise.all([
    notify({
      userId: target.id,
      type: "connection",
      title: copy.title,
      body: copy.body,
      resourceType: interestProject ? "project" : "connection",
      resourceId: interestProject ? interestProject.id : session.user.id,
      emailTo: target.email,
    }),
    emitToRoom(`private:user:${target.id}`, "connection:updated", { kind: "incoming" }),
  ]);

  invalidateDashboard(session.user.id, target.id);
  return apiOk({ sent: true }, 201);
}

const decideSchema = z.object({
  connectionId: z.string().min(1),
  decision: z.enum(["accepted", "rejected"]),
});

/** Accept or reject an incoming request. Records the decision-maker. */
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
    .from(connections)
    .where(
      and(
        eq(connections.id, parsed.data.connectionId),
        eq(connections.addresseeId, session.user.id),
        eq(connections.status, "pending"),
      ),
    )
    .limit(1);
  if (rows.length === 0) return apiError("Request not found.", 404);

  await db
    .update(connections)
    .set({ status: parsed.data.decision, decidedBy: session.user.id, decidedAt: new Date() })
    .where(eq(connections.id, rows[0].id));

  const [requester] = await db.select().from(users).where(eq(users.id, rows[0].requesterId)).limit(1);
  if (requester) {
    await Promise.all([
      notify({
        userId: requester.id,
        type: "connection",
        title:
          parsed.data.decision === "accepted"
            ? `${session.user.name} accepted your request`
            : `${session.user.name} declined your request`,
        resourceType: "connection",
        resourceId: rows[0].id,
        emailTo: requester.email,
      }),
      emitToRoom(`private:user:${requester.id}`, "connection:updated", { kind: "decision" }),
    ]);
  }

  invalidateDashboard(session.user.id, rows[0].requesterId);
  return apiOk({ decided: parsed.data.decision });
}
