/**
 * Shared Ably channel + event contracts (isomorphic — no secrets here).
 *
 * Ably is the ONLY managed realtime transport. Every event reflects an
 * already-persisted database operation (or an explicitly ephemeral signal
 * such as typing); clients re-fetch authoritative records from the API.
 */

/** Global presence channel: every connected client enters presence here. */
export const PRESENCE_CHANNEL = "private:presence";

export function userChannel(userId: string): string {
  return `private:user:${userId}`;
}

export function conversationChannel(conversationId: string): string {
  return `private:conversation:${conversationId}`;
}

export function groupChannel(groupId: string): string {
  return `private:group:${groupId}`;
}

/**
 * Normalize any room reference to its Ably channel name. Accepts the
 * canonical `private:*` names and legacy `conversation:`/`user:`/`group:`
 * room names so older stored references keep resolving.
 */
export function normalizeChannel(room: string): string {
  if (room.startsWith("private:")) return room;
  if (room.startsWith("conversation:") || room.startsWith("user:") || room.startsWith("group:")) {
    return `private:${room}`;
  }
  return `private:${room}`;
}

/** Canonical realtime event names. */
export const RealtimeEvents = {
  // Chat (chat2.md Phase 4)
  messageNew: "message:new",
  messageEdit: "message:edit",
  messageDelete: "message:delete",
  messageReaction: "message:reaction",
  messageRead: "message:read",
  messageDelivered: "message:delivered",
  typingStart: "typing:start",
  typingStop: "typing:stop",
  presenceUpdate: "presence:update",
  conversationUpdate: "conversation:update",
  // Calls — Ably carries signaling only; media is peer-to-peer WebRTC.
  callInvite: "call:invite",
  callAccept: "call:accept",
  callReject: "call:reject",
  callEnd: "call:end",
  callMissed: "call:missed",
  webrtcOffer: "webrtc:offer",
  webrtcAnswer: "webrtc:answer",
  webrtcIceCandidate: "webrtc:ice-candidate",
  callMediaState: "call:media-state",
  // Platform domain events
  notificationNew: "notification:new",
  connectionUpdated: "connection:updated",
  groupMembers: "group:members",
  groupApproval: "group:approval",
  walletUpdated: "wallet:updated",
} as const;

export type RealtimeEventName = (typeof RealtimeEvents)[keyof typeof RealtimeEvents];

/** Envelope published on every channel: caller payload plus server time. */
export interface PublishedEvent<T = Record<string, unknown>> {
  event: string;
  payload: T & { at: string };
}

/** Payload shapes (all include `at` once published). */
export interface MessageNewPayload {
  id: string;
  conversationId: string;
  kind: string;
  senderId?: string;
  senderName?: string;
  body: string;
  replyToId?: string | null;
  attachmentId?: string | null;
  metadata?: Record<string, unknown>;
  createdAt: string | Date;
}

export interface TypingPayload {
  conversationId: string;
  userId: string;
  name: string;
}

export interface PresenceUpdatePayload {
  userId: string;
  online: boolean;
}
