import { describe, expect, it } from "vitest";
import {
  buildDialogue,
  callDurationMs,
  callOutcome,
  formatCallDuration,
  transcriptionActive,
} from "@/lib/call-transcript";
import { resolveCallDecision } from "@/lib/calls";
import { callHideSchema, callTranscriptConsentSchema, callTranscriptSegmentsSchema } from "@/lib/validation";

describe("transcriptionActive", () => {
  it("follows only the caller's switch", () => {
    expect(transcriptionActive([], "a")).toBe(false);
    expect(transcriptionActive([{ userId: "b", consented: true }], "a")).toBe(false);
    expect(
      transcriptionActive(
        [
          { userId: "a", consented: true },
          { userId: "b", consented: false },
        ],
        "a",
      ),
    ).toBe(true);
  });

  it("goes inactive when the caller opts out", () => {
    expect(
      transcriptionActive(
        [
          { userId: "a", consented: false },
          { userId: "b", consented: true },
        ],
        "a",
      ),
    ).toBe(false);
    expect(transcriptionActive([], "")).toBe(false);
  });
});

describe("buildDialogue", () => {
  it("labels distinct voices C1/C2/… in order of first appearance", () => {
    const lines = buildDialogue(
      [
        { segmentIndex: 0, speaker: "u1", text: "Hello", final: true },
        { segmentIndex: 1, speaker: "u2", text: "Hi there", final: true },
        { segmentIndex: 2, speaker: "u1", text: "How are you", final: true },
      ],
      { u1: "Ama", u2: "Ben" },
    );
    expect(lines.map((l) => [l.who, l.name, l.text])).toEqual([
      ["C1", "Ama", "Hello"],
      ["C2", "Ben", "Hi there"],
      ["C1", "Ama", "How are you"],
    ]);
  });

  it("sorts by segment index and groups unattributed speech as one voice", () => {
    const lines = buildDialogue([
      { segmentIndex: 2, speaker: null, text: "third", final: true },
      { segmentIndex: 0, speaker: null, text: "first", final: true },
      { segmentIndex: 1, speaker: "u9", text: "second", final: true },
    ]);
    expect(lines.map((l) => [l.segmentIndex, l.who, l.name])).toEqual([
      [0, "C1", null],
      [1, "C2", null],
      [2, "C1", null],
    ]);
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
