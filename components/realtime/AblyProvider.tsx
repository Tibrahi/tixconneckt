"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { PRESENCE_CHANNEL, normalizeChannel, userChannel } from "@/lib/ably/events";
import { getAbly } from "@/lib/ably/client";

/**
 * Central Ably realtime provider — the ONLY managed realtime client.
 *
 * - Authenticates with short-lived tokens from /api/ably/token.
 * - Auto-subscribes the user's personal channel + the presence channel.
 * - Conversation/group channels join on demand via joinRoom().
 * - Every channel event fans out to onEvent() handlers by event name.
 * - When Ably is unconfigured or unreachable, consumers keep working
 *   through API polling (connected=false, realtimeAvailable=false).
 */

interface AblyState {
  connected: boolean;
  realtimeAvailable: boolean;
  clientId: string | null;
  joinRoom: (room: string) => Promise<boolean>;
  leaveRoom: (room: string) => void;
  onEvent: (event: string, handler: (payload: unknown) => void) => () => void;
}

const AblyContext = createContext<AblyState>({
  connected: false,
  realtimeAvailable: false,
  clientId: null,
  joinRoom: async () => false,
  leaveRoom: () => {},
  onEvent: () => () => {},
});

export function useAbly(): AblyState {
  return useContext(AblyContext);
}

export function AblyProvider({ children }: { children: ReactNode }) {
  const handlersRef = useRef(new Map<string, Set<(payload: unknown) => void>>());
  const joinedRef = useRef(new Set<string>());
  const subscribedRef = useRef(new Set<string>());
  const cancelledRef = useRef(false);
  const [connected, setConnected] = useState(false);
  // Optimistic until a failure proves otherwise — avoids a false
  // "unavailable" flash while the first connection is being established.
  const [realtimeAvailable, setRealtimeAvailable] = useState(true);
  const [clientId, setClientId] = useState<string | null>(null);

  const dispatch = useCallback((event: string, payload: unknown) => {
    handlersRef.current.get(event)?.forEach((fn) => {
      try {
        fn(payload);
      } catch {
        /* handler errors stay local */
      }
    });
  }, []);

  /** Attach a channel (refreshing the token once on capability errors) and fan out its events. */
  const subscribeChannel = useCallback(
    async (name: string): Promise<boolean> => {
      const ably = getAbly();
      if (!ably) return false;
      try {
        const channel = ably.channels.get(name);
        try {
          await channel.attach();
        } catch (error) {
          const code = (error as { code?: number })?.code;
          // Capability may lag a fresh membership: refresh token once, retry.
          if (code === 40160 || code === 40101 || code === 40100) {
            await ably.auth.authorize().catch(() => {});
            await channel.attach();
          } else {
            throw error;
          }
        }
        if (cancelledRef.current) return false;
        if (!subscribedRef.current.has(name)) {
          subscribedRef.current.add(name);
          channel.subscribe((message) => {
            dispatch(String(message.name), message.data);
          });
        }
        return true;
      } catch {
        return false;
      }
    },
    [dispatch],
  );

  useEffect(() => {
    cancelledRef.current = false;
    const ably = getAbly();
    if (!ably) return;
    let presenceEntered = false;

    const onConnected = () => {
      if (cancelledRef.current) return;
      setConnected(true);
      setRealtimeAvailable(true);
      const id = ably.auth.clientId || null;
      setClientId(id);
      // Personal channel: calls, notifications, conversation updates.
      if (id) void subscribeChannel(userChannel(id));
      // Presence channel: enter + forward member enter/leave as events.
      void subscribeChannel(PRESENCE_CHANNEL).then((ok) => {
        if (!ok || cancelledRef.current) return;
        const channel = ably.channels.get(PRESENCE_CHANNEL);
        channel.presence
          .enter({ at: new Date().toISOString() })
          .then(() => {
            presenceEntered = true;
          })
          .catch(() => {});
        channel.presence.subscribe("enter", (member) => {
          if (member.clientId && member.clientId !== ably.auth.clientId) {
            dispatch("presence:update", { userId: member.clientId, online: true, at: new Date().toISOString() });
          }
        });
        channel.presence.subscribe("leave", (member) => {
          if (member.clientId && member.clientId !== ably.auth.clientId) {
            dispatch("presence:update", { userId: member.clientId, online: false, at: new Date().toISOString() });
          }
        });
      });
      // Re-attach on-demand channels after a reconnect.
      for (const name of joinedRef.current) {
        void subscribeChannel(name);
      }
    };
    const onDisconnected = () => {
      if (!cancelledRef.current) setConnected(false);
    };
    const onFailed = () => {
      if (cancelledRef.current) return;
      setConnected(false);
      // Polling fallback in consumers covers the outage honestly.
      setRealtimeAvailable(false);
      // "failed" is terminal in Ably (no auto-retry): attempt one manual
      // reconnect; a repeat failure simply re-arms this handler.
      window.setTimeout(() => {
        if (!cancelledRef.current && ably.connection.state === "failed") {
          try {
            ably.connect();
          } catch {
            /* stays on polling */
          }
        }
      }, 10000);
    };

    ably.connection.on("connected", onConnected);
    ably.connection.on("disconnected", onDisconnected);
    ably.connection.on("suspended", onDisconnected);
    ably.connection.on("failed", onFailed);
    ably.connection.on("closed", onDisconnected);
    if (ably.connection.state === "connected") onConnected();

    return () => {
      cancelledRef.current = true;
      ably.connection.off("connected", onConnected);
      ably.connection.off("disconnected", onDisconnected);
      ably.connection.off("suspended", onDisconnected);
      ably.connection.off("failed", onFailed);
      ably.connection.off("closed", onDisconnected);
      if (presenceEntered) {
        ably.channels.get(PRESENCE_CHANNEL).presence.leave().catch(() => {});
      }
    };
  }, [dispatch, subscribeChannel]);

  const joinRoom = useCallback(
    async (room: string): Promise<boolean> => {
      const name = normalizeChannel(room);
      if (joinedRef.current.has(name)) return true;
      joinedRef.current.add(name);
      const ok = await subscribeChannel(name);
      if (!ok) joinedRef.current.delete(name);
      return ok;
    },
    [subscribeChannel],
  );

  const leaveRoom = useCallback((room: string) => {
    const ably = getAbly();
    const name = normalizeChannel(room);
    joinedRef.current.delete(name);
    subscribedRef.current.delete(name);
    if (!ably) return;
    const channel = ably.channels.get(name);
    channel.unsubscribe();
    channel.detach().catch(() => {});
  }, []);

  const onEvent = useCallback((event: string, handler: (payload: unknown) => void) => {
    let set = handlersRef.current.get(event);
    if (!set) {
      set = new Set();
      handlersRef.current.set(event, set);
    }
    set.add(handler);
    return () => {
      handlersRef.current.get(event)?.delete(handler);
    };
  }, []);

  return (
    <AblyContext.Provider value={{ connected, realtimeAvailable, clientId, joinRoom, leaveRoom, onEvent }}>
      {children}
    </AblyContext.Provider>
  );
}
