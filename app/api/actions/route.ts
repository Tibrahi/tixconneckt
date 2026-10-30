import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import {
  actionAttempts,
  conversationMembers,
  conversations,
  scheduledActions,
} from "@/db/schema";
import { isValidTimezone, maxScheduledFor } from "@/lib/action-policy";
import { apiError, apiOk } from "@/lib/api-response";
import { audit } from "@/lib/audit";
import { getSession } from "@/lib/session";
import { rateLimit } from "@/lib/rate-limit";
import { actionScheduleSchema, workflowStepsSchema } from "@/lib/validation";

/** My scheduled actions with their execution attempts. */
export async function GET() {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const db = getDb();
  const rows = await db
    .select()
    .from(scheduledActions)
    .where(eq(scheduledActions.userId, session.user.id))
    .orderBy(desc(scheduledActions.scheduledFor))
    .limit(100);
  const withAttempts = await Promise.all(
    rows.map(async (r) => {
      const history = await db
        .select()
        .from(actionAttempts)
        .where(eq(actionAttempts.actionId, r.id))
        .orderBy(desc(actionAttempts.startedAt))
        .limit(10);
      return { ...r, history };
    }),
  );
  return apiOk(withAttempts);
}

/** Shape validation shared by schedule and edit. Returns the problem or null. */
function validateActionPayload(kind: string, payload: Record<string, unknown>): string | null {
  if (kind === "message") {
    if (!payload.conversationId || !payload.body) {
      return "Message actions need a conversation and text.";
    }
    if (typeof payload.body !== "string" || payload.body.trim().length === 0) {
      return "Message text cannot be empty.";
    }
  }
  if (kind === "profile_update") {
    if (typeof payload.fields !== "object" || payload.fields === null) {
      return "Profile actions need the fields to change.";
    }
    if (Object.keys(payload.fields as Record<string, unknown>).length === 0) {
      return "Profile actions need at least one field to change.";
    }
  }
  if (kind === "reminder") {
    if (!payload.text || (typeof payload.text === "string" && payload.text.trim().length === 0)) {
      return "Reminders need text.";
    }
  }
  if (kind === "workflow") {
    if (payload.steps !== undefined) {
      const steps = workflowStepsSchema.safeParse(payload.steps);
      if (!steps.success) {
        return steps.error.issues[0]?.message ?? "The workflow steps are invalid.";
      }
      for (const step of steps.data) {
        const problem = validateActionPayload(step.kind, step.payload as Record<string, unknown>);
        if (problem) return `Step "${step.title ?? step.kind}": ${problem}`;
      }
    }
  }
  return null;
}

async function requireConversationMembership(
  conversationId: string,
  userId: string,
): Promise<string | null> {
  const db = getDb();
  const [conv] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);
  if (!conv) return "That conversation no longer exists.";
  const [member] = await db
    .select({ id: conversationMembers.id })
    .from(conversationMembers)
    .where(
      and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, userId),
      ),
    )
    .limit(1);
  if (!member) return "You are not a member of that conversation.";
  return null;
}

/**
 * Schedule a reviewed action. Only future times are accepted; timestamps are
 * stored in UTC with the intended timezone alongside. Idempotent per client
 * key so double submits never schedule twice.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const rl = await rateLimit("schedule", session.user.id, 100, "1 d");
  if (!rl.allowed) return apiError("Too many scheduled actions. Please try again tomorrow.", 429);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body.");
  }
  const parsed = actionScheduleSchema.safeParse(body);
  if (!parsed.success) return apiError("Review every field before scheduling.", 400);
  if (!isValidTimezone(parsed.data.timezone)) {
    return apiError("That timezone is not recognized.", 400);
  }

  const scheduledFor = new Date(parsed.data.scheduledFor);
  if (Number.isNaN(scheduledFor.getTime()) || scheduledFor.getTime() <= Date.now()) {
    return apiError("Schedule a time in the future.", 400);
  }
  if (scheduledFor.getTime() > maxScheduledFor().getTime()) {
    return apiError("That date is too far in the future. Check the year and try again.", 400);
  }

  const payload = parsed.data.payload as Record<string, unknown>;
  const problem = validateActionPayload(parsed.data.kind, payload);
  if (problem) return apiError(problem, 400);

  // Fail fast on unknown conversations instead of at execution time.
  const targets =
    parsed.data.kind === "message"
      ? [String(payload.conversationId)]
      : parsed.data.kind === "workflow" && Array.isArray(payload.steps)
        ? (payload.steps as Array<Record<string, unknown>>)
            .filter((s) => s.kind === "message")
            .map((s) => String((s.payload as Record<string, unknown>).conversationId))
        : [];
  for (const conversationId of targets) {
    const membership = await requireConversationMembership(conversationId, session.user.id);
    if (membership) return apiError(membership, 400);
  }

  const db = getDb();
  const idempotencyKey = parsed.data.idempotencyKey
    ? `sa:${session.user.id}:${parsed.data.idempotencyKey}`
    : `sa:${session.user.id}:${crypto.randomUUID()}`;
  const [existing] = await db
    .select({ id: scheduledActions.id })
    .from(scheduledActions)
    .where(eq(scheduledActions.idempotencyKey, idempotencyKey))
    .limit(1);
  if (existing) return apiOk({ actionId: existing.id, deduplicated: true });

  const [created] = await db
    .insert(scheduledActions)
    .values({
      userId: session.user.id,
      groupId: parsed.data.groupId,
      kind: parsed.data.kind,
      title: parsed.data.title,
      payload,
      scheduledFor,
      timezone: parsed.data.timezone,
      status: "confirmed",
      idempotencyKey,
    })
    .returning({ id: scheduledActions.id });

  await audit({
    actorId: session.user.id,
    action: "action.scheduled",
    targetType: "scheduled_action",
    targetId: created.id,
    metadata: { kind: parsed.data.kind },
  });
  return apiOk({ actionId: created.id }, 201);
}

const patchSchema = z.object({
  actionId: z.string().min(1),
  decision: z.enum(["cancel", "reschedule", "edit"]),
  scheduledFor: z.string().datetime({ offset: true }).optional(),
  timezone: z.string().trim().min(1).max(80).optional(),
  title: z.string().trim().min(3).max(200).optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
});

/** Cancel, reschedule, or edit before execution. Completed/failed are final. */
export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const rl = await rateLimit("schedule-edit", session.user.id, 100, "1 d");
  if (!rl.allowed) return apiError("Too many changes. Please try again tomorrow.", 429);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body.");
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return apiError("Invalid request.", 400);

  const db = getDb();
  const [action] = await db
    .select()
    .from(scheduledActions)
    .where(
      and(
        eq(scheduledActions.id, parsed.data.actionId),
        eq(scheduledActions.userId, session.user.id),
      ),
    )
    .limit(1);
  if (!action) return apiError("Action not found.", 404);
  if (!["draft", "confirmed"].includes(action.status)) {
    return apiError("Only pending actions can be changed.", 400);
  }

  if (parsed.data.decision === "cancel") {
    await db
      .update(scheduledActions)
      .set({ status: "cancelled" })
      .where(eq(scheduledActions.id, action.id));
    await audit({
      actorId: session.user.id,
      action: "action.cancelled",
      targetType: "scheduled_action",
      targetId: action.id,
    });
    return apiOk({ cancelled: true });
  }

  if (parsed.data.decision === "reschedule") {
    if (!parsed.data.scheduledFor) return apiError("Provide the new time.", 400);
    const next = new Date(parsed.data.scheduledFor);
    if (Number.isNaN(next.getTime()) || next.getTime() <= Date.now()) {
      return apiError("Schedule a time in the future.", 400);
    }
    await db
      .update(scheduledActions)
      .set({ scheduledFor: next, preNotifiedAt: null })
      .where(eq(scheduledActions.id, action.id));
    return apiOk({ rescheduled: true });
  }

  // Edit title, details, and optionally the schedule. Kind is immutable:
  // cancel and recreate to change the action type.
  const patch: Partial<typeof scheduledActions.$inferInsert> = {};
  if (parsed.data.title !== undefined) patch.title = parsed.data.title;
  if (parsed.data.payload !== undefined) {
    const problem = validateActionPayload(action.kind, parsed.data.payload);
    if (problem) return apiError(problem, 400);
    if (action.kind === "message") {
      const membership = await requireConversationMembership(
        String(parsed.data.payload.conversationId),
        session.user.id,
      );
      if (membership) return apiError(membership, 400);
    }
    patch.payload = parsed.data.payload;
  }
  if (parsed.data.scheduledFor !== undefined) {
    const next = new Date(parsed.data.scheduledFor);
    if (Number.isNaN(next.getTime()) || next.getTime() <= Date.now()) {
      return apiError("Schedule a time in the future.", 400);
    }
    if (next.getTime() > maxScheduledFor().getTime()) {
      return apiError("That date is too far in the future.", 400);
    }
    patch.scheduledFor = next;
    patch.preNotifiedAt = null;
  }
  if (parsed.data.timezone !== undefined) {
    if (!isValidTimezone(parsed.data.timezone)) {
      return apiError("That timezone is not recognized.", 400);
    }
    patch.timezone = parsed.data.timezone;
  }
  if (Object.keys(patch).length === 0) return apiError("Nothing to change.", 400);

  await db.update(scheduledActions).set(patch).where(eq(scheduledActions.id, action.id));
  await audit({
    actorId: session.user.id,
    action: "action.edited",
    targetType: "scheduled_action",
    targetId: action.id,
  });
  return apiOk({ edited: true });
}
