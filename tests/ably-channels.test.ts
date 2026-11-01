import { describe, expect, it } from "vitest";
import {
  PRESENCE_CHANNEL,
  RealtimeEvents,
  conversationChannel,
  groupChannel,
  normalizeChannel,
  userChannel,
} from "@/lib/ably/events";

describe("Ably channel naming", () => {
  it("builds private scoped channels", () => {
    expect(conversationChannel("c1")).toBe("private:conversation:c1");
    expect(userChannel("u1")).toBe("private:user:u1");
    expect(groupChannel("g1")).toBe("private:group:g1");
    expect(PRESENCE_CHANNEL).toBe("private:presence");
  });
  it("normalizes legacy room names to canonical channels", () => {
    expect(normalizeChannel("conversation:c1")).toBe("private:conversation:c1");
    expect(normalizeChannel("user:u1")).toBe("private:user:u1");
    expect(normalizeChannel("group:g1")).toBe("private:group:g1");
    expect(normalizeChannel("private:conversation:c1")).toBe("private:conversation:c1");
  });
});

describe("Realtime event names", () => {
  it("uses the chat2.md canonical schema", () => {
    expect(RealtimeEvents.messageNew).toBe("message:new");
    expect(RealtimeEvents.messageEdit).toBe("message:edit");
    expect(RealtimeEvents.messageDelete).toBe("message:delete");
    expect(RealtimeEvents.messageReaction).toBe("message:reaction");
    expect(RealtimeEvents.messageRead).toBe("message:read");
    expect(RealtimeEvents.messageDelivered).toBe("message:delivered");
    expect(RealtimeEvents.typingStart).toBe("typing:start");
    expect(RealtimeEvents.typingStop).toBe("typing:stop");
    expect(RealtimeEvents.presenceUpdate).toBe("presence:update");
    expect(RealtimeEvents.conversationUpdate).toBe("conversation:update");
  });
  it("uses split call-signaling events (no multiplexed call:signal)", () => {
    expect(RealtimeEvents.callInvite).toBe("call:invite");
    expect(RealtimeEvents.callAccept).toBe("call:accept");
    expect(RealtimeEvents.callReject).toBe("call:reject");
    expect(RealtimeEvents.callEnd).toBe("call:end");
    expect(RealtimeEvents.webrtcOffer).toBe("webrtc:offer");
    expect(RealtimeEvents.webrtcAnswer).toBe("webrtc:answer");
    expect(RealtimeEvents.webrtcIceCandidate).toBe("webrtc:ice-candidate");
    expect(RealtimeEvents.callMediaState).toBe("call:media-state");
  });
});
