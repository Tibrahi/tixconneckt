"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAbly } from "@/components/realtime/AblyProvider";
import { conversationChannel } from "@/lib/ably/events";
import { useAblyChannel } from "./use-ably";

/**
 * Conversation-scoped realtime: joins the conversation channel while
 * mounted and exposes live connection state for the thread view.
 */
export function useChat(conversationId: string): { live: boolean } {
  const { connected } = useAbly();
  useAblyChannel(conversationChannel(conversationId));
  return { live: connected };
}

interface TypingPresence {
  name: string;
  expires: number;
}

/**
 * Typing indicators for a conversation: tracks typing:start/stop events
 * from other members and expires stale entries. Returns the display names
 * of members currently typing.
 */
export function useTyping(conversationId: string, myUserId: string): string[] {
  const { onEvent } = useAbly();
  const [typing, setTyping] = useState<Record<string, TypingPresence>>({});

  useEffect(() => {
    const offs = [
      onEvent("typing:start", (payload) => {
        const e = payload as { conversationId?: string; userId?: string; name?: string };
        if (e.conversationId !== conversationId || !e.userId || e.userId === myUserId) return;
        setTyping((prev) => ({
          ...prev,
          [e.userId as string]: { name: e.name ?? "Someone", expires: Date.now() + 8000 },
        }));
      }),
      onEvent("typing:stop", (payload) => {
        const e = payload as { conversationId?: string; userId?: string };
        if (e.conversationId !== conversationId || !e.userId) return;
        setTyping((prev) => {
          if (!prev[e.userId as string]) return prev;
          const next = { ...prev };
          delete next[e.userId as string];
          return next;
        });
      }),
    ];
    return () => offs.forEach((off) => off());
  }, [conversationId, myUserId, onEvent]);

  useEffect(() => {
    const id = setInterval(() => {
      setTyping((prev) => {
        const next: Record<string, TypingPresence> = {};
        for (const [k, v] of Object.entries(prev)) {
          if (v.expires > Date.now()) next[k] = v;
        }
        return Object.keys(next).length === Object.keys(prev).length ? prev : next;
      });
    }, 2000);
    return () => clearInterval(id);
  }, []);

  return Object.values(typing).map((t) => t.name);
}

/**
 * Throttled typing publisher: emits typing:start at most every 4s while
 * the user types and typing:stop when they pause, send, or leave.
 */
export function useTypingPublisher(conversationId: string): {
  publishTyping: () => void;
  publishStopped: () => void;
} {
  const lastStart = useRef(0);
  const startedRef = useRef(false);

  const publishTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastStart.current < 4000) return;
    lastStart.current = now;
    startedRef.current = true;
    fetch(`/api/chat/${encodeURIComponent(conversationId)}/typing`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state: "start" }),
    }).catch(() => {});
  }, [conversationId]);

  const publishStopped = useCallback(() => {
    if (!startedRef.current) return;
    startedRef.current = false;
    fetch(`/api/chat/${encodeURIComponent(conversationId)}/typing`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state: "stop" }),
    }).catch(() => {});
  }, [conversationId]);

  useEffect(() => {
    return () => {
      if (startedRef.current) {
        startedRef.current = false;
        fetch(`/api/chat/${encodeURIComponent(conversationId)}/typing`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ state: "stop" }),
        }).catch(() => {});
      }
    };
  }, [conversationId]);

  return { publishTyping, publishStopped };
}
