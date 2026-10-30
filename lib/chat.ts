import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  conversationMembers,
  conversations,
  fundingRequests,
  messages,
  projects,
  users,
} from "@/db/schema";
import { emitToRoom } from "./realtime";

/** Placeholder body for delete-for-everyone tombstones. */
export const DELETED_MESSAGE_BODY = "This message was deleted.";

/** True for single-emoji reactions (allows modifiers, rejects plain text). */
export function isValidEmoji(value: string): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  const points = Array.from(trimmed);
  if (points.length < 1 || points.length > 4) return false;
  if (/\s/.test(trimmed)) return false;
  return /\p{Extended_Pictographic}/u.test(trimmed);
}

export interface MemberSettings {
  muted?: boolean;
  pinned?: boolean;
  archived?: boolean;
}

/** Merge partial settings over stored ones, dropping unknown keys. */
export function normalizeSettings(
  stored: unknown,
  patch?: Partial<MemberSettings>,
): MemberSettings {
  const base = (stored ?? {}) as Record<string, unknown>;
  const pick = (v: unknown) => (typeof v === "boolean" ? v : undefined);
  const merged: MemberSettings = {
    muted: pick(base.muted),
    pinned: pick(base.pinned),
    archived: pick(base.archived),
  };
  if (patch) {
    if (pick(patch.muted) !== undefined) merged.muted = patch.muted;
    if (pick(patch.pinned) !== undefined) merged.pinned = patch.pinned;
    if (pick(patch.archived) !== undefined) merged.archived = patch.archived;
  }
  return Object.fromEntries(Object.entries(merged).filter(([, v]) => v !== undefined));
}

/** Notification-safe preview that never leaks deleted content. */
export function messagePreview(
  body: string,
  opts: { deleted?: boolean; hasAttachment?: boolean; max?: number } = {},
): string {
  if (opts.deleted) return DELETED_MESSAGE_BODY;
  const text = body.trim();
  if (text) return text.slice(0, opts.max ?? 200);
  if (opts.hasAttachment) return "Sent an attachment.";
  return "Sent a message.";
}

export interface Membership {
  id: string;
  role: string;
  settings: MemberSettings;
  conversation: { id: string; type: string; title: string | null; groupId: string | null };
}

/** Membership + conversation in one check; null when unauthorized. */
export async function requireConversationMembership(
  conversationId: string,
  userId: string,
): Promise<Membership | null> {
  const db = getDb();
  const [row] = await db
    .select({
      id: conversationMembers.id,
      role: conversationMembers.role,
      settings: conversationMembers.settings,
      conversationId: conversations.id,
      type: conversations.type,
      title: conversations.title,
      groupId: conversations.groupId,
    })
    .from(conversationMembers)
    .innerJoin(conversations, eq(conversations.id, conversationMembers.conversationId))
    .where(
      and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, userId),
      ),
    )
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    role: row.role,
    settings: normalizeSettings(row.settings),
    conversation: { id: row.conversationId, type: row.type, title: row.title, groupId: row.groupId },
  };
}

/**
 * Post a system message (member joined, call ended, ...). No sender, no
 * notifications — the triggering action already notified where needed.
 */
export async function postSystemMessage(
  conversationId: string,
  body: string,
  metadata: Record<string, unknown> = {},
): Promise<string> {
  const db = getDb();
  const [inserted] = await db
    .insert(messages)
    .values({ conversationId, senderId: null, kind: "system", body: body.slice(0, 2000), metadata })
    .returning({ id: messages.id, createdAt: messages.createdAt });
  await db
    .update(conversations)
    .set({ updatedAt: new Date() })
    .where(eq(conversations.id, conversationId));
  await emitToRoom(`conversation:${conversationId}`, "message:new", {
    id: inserted.id,
    conversationId,
    kind: "system",
    body: inserted ? body.slice(0, 2000) : "",
    createdAt: inserted.createdAt,
  });
  return inserted.id;
}

export type ReferenceType = "project" | "profile" | "request" | "ai_summary";

export interface ReferenceSnapshot {
  type: ReferenceType;
  id: string;
  title: string;
  subtitle?: string;
}

/**
 * Verify a share target exists and build its minimal snapshot. Snapshots
 * carry only a title + link: full content stays behind the destination
 * page's own authorization, and the sharer's explicit share is the
 * authorization for the reference itself.
 */
export async function resolveReferenceSnapshot(
  type: ReferenceType,
  id: string,
): Promise<ReferenceSnapshot | null> {
  const db = getDb();
  if (type === "profile") {
    const [user] = await db
      .select({ shortId: users.shortId, name: users.name })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    if (!user) return null;
    return { type, id, title: user.name, subtitle: user.shortId };
  }
  if (type === "project") {
    const [project] = await db
      .select({ id: projects.id, title: projects.title })
      .from(projects)
      .where(eq(projects.id, id))
      .limit(1);
    if (!project) return null;
    return { type, id, title: project.title };
  }
  if (type === "request") {
    const [request] = await db
      .select({ id: fundingRequests.id, status: fundingRequests.status })
      .from(fundingRequests)
      .where(eq(fundingRequests.id, id))
      .limit(1);
    if (!request) return null;
    return { type, id, title: `Funding request ${id.slice(0, 8)}`, subtitle: request.status };
  }
  // ai_summary snapshots are verified by the summarize endpoint, not here.
  return null;
}
