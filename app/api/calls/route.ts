import { and, count, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  callHides,
  callParticipants,
  callTranscriptConsents,
  callTranscripts,
  calls,
  conversationMembers,
  conversations,
  users,
} from "@/db/schema";
import { apiError, apiOk } from "@/lib/api-response";
import { callDurationMs, transcriptionActive } from "@/lib/call-transcript";
import { notify } from "@/lib/notify";
import { rateLimit } from "@/lib/rate-limit";
import { emitToRoom } from "@/lib/realtime";
import { getSession } from "@/lib/session";
import { callCreateSchema } from "@/lib/validation";

/** Start a direct or small group call; media remains peer-to-peer WebRTC. */
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
  if (conv.type !== "direct" && conv.type !== "group") return apiError("Calls are available in direct and group conversations.", 400);

  const members = await db
    .select({ userId: conversationMembers.userId })
    .from(conversationMembers)
    .where(eq(conversationMembers.conversationId, conv.id));
  const mine = members.some((m) => m.userId === session.user.id);
  if (!mine) return apiError("You are not a member of this conversation.", 403);
  const others = members.filter((m) => m.userId !== session.user.id);
  if (conv.type === "direct" && others.length !== 1) return apiError("This direct call needs one other participant.", 400);
  if (conv.type === "group" && (others.length < 2 || others.length > 7)) {
    return apiError("Group calls need 3–8 conversation members, including you.", 400);
  }
  if (others.length === 0) return apiError("There is no one else in this conversation to call.", 400);
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

  await db.insert(callParticipants).values([
    { callId: call.id, userId: session.user.id, role: "caller", status: "accepted", joinedAt: new Date() },
    ...others.map((member) => ({ callId: call.id, userId: member.userId, role: "participant", status: "invited" })),
  ]);

  const invitees = await db
    .select({ id: users.id, name: users.name, shortId: users.shortId })
    .from(users)
    .where(inArray(users.id, others.map((member) => member.userId)));

  const deliveredByUser = await Promise.all(others.map(async ({ userId }) => {
    const delivered = await emitToRoom(`private:user:${userId}`, "call:invite", {
      callId: call.id,
      conversationId: conv.id,
      kind: call.kind,
      groupCall: conv.type === "group",
      participants: [{ id: session.user.id, name: session.user.name }, ...invitees.map((person) => ({ id: person.id, name: person.name }))],
      caller: { id: session.user.id, name: session.user.name, shortId: session.user.shortId },
    });
    await notify({
      userId,
      type: "call",
      title: `${conv.type === "group" ? "Group " : ""}${call.kind} call`,
      body: `${session.user.name} is calling${conv.type === "group" ? ` ${invitees.length} members` : " you"}.`,
      resourceType: "conversation",
      resourceId: conv.id,
    });
    return { userId, delivered };
  }));

  return apiOk(
    {
      call: { ...call, delivered: deliveredByUser.every((row) => row.delivered) },
      invitees,
      groupCall: conv.type === "group",
    },
    201,
  );
}

/** Recent calls for a conversation I belong to (missed-call history). */
/**
 * Call history for one conversation, separate from messages. Includes
 * missed, declined, failed, and ended calls with outcome, duration, and
 * transcript state. Ended calls the viewer hid are excluded unless
 * `showHidden=1` — missed/declined/failed calls are never hidden.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const url = new URL(req.url);
  const conversationId = url.searchParams.get("conversationId");
  if (!conversationId) return apiError("conversationId is required.", 400);
  const showHidden = url.searchParams.get("showHidden") === "1";

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
    .select({ callId: callParticipants.callId })
    .from(callParticipants)
    .where(eq(callParticipants.userId, session.user.id));
  const participantCallIds = rows.map((row) => row.callId);
  const historyRows = participantCallIds.length === 0 ? [] : await db
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
      failureReason: calls.failureReason,
    })
    .from(calls)
    .innerJoin(users, eq(users.id, calls.callerId))
    .where(
      and(
        eq(calls.conversationId, conversationId),
        inArray(calls.id, participantCallIds),
      ),
    )
    .orderBy(desc(calls.createdAt))
    .limit(20);

  const ids = historyRows.map((r) => r.id);
  const [hides, segmentCounts, consents] = ids.length === 0
    ? [[], [], []] as const
    : await Promise.all([
      db
        .select({ callId: callHides.callId })
        .from(callHides)
        .where(and(inArray(callHides.callId, ids), eq(callHides.userId, session.user.id))),
      db
        .select({ callId: callTranscripts.callId, n: count() })
        .from(callTranscripts)
        .where(inArray(callTranscripts.callId, ids))
        .groupBy(callTranscripts.callId),
      db
        .select({
          callId: callTranscriptConsents.callId,
          userId: callTranscriptConsents.userId,
          consented: callTranscriptConsents.consented,
        })
        .from(callTranscriptConsents)
        .where(inArray(callTranscriptConsents.callId, ids)),
    ]);
  const hiddenIds = new Set(hides.map((h) => h.callId));
  const segmentsByCall = new Map(segmentCounts.map((s) => [s.callId, s.n]));
  const consentsByCall = new Map<string, Array<{ userId: string; consented: boolean }>>();
  for (const c of consents) {
    const list = consentsByCall.get(c.callId) ?? [];
    list.push({ userId: c.userId, consented: c.consented });
    consentsByCall.set(c.callId, list);
  }

  const participantRows = ids.length === 0 ? [] : await db.select({ callId: callParticipants.callId, userId: callParticipants.userId })
    .from(callParticipants).where(inArray(callParticipants.callId, ids));
  const participantIdsByCall = new Map<string, string[]>();
  for (const participant of participantRows) {
    const list = participantIdsByCall.get(participant.callId) ?? [];
    list.push(participant.userId);
    participantIdsByCall.set(participant.callId, list);
  }
  const history = historyRows
    .filter((row) => showHidden || !hiddenIds.has(row.id))
    .map((row) => ({
      ...row,
      durationMs: callDurationMs(row.answeredAt, row.endedAt),
      transcriptSegments: segmentsByCall.get(row.id) ?? 0,
      transcriptActive: transcriptionActive(consentsByCall.get(row.id) ?? [], participantIdsByCall.get(row.id) ?? [row.callerId, row.calleeId]),
      hidden: hiddenIds.has(row.id),
    }));

  return apiOk({ calls: history });
}
