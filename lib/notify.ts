import { getDb } from "@/db";
import { notificationDeliveries, notifications } from "@/db/schema";
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
