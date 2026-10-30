import { fromZonedTime } from "date-fns-tz";

/**
 * Deterministic on-device instruction interpreter (spec §15).
 *
 * Used whenever Muse Spark is unavailable — and as a fallback when it
 * fails — so scheduling never depends on an AI integration. It parses the
 * documented instruction shapes (reminders, scheduled messages, profile
 * changes, workflow notes) plus everyday time expressions into a structured
 * proposal the user still reviews before anything is scheduled.
 */

export interface ConversationHint {
  id: string;
  title: string;
}

export interface LocalProposal {
  kind: "message" | "profile_update" | "reminder" | "workflow";
  title: string;
  payload: Record<string, unknown>;
  /** ISO UTC datetime suggestion. */
  scheduledFor: string;
  timezone: string;
  confidence: "high" | "low";
  notes: string[];
}

const WEEKDAYS: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

const CLOCK_RE = /(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?/i;

function parseClock(raw: string): { hour: number; minute: number } | null {
  const m = raw.trim().match(CLOCK_RE);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = Number(m[2] ?? 0);
  const meridiem = (m[3] ?? "").toLowerCase().replace(/\./g, "");
  if (hour > 23 || minute > 59) return null;
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  // Bare 1-7 without meridiem in a scheduling context usually means evening.
  return { hour, minute };
}

function zonedParts(now: Date, tz: string): { y: number; mo: number; d: number; weekday: number } {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const [y, mo, d] = date.split("-").map(Number);
  const weekdayName = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long" })
    .format(now)
    .toLowerCase();
  return { y, mo, d, weekday: WEEKDAYS[weekdayName] ?? 0 };
}

const pad = (n: number) => String(n).padStart(2, "0");

function zonedDateTime(
  y: number,
  mo: number,
  d: number,
  hour: number,
  minute: number,
  tz: string,
): Date {
  return fromZonedTime(`${y}-${pad(mo)}-${pad(d)}T${pad(hour)}:${pad(minute)}:00`, tz);
}

function detectTimezone(text: string, fallback: string): { timezone: string; hinted: boolean } {
  const t = text.toLowerCase();
  if (/kigali|rwanda/.test(t)) return { timezone: "Africa/Kigali", hinted: true };
  if (/nairobi|kenya/.test(t)) return { timezone: "Africa/Nairobi", hinted: true };
  if (/lagos|nigeria/.test(t)) return { timezone: "Africa/Lagos", hinted: true };
  if (/cairo|egypt/.test(t)) return { timezone: "Africa/Cairo", hinted: true };
  if (/london|united kingdom|\buk\b/.test(t)) return { timezone: "Europe/London", hinted: true };
  if (/paris|france/.test(t)) return { timezone: "Europe/Paris", hinted: true };
  if (/new york/.test(t)) return { timezone: "America/New_York", hinted: true };
  if (/dubai|uae/.test(t)) return { timezone: "Asia/Dubai", hinted: true };
  if (/\butc\b|\bgmt\b/.test(t)) return { timezone: "UTC", hinted: true };
  return { timezone: fallback, hinted: false };
}

interface TimeParse {
  at: Date;
  /** The matched time expression, removed from titles/text where present. */
  matchedText: string;
  explicit: boolean;
}

function parseTime(text: string, now: Date, tz: string): TimeParse | null {
  const t = text.toLowerCase();

  // "in 30 minutes / 2 hours / 3 days / 1 week"
  const rel = t.match(/\bin\s+(\d+)\s*(minutes?|hours?|days?|weeks?)\b/);
  if (rel) {
    const n = Number(rel[1]);
    const unit = rel[2].startsWith("minute")
      ? 60_000
      : rel[2].startsWith("hour")
        ? 3_600_000
        : rel[2].startsWith("day")
          ? 86_400_000
          : 7 * 86_400_000;
    return { at: new Date(now.getTime() + n * unit), matchedText: rel[0], explicit: true };
  }

  const parts = zonedParts(now, tz);
  const atParts = (dayOffset: number, clock: { hour: number; minute: number }) => {
    const base = new Date(Date.UTC(parts.y, parts.mo - 1, parts.d + dayOffset));
    return zonedDateTime(
      base.getUTCFullYear(),
      base.getUTCMonth() + 1,
      base.getUTCDate(),
      clock.hour,
      clock.minute,
      tz,
    );
  };

  // "on 2026-11-05 [at 10:00]"
  const iso = t.match(/\bon\s+(\d{4})-(\d{2})-(\d{2})(?:\s+at\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)?))?/);
  if (iso) {
    const clock = iso[4] ? parseClock(iso[4]) : { hour: 9, minute: 0 };
    if (!clock) return null;
    return {
      at: zonedDateTime(Number(iso[1]), Number(iso[2]), Number(iso[3]), clock.hour, clock.minute, tz),
      matchedText: iso[0],
      explicit: true,
    };
  }

  // "[next] Monday [at 9am]"
  const weekday = t.match(/\b(?:(next)\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)(?:\s+at\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)?))?/);
  if (weekday) {
    const target = WEEKDAYS[weekday[2]];
    const clock = weekday[3] ? parseClock(weekday[3]) : { hour: 9, minute: 0 };
    if (!clock) return null;
    let offset = (target - parts.weekday + 7) % 7;
    if (weekday[1]) offset = offset === 0 ? 7 : offset + 7; // "next X" = following week
    let at = atParts(offset, clock);
    if (at.getTime() <= now.getTime()) at = atParts(offset + 7, clock);
    return { at, matchedText: weekday[0], explicit: true };
  }

  // "tomorrow [at 9am]" / "today at 6pm"
  const tomorrow = t.match(/\btomorrow(?:\s+at\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)?))?/);
  if (tomorrow) {
    const clock = tomorrow[1] ? parseClock(tomorrow[1]) : { hour: 9, minute: 0 };
    if (!clock) return null;
    return { at: atParts(1, clock), matchedText: tomorrow[0], explicit: true };
  }
  const today = t.match(/\btoday\s+at\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)?)/);
  if (today) {
    const clock = parseClock(today[1]);
    if (!clock) return null;
    let at = atParts(0, clock);
    if (at.getTime() <= now.getTime()) at = atParts(1, clock);
    return { at, matchedText: today[0], explicit: true };
  }

  // Bare "at 9am" / "at 18:00" — today if still ahead, else tomorrow.
  const bare = t.match(/\bat\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)?)/);
  if (bare) {
    const clock = parseClock(bare[1]);
    if (!clock) return null;
    let at = atParts(0, clock);
    if (at.getTime() <= now.getTime()) at = atParts(1, clock);
    return { at, matchedText: bare[0], explicit: true };
  }

  return null;
}

/**
 * Remove the time expression and filler words to isolate the subject text.
 * Timezone-hint stripping applies to subjects only — never to profile values
 * like a country name.
 */
function cleanSubject(text: string, time: TimeParse | null, stripTzHints = true): string {
  let out = text;
  if (time) out = out.replace(time.matchedText, " ");
  if (stripTzHints) {
    out = out.replace(/\b(kigali|nairobi|lagos|cairo|london|paris|new york|dubai|rwanda|kenya|nigeria|egypt|france|utc|gmt)(\s+time)?\b/gi, " ");
  }
  return out
    .replace(/\s+/g, " ")
    .replace(/\s+(in|at|on)\s*$/i, "")
    .trim();
}

function resolveConversation(
  name: string,
  conversations: ConversationHint[],
): { match: ConversationHint | null; ambiguous: boolean } {
  const needle = name.toLowerCase().trim();
  if (!needle) return { match: null, ambiguous: false };
  const hits = conversations.filter((c) => c.title.toLowerCase().includes(needle));
  if (hits.length === 1) return { match: hits[0], ambiguous: false };
  const exact = hits.find((c) => c.title.toLowerCase() === needle);
  if (exact) return { match: exact, ambiguous: false };
  return { match: null, ambiguous: hits.length > 1 };
}

export interface InterpretOptions {
  now?: Date;
  timezone?: string;
  conversations?: ConversationHint[];
}

/**
 * Parse an instruction into a scheduling proposal. Returns null when the
 * instruction is not recognizable — callers then fall back to the manual
 * form instead of guessing.
 */
export function interpretLocally(instruction: string, opts: InterpretOptions = {}): LocalProposal | null {
  const text = instruction.trim();
  if (!text) return null;
  const now = opts.now ?? new Date();
  const { timezone } = detectTimezone(text, opts.timezone ?? "UTC");
  const time = parseTime(text, now, timezone);
  const conversations = opts.conversations ?? [];
  const lower = text.toLowerCase();

  // --- Scheduled message: send "..." to <conversation> ---
  if (/\b(send|message|tell)\b/.test(lower) && (/"[^"]+"|'[^']+'|\bto\b/.test(text))) {
    const quoted = text.match(/"([^"]+)"|'([^']+)'/);
    const toName = text.match(/\bto\s+(?:the\s+)?([A-Za-z0-9][A-Za-z0-9 ._-]*?)(?:\s+(?:at|tomorrow|today|on|in)\b|[.,;!?]*$)/i);
    const name = (toName?.[1] ?? "").trim();
    const { match, ambiguous } = resolveConversation(name, conversations);
    const body = (quoted?.[1] ?? quoted?.[2] ?? "").trim();
    const notes: string[] = [];
    if (!body) notes.push("No quoted message text found — add the message to send.");
    if (ambiguous) notes.push(`"${name}" matches several conversations — pick one.`);
    if (!match && !ambiguous) notes.push(name ? `No conversation named "${name}" found.` : "No destination conversation found.");
    if (!time) notes.push("No time found — suggested tomorrow 9 AM.");
    const at = time?.at ?? defaultSuggestion(now, timezone);
    return {
      kind: "message",
      title: `Message to ${match?.title ?? (name || "conversation")}`,
      payload: { conversationId: match?.id ?? "", body },
      scheduledFor: at.toISOString(),
      timezone,
      confidence: match && body && time ? "high" : "low",
      notes,
    };
  }

  // --- Profile change: update/change my <field> to <value> ---
  const profile = text.match(/\b(update|change)\s+my\s+(phone(?: number)?|name|country|location|bio)\s+(?:to|as)\s+(.+)/i);
  if (profile) {
    const rawField = profile[2].toLowerCase();
    const field = rawField.startsWith("phone") ? "phone" : rawField;
    const value = cleanSubject(profile[3], time, false).replace(/[.,;!?]+$/, "").trim();
    const notes: string[] = [];
    if (!value) notes.push("No new value found — add it before scheduling.");
    if (!time) notes.push("No time found — suggested tomorrow 9 AM.");
    const at = time?.at ?? defaultSuggestion(now, timezone);
    return {
      kind: "profile_update",
      title: `Update ${field} to ${value || "…"}`,
      payload: { fields: { [field]: value } },
      scheduledFor: at.toISOString(),
      timezone,
      confidence: value && time ? "high" : "low",
      notes,
    };
  }

  // --- Reminder ---
  if (/\bremind\b/.test(lower)) {
    const stripped = text.replace(/^(please\s+)?remind\s+me\s+(to\s+)?/i, "");
    const subject = cleanSubject(stripped, time).replace(/^(to\s+)/i, "").trim() || text;
    const notes: string[] = [];
    if (!time) notes.push("No time found — suggested tomorrow 9 AM.");
    const at = time?.at ?? defaultSuggestion(now, timezone);
    return {
      kind: "reminder",
      title: `Remind: ${subject.slice(0, 80)}`,
      payload: { text: subject },
      scheduledFor: at.toISOString(),
      timezone,
      confidence: time ? "high" : "low",
      notes,
    };
  }

  // --- Workflow note (explicit only; steps are added at review time) ---
  if (/\bworkflow\b/.test(lower)) {
    const subject = cleanSubject(text, time);
    const notes: string[] = [];
    if (!time) notes.push("No time found — suggested tomorrow 9 AM.");
    const at = time?.at ?? defaultSuggestion(now, timezone);
    return {
      kind: "workflow",
      title: `Workflow: ${subject.slice(0, 60) || "scheduled workflow"}`,
      payload: { note: subject },
      scheduledFor: at.toISOString(),
      timezone,
      confidence: time ? "high" : "low",
      notes,
    };
  }

  // Default: a timed instruction without a trigger reads as a reminder.
  if (time) {
    const subject = cleanSubject(text, time);
    return {
      kind: "reminder",
      title: `Remind: ${subject.slice(0, 80)}`,
      payload: { text: subject },
      scheduledFor: time.at.toISOString(),
      timezone,
      confidence: "low",
      notes: ["Interpreted as a reminder — change the type if you meant something else."],
    };
  }

  return null;
}

/** Tomorrow 09:00 in the given timezone, as a reviewable suggestion. */
function defaultSuggestion(now: Date, tz: string): Date {
  const parts = zonedParts(now, tz);
  const base = new Date(Date.UTC(parts.y, parts.mo - 1, parts.d + 1));
  return zonedDateTime(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate(), 9, 0, tz);
}
