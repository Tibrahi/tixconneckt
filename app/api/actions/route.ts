import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { actionAttempts, scheduledActions } from "@/db/schema";
import { apiError, apiOk } from "@/lib/api-response";
import { getSession } from "@/lib/session";
import { actionScheduleSchema } from "@/lib/validation";

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

/**
 * Schedule a reviewed action. Only future times are accepted; timestamps are
 * stored in UTC with the intended timezone alongside.
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
  const parsed = actionScheduleSchema.safeParse(body);
  if (!parsed.success) return apiError("Review every field before scheduling.", 400);

  const scheduledFor = new Date(parsed.data.scheduledFor);
  if (Number.isNaN(scheduledFor.getTime()) || scheduledFor.getTime() <= Date.now()) {
    return apiError("Schedule a time in the future.", 400);
  }

  // Kind-specific payload guardrails.
  const payload = parsed.data.payload as Record<string, unknown>;
  if (parsed.data.kind === "message" && (!payload.conversationId || !payload.body)) {
    return apiError("Message actions need a conversation and text.", 400);
  }
  if (parsed.data.kind === "profile_update" && typeof payload.fields !== "object") {
    return apiError("Profile actions need the fields to change.", 400);
  }
  if (parsed.data.kind === "reminder" && !payload.text) {
    return apiError("Reminders need text.", 400);
  }

  const db = getDb();
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
      idempotencyKey: crypto.randomUUID(),
    })
    .returning({ id: scheduledActions.id });
  return apiOk({ actionId: created.id }, 201);
}

const patchSchema = z.object({
  actionId: z.string().min(1),
  decision: z.enum(["cancel", "reschedule"]),
  scheduledFor: z.string().datetime({ offset: true }).optional(),
});

/** Cancel or reschedule before execution. Completed/failed actions are final. */
export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
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
    return apiOk({ cancelled: true });
  }

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
