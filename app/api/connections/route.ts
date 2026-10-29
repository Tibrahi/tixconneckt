import { and, desc, eq, or } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { connections, users } from "@/db/schema";
import { apiError, apiOk } from "@/lib/api-response";
import { notify } from "@/lib/notify";
import { emitToRoom } from "@/lib/realtime";
import { getSession } from "@/lib/session";
import { connectionRequestSchema } from "@/lib/validation";

/** List incoming, outgoing, and accepted individual connections. */
export async function GET() {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const userId = session.user.id;
  const db = getDb();

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

  const otherIds = rows.map((r) => (r.requesterId === userId ? r.addresseeId : r.requesterId));
  const others =
    otherIds.length > 0
      ? await db
          .select({ id: users.id, name: users.name, shortId: users.shortId })
          .from(users)
          .where(or(...otherIds.map((id) => eq(users.id, id))))
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

  await notify({
    userId: target.id,
    type: "connection",
    title: "New connection request",
    body: `${session.user.name} wants to connect with you.`,
    resourceType: "connection",
    resourceId: session.user.id,
    emailTo: target.email,
  });
  await emitToRoom(`user:${target.id}`, "connection:updated", { kind: "incoming" });

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
    await notify({
      userId: requester.id,
      type: "connection",
      title:
        parsed.data.decision === "accepted"
          ? `${session.user.name} accepted your request`
          : `${session.user.name} declined your request`,
      resourceType: "connection",
      resourceId: rows[0].id,
      emailTo: requester.email,
    });
    await emitToRoom(`user:${requester.id}`, "connection:updated", { kind: "decision" });
  }

  return apiOk({ decided: parsed.data.decision });
}
