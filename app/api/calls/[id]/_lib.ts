import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { calls } from "@/db/schema";

/** Load a call only when the user is its caller or callee. */
export async function loadParticipantCall(callId: string, userId: string) {
  const db = getDb();
  const [call] = await db.select().from(calls).where(eq(calls.id, callId)).limit(1);
  if (!call) return null;
  if (call.callerId !== userId && call.calleeId !== userId) return null;
  return call;
}
