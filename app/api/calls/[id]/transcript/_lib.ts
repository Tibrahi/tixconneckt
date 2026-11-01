import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { callTranscriptConsents } from "@/db/schema";

/** Consent rows for one call (participant, state, timestamp). */
export async function loadCallConsents(callId: string) {
  const db = getDb();
  return db
    .select({
      userId: callTranscriptConsents.userId,
      consented: callTranscriptConsents.consented,
      updatedAt: callTranscriptConsents.updatedAt,
    })
    .from(callTranscriptConsents)
    .where(eq(callTranscriptConsents.callId, callId));
}
