"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { LoadError, SkeletonList } from "@/components/ui/Feedback";
import { Button } from "@/components/ui/Button";
import { ErrorDialog } from "@/components/ui/Modal";
import { useSocket } from "@/components/realtime/SocketProvider";
import { useCall } from "@/components/calls/CallProvider";

interface ChatMessage {
  id: string;
  body: string;
  senderId: string;
  senderName: string;
  senderShortId: string;
  clientMessageId: string | null;
  createdAt: string;
}

interface CallHistoryRow {
  id: string;
  kind: string;
  status: string;
  callerId: string;
  callerName: string;
  createdAt: string;
}

export function ChatThreadPage({ conversationId, myUserId }: { conversationId: string; myUserId: string }) {
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [title, setTitle] = useState("Conversation");
  const [convType, setConvType] = useState("direct");
  const [peerName, setPeerName] = useState("Conversation");
  const [hasMore, setHasMore] = useState(false);
  const [before, setBefore] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [callHistory, setCallHistory] = useState<CallHistoryRow[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { joinRoom, leaveRoom, onEvent } = useSocket();
  const { startCall, inCall } = useCall();

  const loadPage = useCallback(
    async (cursor?: string | null, append = false) => {
      const url = `/api/chat/${encodeURIComponent(conversationId)}/messages${cursor ? `?before=${encodeURIComponent(cursor)}` : ""}`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error();
      const body = (await res.json()) as {
        ok: boolean;
        data?: {
          conversation: { title: string | null; type: string };
          members: Array<{ userId: string; name: string }>;
          messages: ChatMessage[];
          hasMore: boolean;
          nextBefore: string | null;
        };
      };
      if (!body.ok || !body.data) throw new Error();
      const others = body.data.members.filter((m) => m.userId !== myUserId).map((m) => m.name);
      setTitle(body.data.conversation.title ?? (others.length ? others.join(", ") : "Conversation"));
      setConvType(body.data.conversation.type);
      setPeerName(others.length === 1 ? others[0] : "Conversation");
      setHasMore(body.data.hasMore);
      setBefore(body.data.nextBefore);
      setMessages((prev) => {
        const incoming = body.data!.messages;
        if (!append || !prev) return incoming;
        const ids = new Set(prev.map((m) => m.id));
        return [...incoming.filter((m) => !ids.has(m.id)), ...prev];
      });
    },
    [conversationId, myUserId],
  );

  const initialLoad = useCallback(async () => {
    setFailed(false);
    try {
      await loadPage(null, false);
      await fetch(`/api/chat/${encodeURIComponent(conversationId)}/messages`, { method: "PATCH" });
      window.dispatchEvent(new Event("tix:counts"));
    } catch {
      setFailed(true);
    }
  }, [loadPage, conversationId]);

  const loadCalls = useCallback(async () => {
    try {
      const res = await fetch(`/api/calls?conversationId=${encodeURIComponent(conversationId)}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const body = (await res.json()) as { ok: boolean; data?: { calls: CallHistoryRow[] } };
      if (body.ok && body.data) setCallHistory(body.data.calls);
    } catch {
      /* call history is secondary; messages still render */
    }
  }, [conversationId]);

  useEffect(() => {
    initialLoad();
    loadCalls();
    const onCallsChanged = () => loadCalls();
    window.addEventListener("tix:calls", onCallsChanged);
    return () => window.removeEventListener("tix:calls", onCallsChanged);
  }, [initialLoad, loadCalls]);

  // Realtime join + polling fallback for failure recovery.
  useEffect(() => {
    let active = true;
    joinRoom(`conversation:${conversationId}`).then((ok) => {
      if (active) setLive(ok);
    });
    const poll = setInterval(() => {
      if (!active) return;
      loadPage(null, false).catch(() => {});
    }, 12000);
    const off = onEvent("message:new", (payload) => {
      const msg = payload as { conversationId?: string } & Partial<ChatMessage>;
      if (msg.conversationId !== conversationId || !msg.id) return;
      setMessages((prev) => {
        if (!prev) return prev;
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [
          ...prev,
          {
            id: String(msg.id),
            body: String(msg.body ?? ""),
            senderId: String(msg.senderId ?? ""),
            senderName: String(msg.senderName ?? ""),
            senderShortId: "",
            clientMessageId: null,
            createdAt: String((msg as { createdAt?: string }).createdAt ?? new Date().toISOString()),
          },
        ];
      });
      fetch(`/api/chat/${encodeURIComponent(conversationId)}/messages`, { method: "PATCH" }).catch(() => {});
    });
    return () => {
      active = false;
      clearInterval(poll);
      off();
      leaveRoom(`conversation:${conversationId}`);
    };
  }, [conversationId, joinRoom, leaveRoom, onEvent, loadPage]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages?.length]);

  async function send() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    const clientMessageId = crypto.randomUUID();
    try {
      const res = await fetch(`/api/chat/${encodeURIComponent(conversationId)}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text, clientMessageId }),
      });
      const body = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !body.ok) {
        setError(body.error ?? "We couldn't send your message. Your text is still available. Please try again.");
        return;
      }
      setDraft("");
      // Authoritative refresh (the realtime event will also arrive).
      await loadPage(null, false);
    } catch {
      setError("Your connection was interrupted. Your text is still available. Please try again.");
    } finally {
      setSending(false);
    }
  }

  if (failed) {
    return (
      <>
        <PageHeader title="Chat" />
        <LoadError onRetry={initialLoad} />
      </>
    );
  }
  if (!messages) {
    return (
      <>
        <PageHeader title="Chat" />
        <SkeletonList rows={4} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={title}
        description={live ? "Live — new messages appear automatically." : "Updating every few seconds."}
        actions={
          convType === "direct" ? (
            <>
              <Button
                size="sm"
                variant="secondary"
                icon="phone"
                disabled={inCall}
                title="Voice call — uses your microphone"
                onClick={() => startCall(conversationId, "audio", peerName)}
              >
                Call
              </Button>
              <Button
                size="sm"
                variant="secondary"
                icon="camera"
                disabled={inCall}
                title="Video call — uses your camera and microphone"
                onClick={() => startCall(conversationId, "video", peerName)}
              >
                Video
              </Button>
            </>
          ) : (
            <span
              title="Calls work one-to-one. Group calls aren't supported yet."
              className="inline-flex cursor-not-allowed items-center gap-2 rounded-md border border-neutral-200 px-3 py-1.5 text-sm text-neutral-500"
            >
              1:1 calls only
            </span>
          )
        }
      />
      <div className="flex flex-col gap-3">
        {callHistory.filter((c) => c.status === "missed" || c.status === "declined").length > 0 ? (
          <ul className="flex flex-col gap-1" aria-label="Recent calls">
            {callHistory
              .filter((c) => c.status === "missed" || c.status === "declined")
              .slice(0, 3)
              .map((c) => (
                <li key={c.id} className="text-xs text-neutral-600">
                  {c.status === "missed" ? "Missed" : "Declined"} {c.kind} call
                  {c.callerId === myUserId ? " (you called)" : ` from ${c.callerName}`} ·{" "}
                  <span className="font-mono">{new Date(c.createdAt).toLocaleString()}</span>
                </li>
              ))}
          </ul>
        ) : null}
        {hasMore ? (
          <div className="flex justify-center">
            <Button variant="secondary" size="sm" onClick={() => loadPage(before, true).catch(() => setError("We couldn't load older messages. Please try again."))}>
              Load older messages
            </Button>
          </div>
        ) : null}
        <ul className="flex max-h-[55vh] flex-col gap-2 overflow-y-auto rounded-lg border border-neutral-200 bg-white p-3" aria-live="polite">
          {messages.length === 0 ? (
            <li className="py-8 text-center text-sm text-neutral-600">No messages yet. Say hello below.</li>
          ) : (
            messages.map((m) => {
              const mine = m.senderId === myUserId;
              return (
                <li key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] rounded-lg border px-3 py-2 ${mine ? "border-brand-200 bg-brand-50" : "border-neutral-200 bg-white"}`}>
                    {!mine ? <p className="text-xs font-medium text-neutral-600">{m.senderName}</p> : null}
                    <p className="whitespace-pre-wrap text-sm text-black">{m.body}</p>
                    <p className="mt-1 font-mono text-[11px] text-neutral-500">
                      {new Date(m.createdAt).toLocaleString()}
                    </p>
                  </div>
                </li>
              );
            })
          )}
          <div ref={bottomRef} />
        </ul>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <label htmlFor="chat-draft" className="sr-only">
            Message
          </label>
          <input
            id="chat-draft"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Write a message…"
            maxLength={8000}
            className="flex-1 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-black focus:border-brand-600 focus:outline-none"
          />
          <Button type="submit" icon="send" loading={sending} disabled={!draft.trim()}>
            Send
          </Button>
        </form>
      </div>
      {error ? <ErrorDialog message={error} onClose={() => setError(null)} onRetry={() => { setError(null); send(); }} /> : null}
    </>
  );
}
