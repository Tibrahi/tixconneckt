import { describe, expect, it } from "vitest";
import { interpretLocally } from "@/lib/action-interpret";
import {
  computeRetryDelayMinutes,
  isStaleClaim,
  isValidTimezone,
  maxScheduledFor,
  scheduledMessageKey,
} from "@/lib/action-policy";
import { actionResultEmail } from "@/lib/email";
import { actionScheduleSchema, workflowStepsSchema } from "@/lib/validation";

// Friday 2026-10-30 10:00 UTC (12:00 in Kigali, UTC+2, no DST).
const NOW = new Date("2026-10-30T10:00:00.000Z");

describe("interpretLocally — reminders (spec §15)", () => {
  it("parses 'tomorrow at 9am Kigali time'", () => {
    const p = interpretLocally("Remind me to call the group tomorrow at 9am Kigali time", {
      now: NOW,
      timezone: "UTC",
    });
    expect(p?.kind).toBe("reminder");
    expect(p?.timezone).toBe("Africa/Kigali");
    // 9:00 CAT = 07:00 UTC on 2026-10-31.
    expect(p?.scheduledFor).toBe("2026-10-31T07:00:00.000Z");
    expect(p?.payload).toEqual({ text: "call the group" });
    expect(p?.confidence).toBe("high");
  });

  it("parses relative times", () => {
    const p = interpretLocally("Remind me to stretch in 2 hours", { now: NOW, timezone: "UTC" });
    expect(p?.scheduledFor).toBe("2026-10-30T12:00:00.000Z");
    expect(p?.payload).toEqual({ text: "stretch" });
  });

  it("moves bare past times to tomorrow", () => {
    const p = interpretLocally("Remind me to stretch at 9am", { now: NOW, timezone: "UTC" });
    expect(p?.scheduledFor).toBe("2026-10-31T09:00:00.000Z");
  });

  it("keeps bare future times today", () => {
    const p = interpretLocally("Remind me to stretch at 6pm", { now: NOW, timezone: "UTC" });
    expect(p?.scheduledFor).toBe("2026-10-30T18:00:00.000Z");
  });

  it("parses weekday and 'next weekday'", () => {
    const monday = interpretLocally("Remind me to plan Monday at 10", { now: NOW, timezone: "UTC" });
    expect(monday?.scheduledFor).toBe("2026-11-02T10:00:00.000Z");
    const nextMonday = interpretLocally("Remind me to plan next Monday at 10", {
      now: NOW,
      timezone: "UTC",
    });
    expect(nextMonday?.scheduledFor).toBe("2026-11-09T10:00:00.000Z");
  });

  it("suggests a time with a note when none is given", () => {
    const p = interpretLocally("Remind me to drink water", { now: NOW, timezone: "UTC" });
    expect(p?.confidence).toBe("low");
    expect(p?.scheduledFor).toBe("2026-10-31T09:00:00.000Z");
    expect(p?.notes.join(" ")).toMatch(/no time found/i);
  });
});

describe("interpretLocally — messages", () => {
  const conversations = [
    { id: "c-eng", title: "Engineering" },
    { id: "c-soc", title: "Football Club" },
  ];

  it("resolves the conversation and quoted text", () => {
    const p = interpretLocally('Send "Hello team" to Engineering tomorrow at 9am', {
      now: NOW,
      timezone: "UTC",
      conversations,
    });
    expect(p?.kind).toBe("message");
    expect(p?.payload).toEqual({ conversationId: "c-eng", body: "Hello team" });
    expect(p?.scheduledFor).toBe("2026-10-31T09:00:00.000Z");
    expect(p?.confidence).toBe("high");
  });

  it("flags ambiguous conversation names", () => {
    const p = interpretLocally('Send "hi" to e tomorrow at 9am', {
      now: NOW,
      timezone: "UTC",
      conversations: [
        { id: "c1", title: "Engineering" },
        { id: "c2", title: "Designers League" },
      ],
    });
    expect(p?.confidence).toBe("low");
    expect(p?.payload).toEqual({ conversationId: "", body: "hi" });
    expect(p?.notes.join(" ")).toMatch(/several conversations/i);
  });

  it("flags unknown conversations instead of guessing", () => {
    const p = interpretLocally('Send "hi" to Nobody tomorrow at 9am', {
      now: NOW,
      timezone: "UTC",
      conversations,
    });
    expect(p?.confidence).toBe("low");
    expect(p?.notes.join(" ")).toMatch(/no conversation/i);
  });
});

describe("interpretLocally — profile and workflow", () => {
  it("parses phone updates", () => {
    const p = interpretLocally("Update my phone to +250788123456 tomorrow", {
      now: NOW,
      timezone: "UTC",
    });
    expect(p?.kind).toBe("profile_update");
    expect(p?.payload).toEqual({ fields: { phone: "+250788123456" } });
    expect(p?.scheduledFor).toBe("2026-10-31T09:00:00.000Z");
  });

  it("keeps country values intact", () => {
    const p = interpretLocally("Change my country to Rwanda tomorrow", {
      now: NOW,
      timezone: "UTC",
    });
    expect(p?.payload).toEqual({ fields: { country: "Rwanda" } });
  });

  it("treats timed instructions without a trigger as low-confidence reminders", () => {
    const p = interpretLocally("Prepare the agenda tomorrow at 8am", { now: NOW, timezone: "UTC" });
    expect(p?.kind).toBe("reminder");
    expect(p?.confidence).toBe("low");
  });

  it("returns null for unrecognizable instructions", () => {
    expect(interpretLocally("hello there", { now: NOW, timezone: "UTC" })).toBeNull();
    expect(interpretLocally("   ", { now: NOW })).toBeNull();
  });
});

describe("action policy (spec §15 safeguards)", () => {
  it("backs off 5m, 20m, then 60m", () => {
    expect(computeRetryDelayMinutes(1)).toBe(5);
    expect(computeRetryDelayMinutes(2)).toBe(20);
    expect(computeRetryDelayMinutes(3)).toBe(60);
    expect(computeRetryDelayMinutes(9)).toBe(60);
  });

  it("detects stale execution claims", () => {
    const now = new Date("2026-10-30T10:00:00.000Z");
    expect(isStaleClaim(new Date("2026-10-30T09:44:00.000Z"), now)).toBe(true);
    expect(isStaleClaim(new Date("2026-10-30T09:55:00.000Z"), now)).toBe(false);
  });

  it("keys scheduled messages deterministically", () => {
    expect(scheduledMessageKey("a1")).toBe("scheduled:a1");
    expect(scheduledMessageKey("a1")).toBe(scheduledMessageKey("a1"));
  });

  it("validates IANA timezones strictly", () => {
    expect(isValidTimezone("Africa/Kigali")).toBe(true);
    expect(isValidTimezone("UTC")).toBe(true);
    expect(isValidTimezone("Mars/Olympus")).toBe(false);
    expect(isValidTimezone("")).toBe(false);
  });

  it("caps schedules at five years out", () => {
    const now = new Date("2026-10-30T10:00:00.000Z");
    expect(maxScheduledFor(now).toISOString()).toBe("2031-10-30T10:00:00.000Z");
  });
});

describe("workflow steps schema", () => {
  it("accepts reviewed sequences and rejects nesting or excess steps", () => {
    expect(
      workflowStepsSchema.safeParse([
        { kind: "message", payload: { conversationId: "c", body: "hi" } },
        { kind: "reminder", payload: { text: "follow up" } },
      ]).success,
    ).toBe(true);
    expect(workflowStepsSchema.safeParse([]).success).toBe(true);
    expect(
      workflowStepsSchema.safeParse([{ kind: "workflow", payload: {} }]).success,
    ).toBe(false);
    expect(
      workflowStepsSchema.safeParse(
        Array.from({ length: 6 }, () => ({ kind: "reminder", payload: { text: "x" } })),
      ).success,
    ).toBe(false);
  });
});

describe("schedule idempotency + result emails", () => {
  it("accepts an optional client idempotency key", () => {
    const base = {
      kind: "reminder",
      title: "Test reminder",
      payload: { text: "hi" },
      scheduledFor: "2026-11-01T09:00:00.000Z",
      timezone: "UTC",
    } as const;
    expect(actionScheduleSchema.safeParse({ ...base, idempotencyKey: "client-key-1" }).success).toBe(true);
    expect(actionScheduleSchema.safeParse(base).success).toBe(true);
    expect(actionScheduleSchema.safeParse({ ...base, idempotencyKey: "short" }).success).toBe(false);
  });

  it("reports completion and failure results", () => {
    const done = actionResultEmail({ title: "Standup", outcome: "completed", detail: "Reminder delivered." });
    expect(done.subject).toContain("completed");
    expect(done.text).toContain("Standup");
    const failed = actionResultEmail({ title: "Standup", outcome: "failed", detail: "No longer a member." });
    expect(failed.subject).toContain("failed");
    expect(failed.text).toContain("No longer a member.");
  });
});
