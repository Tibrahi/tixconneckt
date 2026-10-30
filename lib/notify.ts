import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { memberAccounts, notificationDeliveries, notifications, users } from "@/db/schema";
import { sendEmail } from "./email";
import { emitToRoom } from "./realtime";

export interface NotifyInput {
  userId: string;
  type: string;
  title: string;
  body?: string;
  resourceType?: string;
  resourceId?: string;
  /** Send an email copy to this address (failure retries without duplicating the record). */
  emailTo?: string;
}

/**
 * Persist a notification, fan out a realtime event, and optionally email.
 * Unread status and email delivery are tracked separately.
 */
export async function notify(input: NotifyInput): Promise<string> {
  const db = getDb();
  const inserted = await db
    .insert(notifications)
    .values({
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
    })
    .returning({ id: notifications.id });
  const notificationId = inserted[0].id;

  await db.insert(notificationDeliveries).values({
    notificationId,
    channel: "socket",
    status: "pending",
  });

  // Realtime fan-out (best effort; lists always re-read the database).
  const delivered = await emitToRoom(`user:${input.userId}`, "notification:new", {
    id: notificationId,
    type: input.type,
    title: input.title,
    body: input.body,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
  });
  await db.insert(notificationDeliveries).values({
    notificationId,
    channel: "socket",
    status: delivered ? "sent" : "failed",
    attempts: 1,
    lastError: delivered ? null : "Realtime server unreachable",
  });

  if (input.emailTo) {
    const result = await sendEmail({
      to: input.emailTo,
      subject: `TIXCONNECKT: ${input.title}`,
      text: input.body ?? input.title,
    });
    await db.insert(notificationDeliveries).values({
      notificationId,
      channel: "email",
      status: result.sent ? "sent" : "failed",
      attempts: 1,
      lastError: result.error ?? result.pendingReason ?? null,
    });
  }

  return notificationId;
}

export interface MemberNotifyInput {
  type: string;
  title: string;
  body?: string;
  resourceType?: string;
  resourceId?: string;
  /** Email copy (subject + text); sent only when the member opted into email. */
  email?: { subject: string; text: string };
}

/**
 * Notify a member honoring their account preferences (wallet.md FR-06/FR-09).
 * In-app alerts are recorded only when enabled; the audit log still records
 * the underlying event so nothing is lost.
 */
export async function notifyMember(userId: string, input: MemberNotifyInput): Promise<string | null> {
  const db = getDb();
  const [account] = await db
    .select({ notifyEmail: memberAccounts.notifyEmail, notifyInApp: memberAccounts.notifyInApp })
    .from(memberAccounts)
    .where(eq(memberAccounts.userId, userId))
    .limit(1);
  const wantsInApp = account?.notifyInApp ?? true;
  const wantsEmail = account?.notifyEmail ?? true;

  let notificationId: string | null = null;
  if (wantsInApp) {
    notificationId = await notify({
      userId,
      type: input.type,
      title: input.title,
      body: input.body,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
    });
  }

  if (input.email && wantsEmail) {
    const [user] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (user?.email) {
      const targetId =
        notificationId ??
        (await notify({
          userId,
          type: input.type,
          title: input.title,
          body: input.body,
          resourceType: input.resourceType,
          resourceId: input.resourceId,
        }));
      notificationId = targetId;
      const result = await sendEmail({
        to: user.email,
        subject: input.email.subject,
        text: input.email.text,
      });
      await db.insert(notificationDeliveries).values({
        notificationId: targetId,
        channel: "email",
        status: result.sent ? "sent" : "failed",
        attempts: 1,
        lastError: result.error ?? result.pendingReason ?? null,
      });
    }
  }
  return notificationId;
}

/**
 * Notify every system administrator (in-app + email). Used for withdrawal
 * completions and other events admins must always see (wallet.md FR-09).
 */
export async function notifyAdmins(input: {
  title: string;
  body: string;
  resourceType?: string;
  resourceId?: string;
  email: { subject: string; text: string };
}): Promise<void> {
  const db = getDb();
  const admins = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.role, "admin"));
  for (const admin of admins) {
    const notificationId = await notify({
      userId: admin.id,
      type: "wallet",
      title: input.title,
      body: input.body,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
    });
    const result = await sendEmail({
      to: admin.email,
      subject: input.email.subject,
      text: input.email.text,
    });
    await db.insert(notificationDeliveries).values({
      notificationId,
      channel: "email",
      status: result.sent ? "sent" : "failed",
      attempts: 1,
      lastError: result.error ?? result.pendingReason ?? null,
    });
  }
}
