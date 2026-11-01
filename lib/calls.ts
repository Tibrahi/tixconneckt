/**
 * Call lifecycle state machine (pure, tested in tests/calls.test.ts).
 *
 * States: ringing → accepted → ended
 *               → declined | missed | failed (terminal)
 * The server persists every transition; realtime events carry the outcome
 * to the other party. Hangup-while-ringing from the caller is a missed
 * call; from the callee it is a decline. Either side may mark a
 * non-terminal call failed with an honest reason (network, unreachable).
 */

export type CallStatus = "ringing" | "accepted" | "declined" | "ended" | "missed" | "failed";
export type CallDecision = "accepted" | "declined" | "ended" | "failed";
export type CallActor = "caller" | "callee";

export type DecisionOutcome =
  | { status: CallStatus; event: string; notifyMissed: boolean }
  | { error: string };

export function resolveCallDecision(
  current: CallStatus,
  decision: CallDecision,
  actor: CallActor,
): DecisionOutcome {
  if (decision === "failed" && (current === "ringing" || current === "accepted")) {
    return { status: "failed", event: "call:failed", notifyMissed: false };
  }
  if (current === "ringing") {
    if (actor === "callee" && decision === "accepted") {
      return { status: "accepted", event: "call:accept", notifyMissed: false };
    }
    if (actor === "callee" && (decision === "declined" || decision === "ended")) {
      return { status: "declined", event: "call:reject", notifyMissed: false };
    }
    if (actor === "caller" && decision === "ended") {
      return { status: "missed", event: "call:missed", notifyMissed: true };
    }
    return { error: "This action is not available for the call right now." };
  }
  if (current === "accepted") {
    if (decision === "ended") {
      return { status: "ended", event: "call:end", notifyMissed: false };
    }
    return { error: "This call is already active." };
  }
  return { error: "This call already finished." };
}
