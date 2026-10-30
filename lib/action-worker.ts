import { and, eq, lt, lte, or } from "drizzle-orm";
import { getDb } from "@/db";
import {
  actionAttempts,
  conversationMembers,
  conversations,
  messageReads,
  messages,
  profiles,
  scheduledActions,
  users,
} from "@/db/schema";
import {
  PRE_NOTIFY_MINUTES,
  STALE_EXECUTING_MINUTES,
  computeRetryDelayMinutes,
  isStaleClaim,
  scheduledMessageKey,
} from "./action-policy";
import { audit } from "./audit";
import { actionResultEmail, sendEmail } from "./email";
import { notify, notifyMember } from "./notify";
import { emitToRoom } from "./realtime";
import { profileUpdateSchema, workflowStepsSchema } from "./validation";

interface ExecutionOutcome {
  ok: boolean;
  detail: string;
  /**
   * False for permanent failures (not a member, invalid payload, unknown
   * kind): retrying cannot help, so the action fails fast with a clear
   * message instead of burning retries.
   */
  retryable: boolean;
}

const permanent = (detail: string): ExecutionOutcome => ({ ok: false, detail, retryable: false });

async function executeMessageAction(
  userId: string,
  userName: string,
  actionId: string,
  payload: Record<string, unknown>,
  messageKey?: string,
): Promise<ExecutionOutcome> {
  const conversationId = String(payload.conversationId ?? "");
  const body = String(payload.body ?? "").slice(0, 8000);
  if (!conversationId || !body) {
    return permanent("Message action is missing its conversation or text.");
  }
  const db = getDb();
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
  if (!member) return permanent("You are no longer a member of that conversation.");
  const [conv] = await db
    .select({ id: conversations.id, title: conversations.title })
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);
  if (!conv) return permanent("That conversation no longer exists.");

  // Idempotent send: a retry after a crash returns the already-sent message.
  const clientMessageId = messageKey ?? scheduledMessageKey(actionId);
  const [dup] = await db
    .select({ id: messages.id })
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conversationId),
        eq(messages.clientMessageId, clientMessageId),
      ),
    )
    .limit(1);
  if (dup) return { ok: true, detail: "Scheduled message was already sent.", retryable: true };

  const [inserted] = await db
    .insert(messages)
    .values({ conversationId, senderId: userId, body, clientMessageId })
    .returning({ id: messages.id, createdAt: messages.createdAt });

  await db
    .update(conversations)
    .set({ updatedAt: new Date() })
    .where(eq(conversations.id, conversationId));
  await db
    .insert(messageReads)
    .values({ messageId: inserted.id, userId })
    .onConflictDoNothing();

  await emitToRoom(`conversation:${conversationId}`, "message:new", {
    id: inserted.id,
    conversationId,
    senderId: userId,
    senderName: userName,
    body,
    createdAt: inserted.createdAt,
  });

  // Notify other members exactly like a manual send.
  const members = await db
    .select({ userId: conversationMembers.userId })
    .from(conversationMembers)
    .where(eq(conversationMembers.conversationId, conversationId));
  for (const m of members) {
    if (m.userId === userId) continue;
    await notify({
      userId: m.userId,
      type: "chat",
      title: `New message from ${userName}`,
      body: body.slice(0, 200),
      resourceType: "conversation",
      resourceId: conversationId,
    });
  }
  return {
    ok: true,
    detail: `Scheduled message sent to ${conv.title ?? `conversation ${conversationId.slice(0, 8)}`}.`,
    retryable: true,
  };
}

async function executeProfileUpdate(
  userId: string,
  payload: Record<string, unknown>,
): Promise<ExecutionOutcome> {
  const parsed = profileUpdateSchema.safeParse(payload.fields ?? {});
  if (!parsed.success) return permanent("The scheduled profile change is no longer valid.");
  const input = parsed.data;
  const db = getDb();
  if (input.name || input.phone || input.country) {
    await db
      .update(users)
      .set({
        ...(input.name ? { name: input.name } : {}),
        ...(input.phone ? { phone: input.phone } : {}),
        ...(input.country ? { country: input.country } : {}),
      })
      .where(eq(users.id, userId));
  }
  await db
    .insert(profiles)
    .values({ userId })
    .onConflictDoUpdate({
      target: profiles.userId,
      set: {
        ...(input.educationLevel !== undefined ? { educationLevel: input.educationLevel } : {}),
        ...(input.objectives !== undefined ? { objectives: input.objectives } : {}),
        ...(input.major !== undefined ? { major: input.major } : {}),
        ...(input.skills !== undefined ? { skills: input.skills } : {}),
        ...(input.bio !== undefined ? { bio: input.bio } : {}),
        ...(input.location !== undefined ? { location: input.location } : {}),
      },
    });
  return { ok: true, detail: "Scheduled profile update applied.", retryable: true };
}

async function executeReminder(
  userId: string,
  title: string,
  actionId: string,
  payload: Record<string, unknown>,
): Promise<ExecutionOutcome> {
  const text = String(payload.text ?? title);
  if (!text.trim()) return permanent("Reminder has no text.");
  await notifyMember(userId, {
    type: "action",
    title: `Reminder: ${title}`,
    body: text,
    resourceType: "action",
    resourceId: actionId,
    email: {
      subject: `TIXCONNECKT reminder: ${title}`,
      text,
    },
  });
  return { ok: true, detail: "Reminder delivered.", retryable: true };
}

/**
 * Composite workflow: a reviewed sequence of message/reminder/profile steps
 * executed in order. A permanent step failure aborts the remaining steps;
 * anything already executed stays executed and is reported step by step.
 */
async function executeWorkflow(
  userId: string,
  userName: string,
  title: string,
  actionId: string,
  payload: Record<string, unknown>,
): Promise<ExecutionOutcome> {
  const note = String(payload.note ?? "").slice(0, 500);
  const rawSteps = payload.steps;
  if (rawSteps === undefined) {
    await notifyMember(userId, {
      type: "action",
      title: `Workflow done: ${title}`,
      body: note || "Scheduled workflow executed.",
      resourceType: "action",
      resourceId: actionId,
    });
    return { ok: true, detail: note || "Scheduled workflow executed.", retryable: true };
  }
  const parsed = workflowStepsSchema.safeParse(rawSteps);
  if (!parsed.success) {
    return permanent("The workflow steps are invalid. Edit the action and try again.");
  }
  const lines: string[] = [];
  for (let i = 0; i < parsed.data.length; i++) {
    const step = parsed.data[i];
    const label = step.title ?? `Step ${i + 1} (${step.kind})`;
    let outcome: ExecutionOutcome;
    try {
      const stepPayload = step.payload as Record<string, unknown>;
      if (step.kind === "message") {
        outcome = await executeMessageAction(
          userId,
          userName,
          actionId,
          stepPayload,
          `${scheduledMessageKey(actionId)}:step${i}`,
        );
      } else if (step.kind === "reminder") {
        outcome = await executeReminder(userId, label, actionId, stepPayload);
      } else {
        outcome = await executeProfileUpdate(userId, stepPayload);
      }
    } catch (error) {
      outcome = {
        ok: false,
        detail: error instanceof Error ? error.message : "Step crashed.",
        retryable: true,
      };
    }
    lines.push(`${label}: ${outcome.ok ? "done" : `FAILED — ${outcome.detail}`}`);
    if (!outcome.ok) {
      return {
        ok: false,
        detail: lines.join(" | "),
        retryable: outcome.retryable,
      };
    }
  }
  await notifyMember(userId, {
    type: "action",
    title: `Workflow done: ${title}`,
    body: `${parsed.data.length} steps completed.${note ? ` ${note}` : ""}`,
    resourceType: "action",
    resourceId: actionId,
  });
  return { ok: true, detail: lines.join(" | "), retryable: true };
}

/**
 * Durable worker entry: sends pre-execution reminders, claims due actions
 * atomically (idempotent), recovers crashed claims, executes, records
 * attempts, and notifies outcomes. Runs via /api/cron/actions on a schedule
 * — never in the browser.
 */
export async function runDueActions(limit = 25): Promise<{
  reminded: number;
  executed: number;
  failed: number;
  recovered: number;
}> {
  const db = getDb();
  const now = new Date();
  let reminded = 0;
  let executed = 0;
  let failed = 0;
  let recovered = 0;

  // Pre-execution notifications for actions due soon. In-app is the reliable
  // channel; email is best-effort and its result is reported honestly.
  const upcoming = await db
    .select()
    .from(scheduledActions)
    .where(
      and(
        eq(scheduledActions.status, "confirmed"),
        lte(scheduledActions.scheduledFor, new Date(now.getTime() + PRE_NOTIFY_MINUTES * 60_000)),
      ),
    )
    .limit(limit);
  for (const action of upcoming) {
    if (action.preNotifiedAt) continue;
    const [user] = await db.select().from(users).where(eq(users.id, action.userId)).limit(1);
    if (!user) continue;
    await notify({
      userId: action.userId,
      type: "action",
      title: `Upcoming: ${action.title}`,
      body: `Runs at ${action.scheduledFor.toISOString()} (${action.timezone}). Open Actions to edit or cancel it.`,
      resourceType: "action",
      resourceId: action.id,
    });
    const email = await sendEmail({
      to: user.email,
      subject: `Upcoming scheduled action: ${action.title}`,
      text: `Your scheduled action "${action.title}" runs at ${action.scheduledFor.toISOString()} (${action.timezone}). Open Actions to edit or cancel it.`,
    });
    if (!email.sent) {
      console.warn(
        `[actions:pre-notify] email for ${action.id} not sent: ${email.error ?? email.pendingReason}`,
      );
    }
    await db
      .update(scheduledActions)
      .set({ preNotifiedAt: new Date() })
      .where(eq(scheduledActions.id, action.id));
    reminded += 1;
  }

  // Due actions plus crashed claims (stuck in `executing` past the lease).
  const staleBefore = new Date(now.getTime() - STALE_EXECUTING_MINUTES * 60_000);
  const due = await db
    .select()
    .from(scheduledActions)
    .where(
      or(
        and(eq(scheduledActions.status, "confirmed"), lte(scheduledActions.scheduledFor, now)),
        and(eq(scheduledActions.status, "executing"), lt(scheduledActions.updatedAt, staleBefore)),
      ),
    )
    .limit(limit);

  for (const action of due) {
    const wasStale = action.status === "executing" && isStaleClaim(action.updatedAt, now);
    if (wasStale) recovered += 1;

    // A stale claim that already burned its attempts fails instead of retrying.
    if (wasStale && action.attempts >= action.maxAttempts) {
      await db
        .update(scheduledActions)
        .set({ status: "failed", lastError: "The worker stopped mid-execution and retries were exhausted." })
        .where(eq(scheduledActions.id, action.id));
      await notifyActionResult(action.userId, action.id, action.title, "failed", "The worker stopped mid-execution.");
      failed += 1;
      continue;
    }

    // Atomic claim: only one worker can take confirmed, or a stale executing row.
    const claimed = await db
      .update(scheduledActions)
      .set({ status: "executing", attempts: action.attempts + 1 })
      .where(
        and(
          eq(scheduledActions.id, action.id),
          or(
            and(eq(scheduledActions.status, "confirmed"), lte(scheduledActions.scheduledFor, now)),
            and(eq(scheduledActions.status, "executing"), lt(scheduledActions.updatedAt, staleBefore)),
          ),
        ),
      )
      .returning({ id: scheduledActions.id, attempts: scheduledActions.attempts });
    if (claimed.length === 0) continue; // another worker claimed it
    const attemptNumber = claimed[0].attempts;

    const [attempt] = await db
      .insert(actionAttempts)
      .values({
        actionId: action.id,
        detail: wasStale ? "Recovered after the previous attempt timed out." : null,
      })
      .returning({ id: actionAttempts.id });

    const [user] = await db.select().from(users).where(eq(users.id, action.userId)).limit(1);
    let outcome: ExecutionOutcome;
    try {
      const payload = (action.payload ?? {}) as Record<string, unknown>;
      switch (action.kind) {
        case "message":
          outcome = await executeMessageAction(action.userId, user?.name ?? "Member", action.id, payload);
          break;
        case "profile_update":
          outcome = await executeProfileUpdate(action.userId, payload);
          break;
        case "reminder":
          outcome = await executeReminder(action.userId, action.title, action.id, payload);
          break;
        case "workflow":
          outcome = await executeWorkflow(action.userId, user?.name ?? "Member", action.title, action.id, payload);
          break;
        default:
          outcome = permanent(`Unknown action kind: ${action.kind}`);
      }
    } catch (error) {
      outcome = {
        ok: false,
        detail: error instanceof Error ? error.message : "Execution crashed.",
        retryable: true,
      };
    }

    await db
      .update(actionAttempts)
      .set({ finishedAt: new Date(), outcome: outcome.ok ? "success" : "failure", detail: outcome.detail })
      .where(eq(actionAttempts.id, attempt.id));

    if (outcome.ok) {
      await db
        .update(scheduledActions)
        .set({ status: "completed", executedAt: new Date(), lastError: null })
        .where(eq(scheduledActions.id, action.id));
      await notifyActionResult(action.userId, action.id, action.title, "completed", outcome.detail);
      await audit({
        actorId: action.userId,
        action: "action.executed",
        targetType: "scheduled_action",
        targetId: action.id,
        metadata: { kind: action.kind, attempts: attemptNumber },
      });
      executed += 1;
    } else {
      const exhausted = !outcome.retryable || attemptNumber >= action.maxAttempts;
      const delayMinutes = computeRetryDelayMinutes(attemptNumber);
      await db
        .update(scheduledActions)
        .set({
          status: exhausted ? "failed" : "confirmed",
          lastError: outcome.detail,
          scheduledFor: exhausted
            ? action.scheduledFor
            : new Date(now.getTime() + delayMinutes * 60_000),
        })
        .where(eq(scheduledActions.id, action.id));
      if (exhausted) {
        await notifyActionResult(action.userId, action.id, action.title, "failed", outcome.detail);
        await audit({
          actorId: action.userId,
          action: "action.failed",
          targetType: "scheduled_action",
          targetId: action.id,
          metadata: { kind: action.kind, attempts: attemptNumber, error: outcome.detail },
        });
        failed += 1;
      }
    }
  }

  return { reminded, executed, failed, recovered };
}

/** Completion/failure notice via in-app alert plus email per member prefs. */
async function notifyActionResult(
  userId: string,
  actionId: string,
  title: string,
  outcome: "completed" | "failed",
  detail: string,
): Promise<void> {
  await notifyMember(userId, {
    type: "action",
    title: `${outcome === "completed" ? "Completed" : "Failed"}: ${title}`,
    body: detail,
    resourceType: "action",
    resourceId: actionId,
    email: actionResultEmail({ title, outcome, detail }),
  });
}
