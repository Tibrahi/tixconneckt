/**
 * Call lifecycle state machine (pure, tested in tests/calls.test.ts).
 *
 * States: ringing → accepted → ended
 *               → declined | missed (terminal)
 * The server persists every transition; realtime events carry the outcome
 * to the other party. Hangup-while-ringing from the caller is a missed
 * call; from the callee it is a decline.
 */

export type CallStatus = "ringing" | "accepted" | "declined" | "ended" | "missed";
export type CallDecision = "accepted" | "declined" | "ended";
export type CallActor = "caller" | "callee";

export type DecisionOutcome =
  | { status: CallStatus; event: string; notifyMissed: boolean }
  | { error: string };

export function resolveCallDecision(
  current: CallStatus,
  decision: CallDecision,
  actor: CallActor,
): DecisionOutcome {
  if (current === "ringing") {
    if (actor === "callee" && decision === "accepted") {
      return { status: "accepted", event: "call:accepted", notifyMissed: false };
    }
    if (actor === "callee" && (decision === "declined" || decision === "ended")) {
      return { status: "declined", event: "call:declined", notifyMissed: false };
    }
    if (actor === "caller" && decision === "ended") {
      return { status: "missed", event: "call:missed", notifyMissed: true };
    }
    return { error: "This action is not available for the call right now." };
  }
  if (current === "accepted") {
    if (decision === "ended") {
      return { status: "ended", event: "call:ended", notifyMissed: false };
    }
    return { error: "This call is already active." };
  }
  return { error: "This call already finished." };
}
