"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ROUTES } from "@/lib/routes";
import { DynamicValue } from "@/components/dynamic/DynamicValue";
import { Button } from "@/components/ui/Button";
import { LoadError, SkeletonList } from "@/components/ui/Feedback";
import { SelectField, TextField } from "@/components/ui/Fields";
import { Modal } from "@/components/ui/Modal";
import { CallButtons } from "@/components/calls/CallProvider";
import { useSocket } from "@/components/realtime/SocketProvider";
import { Composer } from "./Composer";
import { DetailsPanel } from "./DetailsPanel";
import { MessageBubble } from "./MessageBubble";
import { groupByDay, readApi, type ChatMessage, type ConversationItem, type ThreadData } from "./types";

interface TypingEntry {
  name: string;
  expires: number;
}

/**
 * Full conversation view: identified header, day-grouped history with an
 * unread marker, live updates with polling fallback, typing and presence,
 * in-conversation search, and the details panel.
 */
export function ThreadView({
  conversationId,
  myUserId,
  onError,
}: {
  conversationId: string;
  myUserId: string;
  onError: (m: string) => void;
}) {
  const [data, setData] = useState<ThreadData | null>(null);
  const [failed, setFailed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [typing, setTyping] = useState<Record<string, TypingEntry>>({});
  const [presence, setPresence] = useState<{ available: boolean; online: Record<string, boolean> }>({
    available: false,
    online: {},
  });
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ChatMessage[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [unseen, setUnseen] = useState(0);
  const [forwardMsg, setForwardMsg] = useState<ChatMessage | null>(null);
  const [forwardTarget, setForwardTarget] = useState("");
  const [forwardList, setForwardList] = useState<ConversationItem[]>([]);
  const [forwarding, setForwarding] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareType, setShareType] = useState("project");
  const [shareId, setShareId] = useState("");
  const [shareText, setShareText] = useState("");
  const [sharing, setSharing] = useState(false);
  const [analysis, setAnalysis] = useState<{ filename: string; proposed: Record<string, unknown> } | null>(null);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [transcripts, setTranscripts] = useState<Record<string, string>>({});
  const [composerSeed, setComposerSeed] = useState<{ text: string; nonce: number } | null>(null);

  const { onEvent, connected } = useSocket();
  const scrollRef = useRef<HTMLDivElement>(null);
  const typingAt = useRef(0);
  const [initialRead, setInitialRead] = useState<string | null | undefined>(undefined);
  const firstLoadRef = useRef(true);

  const nearBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 160;
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  const markRead = useCallback(async () => {
    try {
      await fetch(`/api/chat/${encodeURIComponent(conversationId)}/messages`, { method: "PATCH" });
    } catch {
      /* read state is best-effort */
    }
  }, [conversationId]);

  const load = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      try {
        const res = await fetch(
          `/api/chat/${encodeURIComponent(conversationId)}/messages?limit=30`,
          { cache: "no-store" },
        );
        const next = await readApi<ThreadData>(res);
        const stick = nearBottom();
        setData((prev) => {
          if (prev && !stick && next.messages.length > prev.messages.length) {
            setUnseen(next.messages.length - prev.messages.length);
          }
          return next;
        });
        if (firstLoadRef.current) {
          setInitialRead(next.myLastReadAt);
          firstLoadRef.current = false;
          await markRead();
          requestAnimationFrame(scrollToBottom);
        } else if (stick && !opts.silent) {
          requestAnimationFrame(scrollToBottom);
          await markRead();
        }
        setFailed(false);
      } catch {
        if (!opts.silent) setFailed(true);
      }
    },
    [conversationId, markRead, nearBottom, scrollToBottom],
  );

  const hasMore = data?.hasMore ?? false;
  const nextBefore = data?.nextBefore ?? null;
  const loadOlder = useCallback(async () => {
    if (!hasMore || !nextBefore || loadingMore) return null;
    setLoadingMore(true);
    try {
      const res = await fetch(
        `/api/chat/${encodeURIComponent(conversationId)}/messages?limit=30&before=${encodeURIComponent(nextBefore)}`,
        { cache: "no-store" },
      );
      const older = await readApi<ThreadData>(res);
      setData((prev) =>
        prev ? { ...prev, messages: [...older.messages, ...prev.messages], hasMore: older.hasMore, nextBefore: older.nextBefore } : prev,
      );
      return older.messages;
    } catch {
      onError("We couldn't load older messages.");
      return null;
    } finally {
      setLoadingMore(false);
    }
  }, [conversationId, hasMore, nextBefore, loadingMore, onError]);

  useEffect(() => {
    load();
    const pollId = connected ? undefined : window.setInterval(() => {
      if (document.visibilityState === "visible") void load({ silent: true });
    }, 10000);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void load({ silent: true });
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      if (pollId !== undefined) window.clearInterval(pollId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [load, connected]);

  useEffect(() => {
    const offs = [
      onEvent("message:new", (p) => {
        if ((p as { conversationId?: string }).conversationId !== conversationId) return;
        load();
      }),
      onEvent("message:edited", (p) => {
        const e = p as { id: string; body: string };
        setData((prev) =>
          prev
            ? { ...prev, messages: prev.messages.map((m) => (m.id === e.id ? { ...m, body: e.body, editedAt: new Date().toISOString() } : m)) }
            : prev,
        );
      }),
      onEvent("message:deleted", (p) => {
        const e = p as { id: string };
        setData((prev) =>
          prev
            ? {
                ...prev,
                messages: prev.messages.map((m) =>
                  m.id === e.id ? { ...m, body: "This message was deleted.", deleted: true, attachment: null, metadata: {} } : m,
                ),
              }
            : prev,
        );
      }),
      onEvent("reaction:changed", (p) => {
        const e = p as { messageId: string; reactions: Array<{ emoji: string; count: number; mine: boolean }> };
        setData((prev) =>
          prev
            ? {
                ...prev,
                messages: prev.messages.map((m) =>
                  m.id === e.messageId
                    ? {
                        ...m,
                        reactions: e.reactions.map((r) => ({
                          emoji: r.emoji,
                          count: r.count,
                          mine: r.mine,
                          names: m.reactions.find((x) => x.emoji === r.emoji)?.names ?? [],
                        })),
                      }
                    : m,
                ),
              }
            : prev,
        );
      }),
      onEvent("message:read", (p) => {
        const e = p as { conversationId?: string; userId?: string };
        if (e.conversationId !== conversationId || e.userId === myUserId) return;
        // A co-member caught up: my messages in a direct chat are now read.
        setData((prev) =>
          prev && prev.conversation.type === "direct"
            ? { ...prev, messages: prev.messages.map((m) => (m.senderId === myUserId && m.read === false ? { ...m, read: true } : m)) }
            : prev,
        );
      }),
      onEvent("typing", (p) => {
        const e = p as { userId?: string; name?: string };
        if (!e.userId || e.userId === myUserId) return;
        setTyping((prev) => ({ ...prev, [e.userId as string]: { name: e.name ?? "Someone", expires: Date.now() + 6000 } }));
      }),
    ];
    return () => offs.forEach((off) => off());
  }, [conversationId, myUserId, load, onEvent]);

  // Expire typing indicators.
  useEffect(() => {
    const id = setInterval(() => {
      setTyping((prev) => {
        const next: Record<string, TypingEntry> = {};
        for (const [k, v] of Object.entries(prev)) {
          if (v.expires > Date.now()) next[k] = v;
        }
        return next;
      });
    }, 2000);
    return () => clearInterval(id);
  }, []);

  const loadPresence = useCallback(async () => {
    try {
      const res = await fetch(`/api/chat/${encodeURIComponent(conversationId)}/presence`, { cache: "no-store" });
      setPresence(await readApi(res));
    } catch {
      setPresence({ available: false, online: {} });
    }
  }, [conversationId]);

  useEffect(() => {
    loadPresence();
    const id = setInterval(loadPresence, 30000);
    return () => clearInterval(id);
  }, [loadPresence, connected]);

  function sendTyping() {
    const now = Date.now();
    if (now - typingAt.current < 4000) return;
    typingAt.current = now;
    fetch(`/api/chat/${encodeURIComponent(conversationId)}/typing`, { method: "POST" }).catch(() => {});
  }

  async function jumpTo(messageId: string) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const el = document.getElementById(`msg-${messageId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        setHighlightId(messageId);
        setTimeout(() => setHighlightId(null), 2500);
        return;
      }
      if (!data?.hasMore) break;
      const older = await loadOlder();
      if (!older || older.length === 0) break;
    }
    onError("That message is too far back. Use search to find it.");
  }

  // Deep link from search results (#msg-<id>).
  useEffect(() => {
    if (!data || !window.location.hash.startsWith("#msg-")) return;
    const target = window.location.hash.replace("#msg-", "");
    jumpTo(target);
    window.history.replaceState(null, "", window.location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data !== null]);

  async function runSearch(q: string) {
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setSearchResults(null);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(
        `/api/chat/${encodeURIComponent(conversationId)}/messages?q=${encodeURIComponent(trimmed)}&limit=30`,
        { cache: "no-store" },
      );
      const found = await readApi<ThreadData>(res);
      setSearchResults(found.messages);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }

  async function toggleReact(m: ChatMessage, emoji: string) {
    try {
      const res = await fetch(
        `/api/chat/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(m.id)}/reactions`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ emoji }) },
      );
      await readApi(res);
    } catch (error) {
      onError(error instanceof Error ? error.message : "We couldn't save that reaction.");
    }
  }

  async function saveEdit(m: ChatMessage) {
    try {
      const res = await fetch(
        `/api/chat/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(m.id)}`,
        { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: m.body }) },
      );
      await readApi(res);
    } catch (error) {
      onError(error instanceof Error ? error.message : "We couldn't save that edit.");
    }
  }

  async function removeMessage(m: ChatMessage, mode: "me" | "everyone") {
    try {
      const res = await fetch(
        `/api/chat/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(m.id)}`,
        { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode }) },
      );
      await readApi(res);
      if (mode === "me") {
        setData((prev) => (prev ? { ...prev, messages: prev.messages.filter((x) => x.id !== m.id) } : prev));
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : "We couldn't delete that message.");
    }
  }

  function shareLink(m: ChatMessage) {
    const url = `${window.location.origin}${ROUTES.chatThread(conversationId)}#msg-${m.id}`;
    navigator.clipboard
      ?.writeText(url)
      .then(() => onError("Link copied — only conversation members can open it."))
      .catch(() => onError("Copying failed in this browser."));
  }

  async function openForward(m: ChatMessage) {
    setForwardMsg(m);
    setForwardTarget("");
    try {
      const res = await fetch("/api/chat?filter=all", { cache: "no-store" });
      const list = await readApi<{ individual: ConversationItem[]; group: ConversationItem[] }>(res);
      setForwardList([...list.individual, ...list.group].filter((c) => c.id !== conversationId));
    } catch {
      setForwardList([]);
    }
  }

  async function doForward() {
    if (!forwardMsg || !forwardTarget) return;
    setForwarding(true);
    try {
      const res = await fetch(`/api/chat/${encodeURIComponent(conversationId)}/forward`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: forwardMsg.id, toConversationId: forwardTarget }),
      });
      await readApi(res);
      setForwardMsg(null);
    } catch (error) {
      onError(error instanceof Error ? error.message : "We couldn't forward that message.");
    } finally {
      setForwarding(false);
    }
  }

  async function doShare() {
    if (!shareId.trim()) {
      onError("Enter the project, profile, or request identifier.");
      return;
    }
    setSharing(true);
    try {
      const res = await fetch(`/api/chat/${encodeURIComponent(conversationId)}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: shareText.trim(),
          clientMessageId: crypto.randomUUID(),
          reference: { type: shareType, id: shareId.trim() },
        }),
      });
      await readApi(res);
      setShareOpen(false);
      setShareId("");
      setShareText("");
      load();
    } catch (error) {
      onError(error instanceof Error ? error.message : "We couldn't share that reference.");
    } finally {
      setSharing(false);
    }
  }

  async function analyzeMessage(m: ChatMessage) {
    setAnalyzingId(m.id);
    try {
      const res = await fetch(
        `/api/chat/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(m.id)}/analyze`,
        { method: "POST" },
      );
      const job = await readApi<{ jobId: string }>(res);
      const run = await fetch(`/api/documents/jobs/${encodeURIComponent(job.jobId)}`, { method: "POST" });
      const data = await readApi<{ pending?: boolean; pendingReason?: string; proposed?: Record<string, unknown> }>(run);
      if (data.pending || !data.proposed) {
        onError(data.pendingReason ?? "Analysis produced no result.");
        return;
      }
      setAnalysis({ filename: m.attachment?.filename ?? "attachment", proposed: data.proposed });
    } catch (error) {
      onError(error instanceof Error ? error.message : "Analysis failed. You can retry safely.");
    } finally {
      setAnalyzingId(null);
    }
  }

  async function shareAnalysis() {
    if (!analysis) return;
    try {
      const res = await fetch(`/api/chat/${encodeURIComponent(conversationId)}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: `Shared analysis of ${analysis.filename}.`,
          clientMessageId: crypto.randomUUID(),
          analysis: analysis.proposed,
        }),
      });
      await readApi(res);
      setAnalysis(null);
      load();
    } catch (error) {
      onError(error instanceof Error ? error.message : "We couldn't share that analysis.");
    }
  }

  async function transcribeMessage(m: ChatMessage) {
    try {
      const res = await fetch(
        `/api/chat/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(m.id)}/analyze`,
        { method: "PUT" },
      );
      const data = await readApi<{ transcript: string }>(res);
      setTranscripts((prev) => ({ ...prev, [m.id]: data.transcript }));
      setComposerSeed({ text: data.transcript, nonce: Date.now() });
    } catch (error) {
      onError(error instanceof Error ? error.message : "Transcription failed. You can retry safely.");
    }
  }

  if (failed) {
    return (
      <div className="p-4">
        <LoadError onRetry={() => load()} />
      </div>
    );
  }
  if (!data) {
    return (
      <div className="p-4">
        <SkeletonList rows={5} />
      </div>
    );
  }

  const others = data.members.filter((m) => m.userId !== myUserId);
  const title =
    data.conversation.title ??
    (data.conversation.type === "direct"
      ? (others[0]?.name ?? "Conversation")
      : others.length > 0
        ? others.map((o) => o.name).slice(0, 3).join(", ")
        : "Group conversation");
  const typeLabel =
    data.conversation.type === "direct" ? "Individual" : data.conversation.type === "provider" ? "Provider" : "Group";
  const peerOnline =
    data.conversation.type === "direct" && others.length === 1
      ? presence.available
        ? (presence.online[others[0].userId] ?? false)
        : null
      : null;
  const typingNames = Object.values(typing).map((t) => t.name);
  const newMarkerId =
    initialRead === undefined
      ? null
      : (data.messages.find(
          (m) =>
            m.kind === "user" &&
            m.senderId !== myUserId &&
            (initialRead === null || new Date(m.createdAt).getTime() > new Date(initialRead).getTime()),
        )?.id ?? null);
  const showing = searchResults ?? data.messages;
  const groups = groupByDay(showing);

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b border-neutral-200 bg-white px-4 py-2.5">
          <Link href={ROUTES.chat} aria-label="Back to conversations" className="rounded-md px-2 py-1 text-neutral-600 hover:bg-neutral-100 lg:hidden">
            ←
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-black">
              {title}
              {data.conversation.type === "direct" && others[0]?.shortId ? (
                <span className="ml-2 font-mono text-xs font-normal text-neutral-500">{others[0].shortId}</span>
              ) : null}
            </p>
            <p className="text-xs text-neutral-600">
              {typeLabel} · {data.members.length} member{data.members.length === 1 ? "" : "s"}
              {peerOnline === true ? " · Online" : ""}
              {data.mySettings.muted ? " · Muted" : ""}
            </p>
          </div>
          {peerOnline !== null ? (
            <span
              title={peerOnline ? "Online now" : "Offline or unavailable"}
              aria-label={peerOnline ? "Peer online" : "Peer offline"}
              className={`h-2.5 w-2.5 rounded-full ${peerOnline ? "bg-green-600" : "bg-neutral-300"}`}
            />
          ) : null}
          <Button size="sm" variant="secondary" onClick={() => { setSearchOpen(!searchOpen); setSearchResults(null); setQuery(""); }}>
            Search
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setShareOpen(true)}>
            Share
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setDetailsOpen(!detailsOpen)}>
            {detailsOpen ? "Hide details" : "Details"}
          </Button>
          {data.conversation.type !== "group" ? (
            <CallButtons conversationId={data.conversation.id} calleeName={others[0]?.name ?? "Member"} />
          ) : (
            <span className="text-xs text-neutral-500">Calls are 1:1 only</span>
          )}
        </div>

        {searchOpen ? (
          <div className="flex gap-2 border-b border-neutral-200 bg-white px-4 py-2">
            <div className="flex-1">
              <TextField label="Search this conversation" value={query} onChange={(e) => { setQuery(e.target.value); runSearch(e.target.value); }} placeholder="At least 2 characters" />
            </div>
            {searchResults !== null ? (
              <div className="flex items-end">
                <Button size="sm" variant="secondary" onClick={() => { setSearchResults(null); setQuery(""); }}>
                  Clear ({searchResults.length})
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto bg-neutral-50 px-4 py-4">
          {searchResults === null && data.hasMore ? (
            <div className="mb-3 flex justify-center">
              <Button size="sm" variant="secondary" loading={loadingMore} onClick={() => loadOlder()}>
                Load older messages
              </Button>
            </div>
          ) : null}
          {searching ? (
            <p className="text-center text-sm text-neutral-600">Searching…</p>
          ) : showing.length === 0 ? (
            <p className="text-center text-sm text-neutral-600">
              {searchResults !== null ? "No matches in this conversation." : "No messages yet. Say hello."}
            </p>
          ) : (
            groups.map((g) => (
              <div key={g.day}>
                <p className="my-3 text-center text-xs font-medium text-neutral-500">{g.day}</p>
                <ul className="flex flex-col gap-2">
                  {g.items.map((m) => (
                    <div key={m.id}>
                      {m.id === newMarkerId && searchResults === null ? (
                        <p className="my-2 border-t border-brand-300 pt-1 text-center text-xs font-medium text-brand-700">
                          New messages
                        </p>
                      ) : null}
                      <div className={m.id === highlightId ? "rounded-lg ring-2 ring-brand-500" : ""}>
                        <MessageBubble
                          message={m}
                          mine={m.senderId === myUserId}
                          canModerate={data.myRole === "admin"}
                          onReply={(msg) => setReplyTo(msg)}
                          onReact={toggleReact}
                          onEdit={saveEdit}
                          onDelete={removeMessage}
                          onForward={openForward}
                          onShareLink={shareLink}
                          onJump={jumpTo}
                          onAnalyze={analyzeMessage}
                          onTranscribe={transcribeMessage}
                          analyzing={analyzingId === m.id}
                          transcript={transcripts[m.id] ?? null}
                          onError={onError}
                        />
                      </div>
                    </div>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>

        {unseen > 0 ? (
          <button
            type="button"
            onClick={() => {
              setUnseen(0);
              scrollToBottom();
              markRead();
            }}
            className="border-t border-neutral-200 bg-white px-4 py-1.5 text-center text-xs font-medium text-brand-700 hover:underline"
          >
            {unseen} new message{unseen === 1 ? "" : "s"} — jump to latest
          </button>
        ) : null}
        {typingNames.length > 0 ? (
          <p className="border-t border-neutral-200 bg-white px-4 py-1 text-xs text-neutral-600 italic">
            {typingNames.join(", ")} {typingNames.length === 1 ? "is" : "are"} typing…
          </p>
        ) : null}

        <Composer
          conversationId={conversationId}
          replyTo={replyTo}
          onClearReply={() => setReplyTo(null)}
          onTyping={sendTyping}
          onSent={load}
          onError={onError}
          seed={composerSeed}
        />
      </div>

      {detailsOpen ? (
        <aside className="hidden w-80 shrink-0 overflow-y-auto border-l border-neutral-200 lg:block">
          <DetailsPanel
            conversationId={conversationId}
            peerShortId={data.conversation.type === "direct" ? (others[0]?.shortId ?? null) : null}
            onError={onError}
          />
        </aside>
      ) : null}
      {detailsOpen ? (
        <div className="fixed inset-0 z-30 bg-white lg:hidden">
          <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-2">
            <p className="font-semibold">Details</p>
            <Button size="sm" variant="secondary" onClick={() => setDetailsOpen(false)}>
              Close
            </Button>
          </div>
          <div className="h-full overflow-y-auto pb-16">
            <DetailsPanel
              conversationId={conversationId}
              peerShortId={data.conversation.type === "direct" ? (others[0]?.shortId ?? null) : null}
              onError={onError}
            />
          </div>
        </div>
      ) : null}

      {forwardMsg ? (
        <Modal title="Forward message" onClose={() => setForwardMsg(null)}>
          <SelectField
            label="To conversation"
            value={forwardTarget}
            onChange={(e) => setForwardTarget(e.target.value)}
            options={[
              { value: "", label: forwardList.length > 0 ? "Choose a conversation" : "No other conversations" },
              ...forwardList.map((c) => ({ value: c.id, label: c.title })),
            ]}
          />
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setForwardMsg(null)}>
              Cancel
            </Button>
            <Button loading={forwarding} disabled={!forwardTarget} onClick={doForward}>
              Forward
            </Button>
          </div>
        </Modal>
      ) : null}

      {shareOpen ? (
        <Modal title="Share a reference" onClose={() => setShareOpen(false)}>
          <div className="flex flex-col gap-3">
            <SelectField
              label="Type"
              value={shareType}
              onChange={(e) => setShareType(e.target.value)}
              options={[
                { value: "project", label: "Project" },
                { value: "profile", label: "Profile (user id)" },
                { value: "request", label: "Funding request" },
              ]}
            />
            <TextField label="Identifier" value={shareId} onChange={(e) => setShareId(e.target.value)} placeholder="Paste the id — pick from Details if unsure" />
            <TextField label="Message (optional)" value={shareText} onChange={(e) => setShareText(e.target.value)} placeholder="Why are you sharing this?" />
            <p className="text-xs text-neutral-600">
              Members see the title and a link. Full content stays behind its own access rules.
            </p>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShareOpen(false)}>
              Cancel
            </Button>
            <Button loading={sharing} disabled={!shareId.trim()} onClick={doShare}>
              Share
            </Button>
          </div>
        </Modal>
      ) : null}

      {analysis ? (
        <Modal title={`Analysis: ${analysis.filename}`} onClose={() => setAnalysis(null)}>
          <div className="max-h-96 overflow-auto">
            <DynamicValue doc={analysis.proposed} />
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAnalysis(null)}>
              Close
            </Button>
            <Button onClick={shareAnalysis}>
              Share to conversation
            </Button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
