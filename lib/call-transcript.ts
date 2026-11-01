/**
 * Call transcription consent policy (role-aware spec §B). Pure helpers —
 * routes enforce them against persisted consent rows.
 *
 * Privacy policy (communicated in the call UI):
 * - Transcription starts only after BOTH participants consent. Either party
 *   sees the other's consent state before and during the call.
 * - Either participant disabling consent stops further persistence
 *   immediately. Already-saved segments are RETAINED and stay visible to
 *   both participants until either one deletes the transcript.
 * - No raw call audio/video is stored as a side effect of transcription.
 */

export interface ConsentRow {
  userId: string;
  consented: boolean;
}

/** Active only when every participant holds a consented=true row. */
export function transcriptionActive(consents: ConsentRow[], participantIds: string[]): boolean {
  if (participantIds.length === 0) return false;
  return participantIds.every((id) => consents.some((c) => c.userId === id && c.consented));
}

/** Outcome label for call history rows. */
export function callOutcome(status: string): "missed" | "declined" | "failed" | "ended" | "active" | "ringing" {
  if (status === "missed" || status === "declined" || status === "failed" || status === "ended") return status;
  if (status === "accepted") return "active";
  return "ringing";
}

/** Call duration in ms, or null when the call never connected. */
export function callDurationMs(answeredAt: Date | string | null, endedAt: Date | string | null): number | null {
  if (!answeredAt || !endedAt) return null;
  const ms = new Date(endedAt).getTime() - new Date(answeredAt).getTime();
  return ms >= 0 ? ms : null;
}

/** m:ss duration label for history rows. */
export function formatCallDuration(durationMs: number | null): string {
  if (durationMs === null) return "—";
  const totalSeconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
