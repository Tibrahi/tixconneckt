"use client";

import { useEffect } from "react";
import { useAbly } from "@/components/realtime/AblyProvider";

export { useAbly } from "@/components/realtime/AblyProvider";

/** Subscribe to one realtime event for the lifetime of the component. */
export function useAblyEvent(event: string, handler: (payload: unknown) => void): void {
  const { onEvent } = useAbly();
  useEffect(() => onEvent(event, handler), [onEvent, event, handler]);
}

/**
 * Join a channel while mounted (conversation/group rooms). Personal and
 * presence channels are auto-joined by the provider — no need to join them.
 */
export function useAblyChannel(room: string | null): void {
  const { joinRoom, leaveRoom } = useAbly();
  useEffect(() => {
    if (!room) return;
    let active = true;
    void joinRoom(room).then((ok) => {
      if (!ok && active) {
        // Polling fallback in the consumer covers the failure honestly.
      }
    });
    return () => {
      active = false;
      leaveRoom(room);
    };
  }, [room, joinRoom, leaveRoom]);
}
