/**
 * Call transcription policy. Pure helpers — routes enforce them against
 * persisted consent rows.
 *
 * Control model (communicated in the call UI):
 * - ONLY the caller (whoever started the call) can turn transcription on
 *   or off. Other participants see the live state but cannot toggle it.
 * - When ON, the caller's device automatically transcribes each voice to
 *   text (dual-channel: own voice + remote voices) and saves segments.
 * - Turning it off stops further persistence immediately. Already-saved
 *   segments are RETAINED and stay visible to all participants until
 *   someone deletes the transcript.
 * - No raw call audio/video is stored as a side effect of transcription.
 */

export interface ConsentRow {
  userId: string;
  consented: boolean;
}

/** Active only when the CALLER holds a consented=true row. */
export function transcriptionActive(consents: ConsentRow[], callerId: string): boolean {
  if (!callerId) return false;
  return consents.some((c) => c.userId === callerId && c.consented);
}

export interface DialogueSegment {
  segmentIndex: number;
  speaker: string | null;
  text: string;
  final: boolean;
}

export interface DialogueLine extends DialogueSegment {
  /** Stable per-call speaker label: C1, C2, C3… in order of first appearance. */
  who: string;
  /** Resolved participant name when the speaker key maps to one. */
  name: string | null;
}

/**
 * Build the "what everyone said" dialogue: distinct speaker keys become
 * C1/C2/C3… in order of first appearance; unattributed segments share the
 * voice they arrived with (single key when nothing is attributed).
 */
export function buildDialogue(
  segments: DialogueSegment[],
  nameBySpeaker: Record<string, string> = {},
): DialogueLine[] {
  const order: string[] = [];
  const indexOf = (key: string): number => {
    let at = order.indexOf(key);
    if (at === -1) {
      order.push(key);
      at = order.length - 1;
    }
    return at;
  };
  return [...segments]
    .sort((a, b) => a.segmentIndex - b.segmentIndex)
    .map((s) => {
      const key = s.speaker?.trim() ? s.speaker.trim() : "__voice__";
      return {
        ...s,
        who: `C${indexOf(key) + 1}`,
        name: nameBySpeaker[key] ?? null,
      };
    });
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
