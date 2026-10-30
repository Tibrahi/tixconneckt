"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ROUTES } from "@/lib/routes";
import { Badge } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/Feedback";
import { Button } from "@/components/ui/Button";
import { SelectField, TextField } from "@/components/ui/Fields";
import { Modal } from "@/components/ui/Modal";
import { useSocket } from "@/components/realtime/SocketProvider";
import { readApi, type ChatFilter, type ConversationItem } from "./types";

const FILTERS: Array<{ id: ChatFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "individual", label: "Individual" },
  { id: "groups", label: "Groups" },
  { id: "providers", label: "Providers" },
  { id: "projects", label: "Projects" },
  { id: "unread", label: "Unread" },
  { id: "archived", label: "Archived" },
];

function categoryLabel(c: ConversationItem): string {
  if (c.type === "provider") return c.providerKind ? `${c.providerKind} provider` : "Provider";
  if (c.type === "group") return "Group";
  return "Individual";
}

function RowMenu({
  item,
  onChanged,
  onError,
}: {
  item: ConversationItem;
  onChanged: () => void;
  onError: (m: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open ]);

  async function set(key: "muted" | "pinned" | "archived", value: boolean) {
    setOpen(false);
    try {
      const res = await fetch(`/api/chat/${encodeURIComponent(item.id)}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      });
      await readApi(res);
      onChanged();
    } catch (error) {
      onError(error instanceof Error ? error.message : "We couldn't save that change.");
    }
  }

  const btn = "block w-full px-3 py-1.5 text-left text-sm text-black hover:bg-neutral-100";
  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        aria-label={`Conversation options for ${item.title}`}
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(!open);
        }}
        className="rounded-md px-2 py-1 text-neutral-600 hover:bg-neutral-100 hover:text-black"
      >
        •••
      </button>
      {open ? (
        <div className="absolute top-full right-0 z-20 w-40 rounded-md border border-neutral-200 bg-white py-1 shadow-lg">
          <button type="button" className={btn} onClick={() => set("muted", !item.muted)}>
            {item.muted ? "Unmute" : "Mute"}
          </button>
          <button type="button" className={btn} onClick={() => set("pinned", !item.pinned)}>
            {item.pinned ? "Unpin" : "Pin"}
          </button>
          <button type="button" className={btn} onClick={() => set("archived", !item.archived)}>
            {item.archived ? "Unarchive" : "Archive"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Conversation navigation: filters, real search, and the conversation list
 * with categories, activity times, unread counts, and mute/pin/archive.
 * Shared by the chat home page and the thread sidebar.
 */
export function ConversationPanel({
  activeId,
  compact = false,
  onError,
}: {
  activeId?: string;
  compact?: boolean;
  onError: (m: string) => void;
}) {
  const [filter, setFilter] = useState<ChatFilter>("all");
  const [items, setItems] = useState<ConversationItem[] | null>(null);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<{
    conversations: Array<{ id: string; type: string; title: string }>;
    messages: Array<{ id: string; conversationId: string; preview: string; senderName: string | null; createdAt: string }>;
  } | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [newTab, setNewTab] = useState<"direct" | "group" | "provider">("direct");
  const [peerId, setPeerId] = useState("");
  const [groups, setGroups] = useState<Array<{ id: string; name: string }>>([]);
  const [groupId, setGroupId] = useState("");
  const [links, setLinks] = useState<Array<{ id: string; label: string }>>([]);
  const [linkId, setLinkId] = useState("");
  const [creating, setCreating] = useState(false);
  const { onEvent, connected } = useSocket();
  const searchTimer = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/chat?filter=${filter}`, { cache: "no-store" });
      const data = await readApi<{ individual: ConversationItem[]; group: ConversationItem[] }>(res);
      setItems([...data.individual, ...data.group]);
    } catch {
      setItems([]);
    }
  }, [filter]);

  useEffect(() => {
    load();
    let refreshTimer: number | undefined;
    const refresh = () => {
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => void load(), 250);
    };
    const pollId = connected ? undefined : window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 15000);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    const offs = [
      onEvent("message:new", refresh),
      onEvent("conversation:updated", refresh),
    ];
    return () => {
      if (pollId !== undefined) window.clearInterval(pollId);
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      offs.forEach((off) => off());
    };
  }, [load, onEvent, connected]);

  useEffect(() => {
    if (searchTimer.current) window.clearTimeout(searchTimer.current);
    const q = query.trim();
    if (q.length < 2) {
      setResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    searchTimer.current = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/chat/search?q=${encodeURIComponent(q)}`, { cache: "no-store" });
        setResults(await readApi(res));
      } catch {
        setResults({ conversations: [], messages: [] });
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => {
      if (searchTimer.current) window.clearTimeout(searchTimer.current);
    };
  }, [query]);

  async function openNew() {
    setNewOpen(true);
    try {
      const [g, p] = await Promise.all([
        fetch("/api/groups", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/providers", { cache: "no-store" }).then((r) => r.json()),
      ]);
      if (g?.ok && Array.isArray(g.data)) {
        setGroups(g.data.map((x: { id: string; name: string }) => ({ id: x.id, name: x.name })));
      }
      const mine = [...(p?.data?.myLinks ?? []), ...(p?.data?.groupLinks ?? [])] as Array<{
        id: string;
        status: string;
        groupId?: string;
      }>;
      setLinks(
        mine
          .filter((l) => l.status === "approved")
          .map((l) => ({ id: l.id, label: l.groupId ? `Group link ${l.id.slice(0, 8)}` : `Provider link ${l.id.slice(0, 8)}` })),
      );
    } catch {
      /* lists stay empty; direct chat still works */
    }
  }

  async function create() {
    setCreating(true);
    try {
      const payload =
        newTab === "direct"
          ? { type: "direct", memberShortIds: [peerId.trim().toUpperCase()] }
          : newTab === "group"
            ? { type: "group", groupId }
            : { type: "provider", providerLinkId: linkId };
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await readApi<{ conversationId: string }>(res);
      setNewOpen(false);
      window.location.href = ROUTES.chatThread(data.conversationId);
    } catch (error) {
      onError(error instanceof Error ? error.message : "We couldn't start this conversation.");
    } finally {
      setCreating(false);
    }
  }

  const canCreate =
    newTab === "direct"
      ? /^[A-Z0-9]{4}$/.test(peerId.trim())
      : newTab === "group"
        ? groupId !== ""
        : linkId !== "";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <div className="flex-1">
          <TextField
            label="Search conversations and messages"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="People, groups, providers, messages…"
          />
        </div>
        {!compact ? (
          <div className="flex items-end">
            <Button size="sm" icon="plus" onClick={openNew}>
              New
            </Button>
          </div>
        ) : null}
      </div>

      {query.trim().length >= 2 ? (
        <div className="rounded-md border border-neutral-200 bg-white p-3">
          {searching || results === null ? (
            <p className="text-sm text-neutral-600">Searching…</p>
          ) : results.conversations.length === 0 && results.messages.length === 0 ? (
            <p className="text-sm text-neutral-600">No matches in your conversations.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {results.conversations.length > 0 ? (
                <div>
                  <p className="mb-1 text-xs font-semibold tracking-wide text-neutral-600 uppercase">Conversations</p>
                  <ul className="flex flex-col gap-1">
                    {results.conversations.map((c) => (
                      <li key={c.id}>
                        <Link href={ROUTES.chatThread(c.id)} className="text-sm font-medium text-brand-700 hover:underline">
                          {c.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {results.messages.length > 0 ? (
                <div>
                  <p className="mb-1 text-xs font-semibold tracking-wide text-neutral-600 uppercase">Messages</p>
                  <ul className="flex flex-col gap-1">
                    {results.messages.map((m) => (
                      <li key={m.id} className="text-sm">
                        <Link href={`${ROUTES.chatThread(m.conversationId)}#msg-${m.id}`} className="hover:underline">
                          <span className="text-neutral-600">{m.senderName ?? "Member"}: </span>
                          <span className="text-black">{m.preview}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          )}
        </div>
      ) : null}

      <div role="tablist" aria-label="Conversation filters" className="flex flex-wrap gap-1">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            role="tab"
            aria-selected={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              filter === f.id
                ? "border-brand-600 bg-brand-600 text-white"
                : "border-neutral-300 bg-white text-black hover:border-black"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {items === null ? (
        <p className="text-sm text-neutral-600">Loading conversations…</p>
      ) : items.length === 0 ? (
        <EmptyState
          icon="message"
          title={filter === "all" ? "No conversations" : `Nothing under ${filter}`}
          message="Start a conversation with an accepted connection, or from one of your groups."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((c) => (
            <li key={c.id} className={`rounded-md border p-3 ${activeId === c.id ? "border-brand-600 bg-brand-50/50" : "border-neutral-200 bg-white"}`}>
              <div className="flex items-center gap-2">
                <Link href={ROUTES.chatThread(c.id)} className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-black">
                    {c.pinned ? <span className="mr-1 text-xs font-semibold text-brand-700">Pinned</span> : null}
                    {c.title}
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-neutral-600">
                    <span className="capitalize">{categoryLabel(c)}</span>
                    {c.hasProject ? <span>· Project</span> : null}
                    {c.muted ? <span>· Muted</span> : null}
                    <span>·</span>
                    <span className="font-mono">{new Date(c.updatedAt).toLocaleString("en-US")}</span>
                  </span>
                  <span className="block truncate text-sm text-neutral-600">
                    {c.lastMessage ? c.lastMessage.preview : "No messages yet"}
                  </span>
                </Link>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  {c.unread > 0 ? <Badge tone="info">{c.unread} unread</Badge> : null}
                  <RowMenu item={c} onChanged={load} onError={onError} />
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {newOpen ? (
        <Modal title="New conversation" onClose={() => setNewOpen(false)}>
          <div className="mb-3 flex gap-1 border-b border-neutral-200">
            {(["direct", "group", "provider"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setNewTab(t)}
                className={`px-3 py-2 text-sm font-medium capitalize ${newTab === t ? "border-b-2 border-brand-600 text-brand-700" : "text-black"}`}
              >
                {t}
              </button>
            ))}
          </div>
          {newTab === "direct" ? (
            <TextField label="Connection identifier" value={peerId} onChange={(e) => setPeerId(e.target.value.toUpperCase())} placeholder="A2WD" maxLength={4} hint="They must be an accepted connection." />
          ) : newTab === "group" ? (
            <SelectField
              label="Group"
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              options={[{ value: "", label: groups.length > 0 ? "Choose a group" : "No groups yet" }, ...groups.map((g) => ({ value: g.id, label: g.name }))]}
            />
          ) : (
            <SelectField
              label="Approved provider connection"
              value={linkId}
              onChange={(e) => setLinkId(e.target.value)}
              options={[{ value: "", label: links.length > 0 ? "Choose a connection" : "No approved connections" }, ...links.map((l) => ({ value: l.id, label: l.label }))]}
              hint="Request provider connections from the Conneckt page."
            />
          )}
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setNewOpen(false)}>
              Cancel
            </Button>
            <Button loading={creating} disabled={!canCreate} onClick={create}>
              Start
            </Button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
