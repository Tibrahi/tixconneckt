import { and, desc, eq, inArray, or } from "drizzle-orm";
import { getDb } from "@/db";
import {
  calls,
  conversationMembers,
  conversations,
  users,
} from "@/db/schema";
import { apiError, apiOk } from "@/lib/api-response";
import { rateLimit } from "@/lib/rate-limit";
import { emitToRoom } from "@/lib/realtime";
import { getSession } from "@/lib/session";
import { callCreateSchema } from "@/lib/validation";

/**
 * Start a 1:1 call. Only direct conversations with exactly two members can
 * call — group conferences are honestly unsupported. The invite is delivered
 * over the realtime server; media itself flows peer-to-peer via WebRTC.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const rl = await rateLimit("call-create", session.user.id, 10, "1 m");
  if (!rl.allowed) return apiError("Too many call attempts. Please wait a moment.", 429);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body.");
  }
  const parsed = callCreateSchema.safeParse(body);
  if (!parsed.success) return apiError("Invalid call request.", 400);

  const db = getDb();
  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, parsed.data.conversationId))
    .limit(1);
  if (!conv) return apiError("Conversation not found.", 404);
  if (conv.type !== "direct") {
    return apiError("Calls work one-to-one. Group calls aren't supported yet.", 400);
  }

  const members = await db
    .select({ userId: conversationMembers.userId })
    .from(conversationMembers)
    .where(eq(conversationMembers.conversationId, conv.id));
  const mine = members.some((m) => m.userId === session.user.id);
  if (!mine) return apiError("You are not a member of this conversation.", 403);
  const others = members.filter((m) => m.userId !== session.user.id);
  if (others.length !== 1) {
    return apiError("Calls work one-to-one. Group calls aren't supported yet.", 400);
  }
  const calleeId = others[0].userId;

  const live = await db
    .select({ id: calls.id })
    .from(calls)
    .where(
      and(
        eq(calls.conversationId, conv.id),
        inArray(calls.status, ["ringing", "accepted"]),
      ),
    )
    .limit(1);
  if (live.length > 0) {
    return apiError("A call is already in progress in this conversation.", 409);
  }

  const [call] = await db
    .insert(calls)
    .values({
      conversationId: conv.id,
      callerId: session.user.id,
      calleeId,
      kind: parsed.data.kind,
      status: "ringing",
    })
    .returning();

  const [callee] = await db
    .select({ id: users.id, name: users.name, shortId: users.shortId })
    .from(users)
    .where(eq(users.id, calleeId))
    .limit(1);

  const delivered = await emitToRoom(`user:${calleeId}`, "call:incoming", {
    callId: call.id,
    conversationId: conv.id,
    kind: call.kind,
    caller: { id: session.user.id, name: session.user.name, shortId: session.user.shortId },
  });

  return apiOk(
    {
      call: { ...call, delivered },
      callee: callee ?? { id: calleeId, name: "Unknown", shortId: "" },
    },
    201,
  );
}

/** Recent calls for a conversation I belong to (missed-call history). */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const url = new URL(req.url);
  const conversationId = url.searchParams.get("conversationId");
  if (!conversationId) return apiError("conversationId is required.", 400);

  const db = getDb();
  const membership = await db
    .select({ id: conversationMembers.id })
    .from(conversationMembers)
    .where(
      and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, session.user.id),
      ),
    )
    .limit(1);
  if (membership.length === 0) {
    return apiError("You are not a member of this conversation.", 403);
  }

  const rows = await db
    .select({
      id: calls.id,
      kind: calls.kind,
      status: calls.status,
      callerId: calls.callerId,
      calleeId: calls.calleeId,
      callerName: users.name,
      createdAt: calls.createdAt,
      answeredAt: calls.answeredAt,
      endedAt: calls.endedAt,
    })
    .from(calls)
    .innerJoin(users, eq(users.id, calls.callerId))
    .where(
      and(
        eq(calls.conversationId, conversationId),
        or(eq(calls.callerId, session.user.id), eq(calls.calleeId, session.user.id)),
      ),
    )
    .orderBy(desc(calls.createdAt))
    .limit(20);

  return apiOk({ calls: rows });
}
