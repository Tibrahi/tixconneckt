import { describe, expect, it } from "vitest";
import {
  callDurationMs,
  callOutcome,
  formatCallDuration,
  transcriptionActive,
} from "@/lib/call-transcript";
import { resolveCallDecision } from "@/lib/calls";
import { callHideSchema, callTranscriptConsentSchema, callTranscriptSegmentsSchema } from "@/lib/validation";

describe("transcriptionActive", () => {
  it("requires every participant to consent", () => {
    expect(transcriptionActive([], ["a", "b"])).toBe(false);
    expect(transcriptionActive([{ userId: "a", consented: true }], ["a", "b"])).toBe(false);
    expect(
      transcriptionActive(
        [
          { userId: "a", consented: true },
          { userId: "b", consented: true },
        ],
        ["a", "b"],
      ),
    ).toBe(true);
  });

  it("goes inactive when either participant opts out", () => {
    expect(
      transcriptionActive(
        [
          { userId: "a", consented: true },
          { userId: "b", consented: false },
        ],
        ["a", "b"],
      ),
    ).toBe(false);
    expect(transcriptionActive([], [])).toBe(false);
  });
});

describe("call history helpers", () => {
  it("labels outcomes and formats durations", () => {
    expect(callOutcome("missed")).toBe("missed");
    expect(callOutcome("failed")).toBe("failed");
    expect(callOutcome("accepted")).toBe("active");
    expect(callOutcome("ringing")).toBe("ringing");
    expect(callDurationMs(new Date("2026-01-01T00:00:00Z"), new Date("2026-01-01T00:01:30Z"))).toBe(90000);
    expect(callDurationMs(null, new Date())).toBe(null);
    expect(formatCallDuration(90000)).toBe("1:30");
    expect(formatCallDuration(null)).toBe("—");
  });
});

describe("failed call transitions", () => {
  it("lets either side mark a live call failed", () => {
    expect(resolveCallDecision("ringing", "failed", "caller")).toMatchObject({ status: "failed", event: "call:failed" });
    expect(resolveCallDecision("accepted", "failed", "callee")).toMatchObject({ status: "failed" });
  });
  it("rejects failing a finished call", () => {
    expect(resolveCallDecision("ended", "failed", "caller")).toHaveProperty("error");
    expect(resolveCallDecision("missed", "failed", "callee")).toHaveProperty("error");
  });
});

describe("transcript validation", () => {
  it("accepts consent toggles and bounded segments", () => {
    expect(callTranscriptConsentSchema.safeParse({ consented: true }).success).toBe(true);
    expect(
      callTranscriptSegmentsSchema.safeParse({
        segments: [{ segmentIndex: 0, text: "Hello", speaker: "A" }],
      }).success,
    ).toBe(true);
    expect(callHideSchema.safeParse({ hidden: true }).success).toBe(true);
  });
  it("rejects empty, oversized, or malformed payloads", () => {
    expect(callTranscriptSegmentsSchema.safeParse({ segments: [] }).success).toBe(false);
    expect(
      callTranscriptSegmentsSchema.safeParse({ segments: [{ segmentIndex: -1, text: "x" }] }).success,
    ).toBe(false);
    expect(
      callTranscriptSegmentsSchema.safeParse({ segments: [{ segmentIndex: 0, text: "  " }] }).success,
    ).toBe(false);
    expect(
      callTranscriptSegmentsSchema.safeParse({
        segments: Array.from({ length: 201 }, (_, i) => ({ segmentIndex: i, text: "x" })),
      }).success,
    ).toBe(false);
  });
});
