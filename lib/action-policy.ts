/**
 * Pure automation policy helpers (spec §15 safeguards). No I/O — safe to
 * unit test and share between the scheduler API and the worker.
 */

/** Pre-execution reminder window before the scheduled time. */
export const PRE_NOTIFY_MINUTES = 15;

/** An `executing` claim older than this is considered crashed and recoverable. */
export const STALE_EXECUTING_MINUTES = 15;

/** Backoff between retries in minutes, indexed by completed attempts. */
export const RETRY_DELAYS_MINUTES = [5, 20, 60] as const;

/** Schedules further than this are rejected as likely input errors. */
export const MAX_SCHEDULE_YEARS = 5;

/**
 * Backoff before the Nth retry (1-based): 5m, 20m, then 60m for later ones.
 */
export function computeRetryDelayMinutes(retryNumber: number): number {
  const idx = Math.min(Math.max(retryNumber - 1, 0), RETRY_DELAYS_MINUTES.length - 1);
  return RETRY_DELAYS_MINUTES[idx];
}

/** True when an `executing` row was claimed long enough ago to be a crash. */
export function isStaleClaim(updatedAt: Date, now: Date = new Date()): boolean {
  return now.getTime() - updatedAt.getTime() > STALE_EXECUTING_MINUTES * 60_000;
}

/** Deterministic message key so worker retries never double-send. */
export function scheduledMessageKey(actionId: string): string {
  return `scheduled:${actionId}`;
}

/** Strict IANA timezone check (rejects garbage like "Mars/Olympus"). */
export function isValidTimezone(tz: string): boolean {
  if (typeof tz !== "string" || tz.length === 0 || tz.length > 80) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Latest acceptable scheduled time (guards against year-9999 typos). */
export function maxScheduledFor(now: Date = new Date()): Date {
  const cap = new Date(now);
  cap.setUTCFullYear(cap.getUTCFullYear() + MAX_SCHEDULE_YEARS);
  return cap;
}
