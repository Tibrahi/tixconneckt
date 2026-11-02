"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { convertToTranscribableWav } from "@/lib/audio-convert";
import { ROUTES } from "@/lib/routes";
import { DynamicValue } from "@/components/dynamic/DynamicValue";
import { Button, IconButton } from "@/components/ui/Button";
import { LoadError, SkeletonList } from "@/components/ui/Feedback";
import { SelectField, TextField } from "@/components/ui/Fields";
import { Modal } from "@/components/ui/Modal";
import { Icon } from "@/components/ui/Icon";
import { CallButtons } from "@/components/calls/CallProvider";
import { useAbly } from "@/components/realtime/AblyProvider";
import { useChat, useTyping, useTypingPublisher } from "@/hooks/use-chat";
import { CallHistory } from "./CallHistory";
import { Composer } from "./Composer";
import { DetailsPanel } from "./DetailsPanel";
import { MessageBubble } from "./MessageBubble";
import { groupByDay, readApi, type ChatMessage, type ConversationItem, type ThreadData } from "./types";

/**
 * Full conversation view: identified header, day-grouped history with an
 * unread marker, optimistic sending, live updates with polling fallback,
 * typing and presence, in-conversation search, and the details panel.
 */
export function ThreadView({
  conversationId,
  myUserId,
  myUserName,
  onError,
}: {
  conversationId: string;
  myUserId: string;
  myUserName: string;
  onError: (m: string) => void;
}) {
  const [data, setData] = useState<ThreadData | null>(null);
  const [failed, setFailed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [pending, setPending] = useState<ChatMessage[]>([]);
  const [deliveredIds, setDeliveredIds] = useState<Set<string>>(new Set());
  const [presence, setPresence] = useState<{ available: boolean; online: Record<string, boolean> }>({
    available: false,
    online: {},
  });
  const [showBottom, setShowBottom] = useState(false);
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
  const [tab, setTab] = useState<"messages" | "calls">("messages");
  const [moreOpen, setMoreOpen] = useState(false);

  const { onEvent, connected, realtimeAvailable } = useAbly();
  useChat(conversationId);
  const typingNames = useTyping(conversationId, myUserId);
  const { publishTyping, publishStopped } = useTypingPublisher(conversationId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [initialRead, setInitialRead] = useState<string | null | undefined>(undefined);
  const firstLoadRef = useRef(true);
  const deliveredBeaconed = useRef(new Set<string>());
  const [mountTime] = useState(() => Date.now());

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
        // Drop optimistic bubbles the server has acknowledged, and confirm
        // device delivery for messages that arrived since mount or were still
        // unread — already-read history needs no beacon.
        const serverIds = new Set(next.messages.map((m) => m.clientMessageId).filter(Boolean));
        setPending((prev) => prev.filter((p) => p.clientMessageId && !serverIds.has(p.clientMessageId)));
        const lastReadAt = next.myLastReadAt ? new Date(next.myLastReadAt).getTime() : 0;
        const beaconAfter = Math.max(mountTime, lastReadAt);
        for (const m of next.messages) {
          if (
            m.senderId &&
            m.senderId !== myUserId &&
            !deliveredBeaconed.current.has(m.id) &&
            new Date(m.createdAt).getTime() > beaconAfter
          ) {
            deliveredBeaconed.current.add(m.id);
            fetch(`/api/chat/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(m.id)}/delivered`, {
              method: "POST",
            }).catch(() => {});
          }
        }
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
    [conversationId, markRead, mountTime, myUserId, nearBottom, scrollToBottom],
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
      onEvent("message:edit", (p) => {
        const e = p as { id: string; body: string };
        setData((prev) =>
          prev
            ? { ...prev, messages: prev.messages.map((m) => (m.id === e.id ? { ...m, body: e.body, editedAt: new Date().toISOString() } : m)) }
            : prev,
        );
      }),
      onEvent("message:delete", (p) => {
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
      onEvent("message:reaction", (p) => {
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
      onEvent("message:delivered", (p) => {
        const e = p as { id?: string; conversationId?: string; userId?: string };
        if (e.conversationId !== conversationId || !e.id || e.userId === myUserId) return;
        setDeliveredIds((prev) => new Set(prev).add(e.id as string));
      }),
      onEvent("presence:update", (p) => {
        const e = p as { userId?: string; online?: boolean };
        if (!e.userId || typeof e.online !== "boolean") return;
        setPresence((prev) => ({ available: true, online: { ...prev.online, [e.userId as string]: e.online as boolean } }));
      }),
    ];
    return () => offs.forEach((off) => off());
  }, [conversationId, myUserId, load, onEvent]);

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

  // Track scroll position for the scroll-to-bottom action.
  const threadLoaded = data !== null;
  useEffect(() => {
    if (!threadLoaded) return;
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      setShowBottom(el.scrollHeight - el.scrollTop - el.clientHeight > 320);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [threadLoaded]);

  /** Append an optimistic bubble; reconciled against the server by clientMessageId. */
  const handleSending = useCallback(
    (draft: { clientMessageId: string; body: string; replyTo: ChatMessage | null }) => {
      const optimistic: ChatMessage = {
        id: `pending:${draft.clientMessageId}`,
        kind: "user",
        body: draft.body,
        senderId: myUserId,
        senderName: myUserName,
        senderShortId: null,
        clientMessageId: draft.clientMessageId,
        createdAt: new Date().toISOString(),
        editedAt: null,
        deleted: false,
        reply: draft.replyTo
          ? { id: draft.replyTo.id, body: draft.replyTo.body.slice(0, 200), senderName: draft.replyTo.senderName }
          : null,
        metadata: {},
        attachment: null,
        reactions: [],
        read: false,
        readCount: null,
      };
      setPending((prev) => [...prev, optimistic]);
      requestAnimationFrame(() => {
        const el = scrollRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      });
    },
    [myUserId, myUserName],
  );

  const handleSendFailed = useCallback((clientMessageId: string) => {
    setPending((prev) => prev.filter((p) => p.clientMessageId !== clientMessageId));
  }, []);

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
    if (!m.attachment) {
      onError("Only voice notes can be transcribed.");
      return;
    }
    setAnalyzingId(m.id);
    try {
      // Convert in-browser to transcribable WAV so stored WebM/MP4 notes
      // transcribe without server-side ffmpeg.
      const urlRes = await fetch(`/api/documents/${encodeURIComponent(m.attachment.id)}/url`);
      const { url } = await readApi<{ url: string }>(urlRes);
      const audioRes = await fetch(url);
      if (!audioRes.ok) throw new Error("The voice note couldn't be loaded. Retry to try again.");
      const { wav } = await convertToTranscribableWav(await audioRes.blob());
      const form = new FormData();
      form.append("audio", wav, "note.wav");
      const res = await fetch(
        `/api/chat/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(m.id)}/analyze`,
        { method: "PUT", body: form },
      );
      const data = await readApi<{ transcript: string }>(res);
      setTranscripts((prev) => ({ ...prev, [m.id]: data.transcript }));
      setComposerSeed({ text: data.transcript, nonce: Date.now() });
    } catch (error) {
      onError(error instanceof Error ? error.message : "Transcription failed. You can retry safely.");
    } finally {
      setAnalyzingId(null);
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
  const newMarkerId =
    initialRead === undefined
      ? null
      : (data.messages.find(
          (m) =>
            m.kind === "user" &&
            m.senderId !== myUserId &&
            (initialRead === null || new Date(m.createdAt).getTime() > new Date(initialRead).getTime()),
        )?.id ?? null);
  const showing = searchResults ?? [...data.messages, ...pending];
  const groups = groupByDay(showing);
  const peerInitial = (others[0]?.name ?? title).trim().charAt(0).toUpperCase() || "?";

  return (
    <div className="flex min-h-0 flex-1">
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-neutral-200 bg-white px-3 py-2 sm:px-4">
          <Link href={ROUTES.chat} aria-label="Back to conversations" title="Back to conversations" className="shrink-0 rounded-md p-2 text-neutral-600 hover:bg-neutral-100 hover:text-black lg:hidden">
            <Icon name="arrow-left" />
          </Link>
          <span
            aria-hidden="true"
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white sm:h-10 sm:w-10 ${data.conversation.type === "group" ? "bg-neutral-700" : "bg-brand-600"}`}
          >
            {data.conversation.type === "group" ? <Icon name="user-group" /> : peerInitial}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-black sm:text-base">
              {title}
              {data.conversation.type === "direct" && others[0]?.shortId ? (
                <span className="ml-2 hidden font-mono text-xs font-normal text-neutral-500 sm:inline">{others[0].shortId}</span>
              ) : null}
            </p>
            <p className="flex items-center gap-1.5 truncate text-xs text-neutral-600">
              {peerOnline !== null ? (
                <span
                  title={peerOnline ? "Online now" : "Offline or unavailable"}
                  aria-label={peerOnline ? "Peer online" : "Peer offline"}
                  className={`inline-block h-2 w-2 shrink-0 rounded-full ${peerOnline ? "bg-blue-600" : "bg-neutral-300"}`}
                />
              ) : null}
              <span className="truncate">
                {peerOnline === true ? "Online" : peerOnline === false ? "Offline" : typeLabel} · {data.members.length} member{data.members.length === 1 ? "" : "s"}
                {data.mySettings.muted ? " · Muted" : ""}
              </span>
            </p>
          </div>
          <span className="hidden shrink-0 items-center gap-1 sm:flex">
            <IconButton label="Search in conversation" icon="search" onClick={() => { setSearchOpen(!searchOpen); setSearchResults(null); setQuery(""); }} />
            <IconButton label="Share a reference" icon="share" onClick={() => setShareOpen(true)} />
            <IconButton label={detailsOpen ? "Hide details" : "Show details"} icon="circle-info" onClick={() => setDetailsOpen(!detailsOpen)} />
          </span>
          <span className="shrink-0 sm:hidden">
            <IconButton label="More conversation actions" icon="ellipsis" onClick={() => setMoreOpen(!moreOpen)} />
          </span>
          <span className="shrink-0">
            <CallButtons
              conversationId={data.conversation.id}
              calleeName={data.conversation.type === "group" ? data.conversation.title ?? "Group" : others[0]?.name ?? "Member"}
            />
          </span>
        </div>
        {moreOpen ? (
          <div className="flex gap-1.5 overflow-x-auto border-b border-neutral-200 bg-white px-3 py-2 sm:hidden" role="group" aria-label="Conversation actions">
            <Button size="sm" variant="secondary" onClick={() => { setMoreOpen(false); setSearchOpen(!searchOpen); setSearchResults(null); setQuery(""); }}>
              Search
            </Button>
            <Button size="sm" variant="secondary" onClick={() => { setMoreOpen(false); setShareOpen(true); }}>
              Share
            </Button>
            <Button size="sm" variant="secondary" onClick={() => { setMoreOpen(false); setDetailsOpen(!detailsOpen); }}>
              {detailsOpen ? "Hide details" : "Details"}
            </Button>
          </div>
        ) : null}

        {!connected ? (
          <p role="status" className="border-b border-blue-200 bg-blue-50 px-4 py-1.5 text-xs text-blue-900">
            {realtimeAvailable === false
              ? "Live updates are unavailable — refreshing automatically."
              : "Reconnecting… new messages will appear automatically."}
          </p>
        ) : null}

        <div role="tablist" aria-label="Conversation sections" className="flex gap-1 border-b border-neutral-200 bg-white px-3 sm:px-4">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "messages"}
              onClick={() => setTab("messages")}
              className={`inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium ${
                tab === "messages" ? "border-brand-600 text-brand-700" : "border-transparent text-black hover:border-neutral-300"
              }`}
            >
              <Icon name="message" /> Messages
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "calls"}
              onClick={() => setTab("calls")}
              className={`inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium ${
                tab === "calls" ? "border-brand-600 text-brand-700" : "border-transparent text-black hover:border-neutral-300"
              }`}
            >
              <Icon name="phone" /> Calls
            </button>
        </div>

        {tab === "calls" ? (
          <div className="min-h-0 flex-1 overflow-y-auto bg-neutral-50 px-3 py-4 sm:px-4">
            <div className="mx-auto w-full max-w-3xl">
              <CallHistory
                conversationId={conversationId}
                myUserId={myUserId}
                peerName={data.conversation.type === "group" ? title : others[0]?.name ?? title}
                onError={onError}
              />
            </div>
          </div>
        ) : (
          <>

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

        <div className="relative flex min-h-0 flex-1 flex-col">
          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto bg-neutral-50 px-3 py-4 sm:px-4">
            <div className="mx-auto flex w-full max-w-3xl flex-col">
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
                        <Fragment key={m.id}>
                          {m.id === newMarkerId && searchResults === null ? (
                            <li aria-hidden="true" className="my-2 border-t border-brand-300 pt-1 text-center text-xs font-medium text-brand-700">
                              New messages
                            </li>
                          ) : null}
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
                            delivered={deliveredIds.has(m.id)}
                            interactive={!m.id.startsWith("pending:")}
                            highlight={m.id === highlightId}
                            onError={onError}
                          />
                        </Fragment>
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </div>
          </div>
          {showBottom ? (
            <button
              type="button"
              onClick={() => {
                setUnseen(0);
                scrollToBottom();
                markRead();
              }}
              aria-label="Scroll to latest messages"
              title="Scroll to latest"
              className="absolute right-4 bottom-4 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-neutral-300 bg-white text-black shadow-md hover:border-black"
            >
              <Icon name="arrow-down" />
            </button>
          ) : null}
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
          <p className="flex items-center gap-2 border-t border-neutral-200 bg-white px-4 py-1.5 text-xs text-neutral-600 italic" role="status">
            <span className="flex gap-0.5" aria-hidden="true">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-neutral-400 [animation-delay:-0.3s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-neutral-400 [animation-delay:-0.15s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-neutral-400" />
            </span>
            {typingNames.join(", ")} {typingNames.length === 1 ? "is" : "are"} typing…
          </p>
        ) : null}

        <Composer
          conversationId={conversationId}
          replyTo={replyTo}
          onClearReply={() => setReplyTo(null)}
          onTyping={publishTyping}
          onSent={() => {
            publishStopped();
            load();
          }}
          onSending={handleSending}
          onSendFailed={handleSendFailed}
          onError={onError}
          seed={composerSeed}
        />
          </>
        )}
      </div>

      {detailsOpen ? (
        <aside className="hidden w-72 shrink-0 overflow-y-auto border-l border-neutral-200 lg:block xl:w-80">
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
            <div className="mx-auto w-full max-w-2xl">
              <DetailsPanel
                conversationId={conversationId}
                peerShortId={data.conversation.type === "direct" ? (others[0]?.shortId ?? null) : null}
                onError={onError}
              />
            </div>
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
