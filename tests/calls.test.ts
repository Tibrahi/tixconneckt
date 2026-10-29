import { describe, expect, it } from "vitest";
import { resolveCallDecision } from "@/lib/calls";
import { callDecisionSchema, callSignalSchema } from "@/lib/validation";

describe("resolveCallDecision", () => {
  it("lets the callee accept or decline a ringing call", () => {
    expect(resolveCallDecision("ringing", "accepted", "callee")).toMatchObject({
      status: "accepted",
      event: "call:accepted",
    });
    expect(resolveCallDecision("ringing", "declined", "callee")).toMatchObject({
      status: "declined",
      event: "call:declined",
    });
  });
  it("treats callee hangup while ringing as a decline", () => {
    expect(resolveCallDecision("ringing", "ended", "callee")).toMatchObject({
      status: "declined",
      event: "call:declined",
    });
  });
  it("marks caller hangup while ringing as missed", () => {
    expect(resolveCallDecision("ringing", "ended", "caller")).toMatchObject({
      status: "missed",
      event: "call:missed",
      notifyMissed: true,
    });
  });
  it("ends an active call from either side", () => {
    expect(resolveCallDecision("accepted", "ended", "caller")).toMatchObject({ status: "ended" });
    expect(resolveCallDecision("accepted", "ended", "callee")).toMatchObject({ status: "ended" });
  });
  it("rejects invalid transitions", () => {
    expect(resolveCallDecision("ringing", "accepted", "caller")).toHaveProperty("error");
    expect(resolveCallDecision("accepted", "accepted", "callee")).toHaveProperty("error");
    expect(resolveCallDecision("ended", "ended", "caller")).toHaveProperty("error");
    expect(resolveCallDecision("missed", "ended", "callee")).toHaveProperty("error");
  });
});

describe("callSignalSchema", () => {
  it("accepts offers, answers, and ICE candidates", () => {
    expect(callSignalSchema.safeParse({ kind: "offer", sdp: "v=0..." }).success).toBe(true);
    expect(
      callSignalSchema.safeParse({ kind: "answer", sdp: "v=0..." }).success,
    ).toBe(true);
    expect(
      callSignalSchema.safeParse({
        kind: "candidate",
        candidate: "candidate:1 1 udp 2122260223 192.168.1.2 54400 typ host",
        sdpMid: "0",
        sdpMLineIndex: 0,
      }).success,
    ).toBe(true);
  });
  it("rejects malformed or oversized payloads", () => {
    expect(callSignalSchema.safeParse({ kind: "offer" }).success).toBe(false);
    expect(callSignalSchema.safeParse({ kind: "candidate" }).success).toBe(false);
    expect(callSignalSchema.safeParse({ kind: "hangup" }).success).toBe(false);
    expect(
      callSignalSchema.safeParse({ kind: "offer", sdp: "x".repeat(65536) }).success,
    ).toBe(false);
  });
});

describe("callDecisionSchema", () => {
  it("accepts the three decisions only", () => {
    expect(callDecisionSchema.safeParse({ decision: "accepted" }).success).toBe(true);
    expect(callDecisionSchema.safeParse({ decision: "ended" }).success).toBe(true);
    expect(callDecisionSchema.safeParse({ decision: "ringing" }).success).toBe(false);
  });
});
