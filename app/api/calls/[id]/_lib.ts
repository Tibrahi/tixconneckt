import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { callParticipants, calls } from "@/db/schema";

/** Load a call only when the user is a recorded participant. */
export async function loadParticipantCall(callId: string, userId: string) {
  const db = getDb();
  const [call] = await db.select().from(calls).where(eq(calls.id, callId)).limit(1);
  if (!call) return null;
  const [participant] = await db
    .select({ id: callParticipants.id })
    .from(callParticipants)
    .where(and(eq(callParticipants.callId, callId), eq(callParticipants.userId, userId)))
    .limit(1);
  if (!participant && call.callerId !== userId && call.calleeId !== userId) return null;
  return call;
}

export async function getCallParticipantIds(callId: string): Promise<string[]> {
  const db = getDb();
  const rows = await db.select({ userId: callParticipants.userId }).from(callParticipants)
    .where(eq(callParticipants.callId, callId));
  return rows.map((row) => row.userId);
}
