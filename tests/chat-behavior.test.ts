import { describe, expect, it } from "vitest";
import {
  DELETED_MESSAGE_BODY,
  isValidEmoji,
  messagePreview,
  normalizeSettings,
} from "@/lib/chat";
import { validateChatMediaUpload } from "@/lib/storage";
import {
  chatForwardSchema,
  chatMessageCreateSchema,
  chatReactionSchema,
  chatSettingsSchema,
  chatSummarizeSchema,
} from "@/lib/validation";

describe("isValidEmoji (reactions)", () => {
  it("accepts single emoji including modifiers", () => {
    expect(isValidEmoji("👍")).toBe(true);
    expect(isValidEmoji("❤️")).toBe(true);
    expect(isValidEmoji("👍🏽")).toBe(true);
  });

  it("rejects plain text, multiples, and whitespace", () => {
    expect(isValidEmoji("ab")).toBe(false);
    expect(isValidEmoji("hello")).toBe(false);
    expect(isValidEmoji("👍👍👍👍👍")).toBe(false);
    expect(isValidEmoji("👍 👍")).toBe(false);
    expect(isValidEmoji("")).toBe(false);
  });
});

describe("normalizeSettings (mute/pin/archive)", () => {
  it("merges patches and drops unknown keys", () => {
    expect(normalizeSettings({ muted: true, pinned: false, evil: 1 }, { archived: true })).toEqual({
      muted: true,
      pinned: false,
      archived: true,
    });
  });

  it("ignores non-boolean values", () => {
    expect(normalizeSettings({ muted: "yes" })).toEqual({});
    expect(normalizeSettings({}, { pinned: true })).toEqual({ pinned: true });
  });
});

describe("messagePreview (notification safety)", () => {
  it("never leaks deleted content", () => {
    expect(messagePreview("secret", { deleted: true })).toBe(DELETED_MESSAGE_BODY);
  });

  it("describes attachment-only messages", () => {
    expect(messagePreview("  ", { hasAttachment: true })).toBe("Sent an attachment.");
    expect(messagePreview("  ")).toBe("Sent a message.");
    expect(messagePreview("hello world")).toBe("hello world");
    expect(messagePreview("x".repeat(500), { max: 10 })).toBe("x".repeat(10));
  });
});

describe("chat message schemas", () => {
  it("accepts rich sends and rejects empty ones", () => {
    expect(
      chatMessageCreateSchema.safeParse({ body: "hi", clientMessageId: "k1" }).success,
    ).toBe(true);
    expect(
      chatMessageCreateSchema.safeParse({
        body: "",
        clientMessageId: "k2",
        attachmentId: "d1",
      }).success,
    ).toBe(true);
    expect(
      chatMessageCreateSchema.safeParse({
        body: "",
        clientMessageId: "k3",
        reference: { type: "project", id: "p1" },
      }).success,
    ).toBe(true);
    expect(chatMessageCreateSchema.safeParse({ body: "x".repeat(8001), clientMessageId: "k4" }).success).toBe(false);
  });

  it("validates reactions, forwards, settings, and summarize requests", () => {
    expect(chatReactionSchema.safeParse({ emoji: "🎉" }).success).toBe(true);
    expect(chatReactionSchema.safeParse({ emoji: "nope" }).success).toBe(false);
    expect(chatForwardSchema.safeParse({ messageId: "m", toConversationId: "c" }).success).toBe(true);
    expect(chatSettingsSchema.safeParse({ muted: true, pinned: false }).success).toBe(true);
    expect(chatSettingsSchema.safeParse({ muted: "yes" }).success).toBe(false);
    expect(
      chatSummarizeSchema.safeParse({ taskId: "extract_action_items", goal: "x", limit: 50 }).success,
    ).toBe(true);
    expect(chatSummarizeSchema.safeParse({ taskId: "bogus" }).success).toBe(false);
  });
});

describe("validateChatMediaUpload", () => {
  it("allows voice notes and clips within limits", () => {
    expect(validateChatMediaUpload("audio/webm", 1024)).toBeNull();
    expect(validateChatMediaUpload("video/mp4", 1024)).toBeNull();
    expect(validateChatMediaUpload("audio/mpeg;codecs=mp3", 1024)).toBeNull();
  });

  it("rejects unsupported types, oversize, and empty files", () => {
    expect(validateChatMediaUpload("application/zip", 1024)).toContain("not supported");
    expect(validateChatMediaUpload("audio/webm", 60 * 1024 * 1024)).toContain("50 MB");
    expect(validateChatMediaUpload("audio/webm", 0)).toContain("empty");
  });
});
