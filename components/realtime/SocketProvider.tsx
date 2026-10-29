"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { io, type Socket } from "socket.io-client";

interface SocketState {
  connected: boolean;
  realtimeAvailable: boolean;
  joinRoom: (room: string) => Promise<boolean>;
  leaveRoom: (room: string) => void;
  onEvent: (event: string, handler: (payload: unknown) => void) => () => void;
}

const SocketContext = createContext<SocketState>({
  connected: false,
  realtimeAvailable: false,
  joinRoom: async () => false,
  leaveRoom: () => {},
  onEvent: () => () => {},
});

export function useSocket(): SocketState {
  return useContext(SocketContext);
}

function realtimeUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_REALTIME_URL;
  if (url) return url;
  // Same-host default for local development.
  if (typeof window !== "undefined" && window.location.hostname === "localhost") {
    return "http://localhost:3001";
  }
  return null;
}

/**
 * Realtime provider with graceful polling fallback. When the socket server is
 * unreachable the app keeps working through API polling — event handlers
 * simply fire from the polling layer instead of faking live delivery.
 */
export function SocketProvider({ children }: { children: ReactNode }) {
  const socketRef = useRef<Socket | null>(null);
  const handlersRef = useRef(new Map<string, Set<(payload: unknown) => void>>());
  const [connected, setConnected] = useState(false);
  const [realtimeAvailable, setRealtimeAvailable] = useState(false);

  useEffect(() => {
    const url = realtimeUrl();
    if (!url) return;
    let cancelled = false;
    let socket: Socket | null = null;

    async function connect() {
      try {
        const target = url;
        if (!target) return;
        const res = await fetch("/api/realtime/ticket", { cache: "no-store" });
        if (!res.ok) return;
        const body = (await res.json()) as { ok: boolean; data?: { ticket: string } };
        if (!body.ok || !body.data) return;
        if (cancelled) return;
        socket = io(target, {
          path: "/socket.io",
          auth: { ticket: body.data.ticket },
          reconnection: true,
          reconnectionAttempts: 5,
          timeout: 8000,
        });
        socketRef.current = socket;
        socket.on("connect", () => {
          setConnected(true);
          setRealtimeAvailable(true);
        });
        socket.on("disconnect", () => setConnected(false));
        socket.on("connect_error", () => setConnected(false));
        // Fan-out: forward every server event to registered handlers.
        socket.onAny((event, payload) => {
          handlersRef.current.get(event)?.forEach((fn) => {
            try {
              fn(payload);
            } catch {
              /* handler errors stay local */
            }
          });
        });
      } catch {
        /* polling fallback remains active */
      }
    }

    connect();
    return () => {
      cancelled = true;
      socket?.disconnect();
      socketRef.current = null;
    };
  }, []);

  const joinRoom = useCallback(async (room: string): Promise<boolean> => {
    const socket = socketRef.current;
    if (!socket?.connected) return false;
    try {
      const res = await fetch(`/api/realtime/join?room=${encodeURIComponent(room)}`, {
        cache: "no-store",
      });
      if (!res.ok) return false;
      const body = (await res.json()) as { ok: boolean; data?: { ticket: string } };
      if (!body.ok || !body.data) return false;
      const result = await socket.emitWithAck("join", { room, ticket: body.data.ticket });
      return Boolean((result as { ok?: boolean })?.ok);
    } catch {
      return false;
    }
  }, []);

  const leaveRoom = useCallback((room: string) => {
    socketRef.current?.emit("leave", { room });
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
    <SocketContext.Provider value={{ connected, realtimeAvailable, joinRoom, leaveRoom, onEvent }}>
      {children}
    </SocketContext.Provider>
  );
}
