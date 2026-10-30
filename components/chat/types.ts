export interface ConversationItem {
  id: string;
  type: string;
  title: string;
  groupId: string | null;
  updatedAt: string;
  unread: number;
  lastMessage: { preview: string; createdAt: string } | null;
  memberCount: number;
  peerShortId: string | null;
  providerKind: string | null;
  hasProject: boolean;
  muted: boolean;
  pinned: boolean;
  archived: boolean;
}

export interface ReactionGroup {
  emoji: string;
  count: number;
  names: string[];
  mine: boolean;
}

export interface ChatAttachment {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

export interface ChatMessage {
  id: string;
  kind: string;
  body: string;
  senderId: string | null;
  senderName: string | null;
  senderShortId: string | null;
  clientMessageId: string | null;
  createdAt: string;
  editedAt: string | null;
  deleted: boolean;
  reply: { id: string; body: string; senderName: string | null } | null;
  metadata: Record<string, unknown>;
  attachment: ChatAttachment | null;
  reactions: ReactionGroup[];
  read: boolean | null;
  readCount: number | null;
}

export interface ThreadMember {
  userId: string;
  role: string;
  name: string;
  shortId: string;
}

export interface ThreadData {
  conversation: { id: string; type: string; title: string | null; groupId: string | null };
  members: ThreadMember[];
  myRole: string;
  mySettings: { muted?: boolean; pinned?: boolean; archived?: boolean };
  myLastReadAt: string | null;
  messages: ChatMessage[];
  hasMore: boolean;
  nextBefore: string | null;
}

export type ChatFilter = "all" | "individual" | "groups" | "providers" | "projects" | "unread" | "archived";

export async function readApi<T>(res: Response): Promise<T> {
  const body = (await res.json()) as { ok: boolean; data?: T; error?: string };
  if (!res.ok || !body.ok || body.data === undefined) {
    throw new Error(body.error ?? "Something went wrong. Please try again.");
  }
  return body.data;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Split messages into day groups for date separators. */
export function groupByDay(messages: ChatMessage[]): Array<{ day: string; items: ChatMessage[] }> {
  const groups: Array<{ day: string; items: ChatMessage[] }> = [];
  for (const m of messages) {
    const day = new Date(m.createdAt).toLocaleDateString("en-US", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push(m);
    else groups.push({ day, items: [m] });
  }
  return groups;
}
