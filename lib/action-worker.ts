import { and, eq, lte } from "drizzle-orm";
import { getDb } from "@/db";
import {
  actionAttempts,
  conversationMembers,
  messages,
  profiles,
  scheduledActions,
  users,
} from "@/db/schema";
import { sendEmail } from "./email";
import { emitToRoom } from "./realtime";
import { notify } from "./notify";
import { profileUpdateSchema } from "./validation";

const PRE_NOTIFY_MINUTES = 15;

interface ExecutionOutcome {
  ok: boolean;
  detail: string;
}

async function executeMessageAction(
  userId: string,
  payload: Record<string, unknown>,
): Promise<ExecutionOutcome> {
  const conversationId = String(payload.conversationId ?? "");
  const body = String(payload.body ?? "").slice(0, 8000);
  if (!conversationId || !body) return { ok: false, detail: "Message action is missing its conversation or text." };
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
  if (!member) return { ok: false, detail: "You are no longer a member of that conversation." };
  const [inserted] = await db
    .insert(messages)
    .values({
      conversationId,
      senderId: userId,
      body,
      clientMessageId: `action-${Date.now()}`,
    })
    .returning({ id: messages.id });
  await emitToRoom(`conversation:${conversationId}`, "message:new", {
    id: inserted.id,
    conversationId,
    senderId: userId,
    body,
  });
  return { ok: true, detail: `Scheduled message sent to conversation ${conversationId.slice(0, 8)}.` };
}

async function executeProfileUpdate(
  userId: string,
  payload: Record<string, unknown>,
): Promise<ExecutionOutcome> {
  const parsed = profileUpdateSchema.safeParse(payload.fields ?? {});
  if (!parsed.success) return { ok: false, detail: "The scheduled profile change is no longer valid." };
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
  return { ok: true, detail: "Scheduled profile update applied." };
}

async function executeReminder(
  userId: string,
  title: string,
  actionId: string,
  payload: Record<string, unknown>,
): Promise<ExecutionOutcome> {
  const text = String(payload.text ?? title);
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  await notify({
    userId,
    type: "action",
    title: `Reminder: ${title}`,
    body: text,
    resourceType: "action",
    resourceId: actionId,
    emailTo: user?.email,
  });
  return { ok: true, detail: "Reminder delivered." };
}

async function executeWorkflow(
  userId: string,
  title: string,
  actionId: string,
  payload: Record<string, unknown>,
): Promise<ExecutionOutcome> {
  const note = String(payload.note ?? "Scheduled workflow executed.");
  await notify({
    userId,
    type: "action",
    title: `Workflow done: ${title}`,
    body: note.slice(0, 500),
    resourceType: "action",
    resourceId: actionId,
  });
  return { ok: true, detail: note.slice(0, 500) };
}

/**
 * Durable worker entry: sends pre-execution reminders, claims due actions
 * atomically (idempotent), executes, records attempts, and notifies outcomes.
 * Runs via /api/cron/actions on a schedule — never in the browser.
 */
export async function runDueActions(limit = 25): Promise<{
  reminded: number;
  executed: number;
  failed: number;
}> {
  const db = getDb();
  const now = new Date();
  let reminded = 0;
  let executed = 0;
  let failed = 0;

  // Pre-execution notifications for actions due soon.
  const upcoming = await db
    .select({
      id: scheduledActions.id,
      userId: scheduledActions.userId,
      title: scheduledActions.title,
      scheduledFor: scheduledActions.scheduledFor,
      timezone: scheduledActions.timezone,
    })
    .from(scheduledActions)
    .where(
      and(
        eq(scheduledActions.status, "confirmed"),
        lte(scheduledActions.scheduledFor, new Date(now.getTime() + PRE_NOTIFY_MINUTES * 60_000)),
      ),
    )
    .limit(limit);
  for (const action of upcoming) {
    const [full] = await db
      .select()
      .from(scheduledActions)
      .where(eq(scheduledActions.id, action.id))
      .limit(1);
    if (!full || full.preNotifiedAt) continue;
    const [user] = await db.select().from(users).where(eq(users.id, action.userId)).limit(1);
    if (user) {
      await sendEmail({
        to: user.email,
        subject: `Upcoming scheduled action: ${action.title}`,
        text: `Your scheduled action "${action.title}" runs at ${action.scheduledFor.toISOString()} (${action.timezone}). Open Actions to edit or cancel it.`,
      });
      reminded += 1;
    }
    await db
      .update(scheduledActions)
      .set({ preNotifiedAt: new Date() })
      .where(eq(scheduledActions.id, action.id));
  }

  // Claim + execute due actions.
  const due = await db
    .select()
    .from(scheduledActions)
    .where(
      and(eq(scheduledActions.status, "confirmed"), lte(scheduledActions.scheduledFor, now)),
    )
    .limit(limit);

  for (const action of due) {
    // Atomic claim: only one worker can move confirmed → executing.
    const claimed = await db
      .update(scheduledActions)
      .set({ status: "executing", attempts: action.attempts + 1 })
      .where(
        and(eq(scheduledActions.id, action.id), eq(scheduledActions.status, "confirmed")),
      )
      .returning({ id: scheduledActions.id });
    if (claimed.length === 0) continue; // another worker claimed it

    const [attempt] = await db
      .insert(actionAttempts)
      .values({ actionId: action.id })
      .returning({ id: actionAttempts.id });

    let outcome: ExecutionOutcome;
    try {
      const payload = (action.payload ?? {}) as Record<string, unknown>;
      switch (action.kind) {
        case "message":
          outcome = await executeMessageAction(action.userId, payload);
          break;
        case "profile_update":
          outcome = await executeProfileUpdate(action.userId, payload);
          break;
        case "reminder":
          outcome = await executeReminder(action.userId, action.title, action.id, payload);
          break;
        case "workflow":
          outcome = await executeWorkflow(action.userId, action.title, action.id, payload);
          break;
        default:
          outcome = { ok: false, detail: `Unknown action kind: ${action.kind}` };
      }
    } catch (error) {
      outcome = { ok: false, detail: error instanceof Error ? error.message : "Execution crashed." };
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
      await notify({
        userId: action.userId,
        type: "action",
        title: `Completed: ${action.title}`,
        body: outcome.detail,
        resourceType: "action",
        resourceId: action.id,
      });
      executed += 1;
    } else {
      const exhausted = action.attempts + 1 >= action.maxAttempts;
      await db
        .update(scheduledActions)
        .set({
          status: exhausted ? "failed" : "confirmed",
          lastError: outcome.detail,
          // Backoff: retry in 10 minutes.
          scheduledFor: exhausted ? action.scheduledFor : new Date(now.getTime() + 10 * 60_000),
        })
        .where(eq(scheduledActions.id, action.id));
      if (exhausted) {
        await notify({
          userId: action.userId,
          type: "action",
          title: `Failed: ${action.title}`,
          body: outcome.detail,
          resourceType: "action",
          resourceId: action.id,
        });
        failed += 1;
      }
    }
  }

  return { reminded, executed, failed };
}
