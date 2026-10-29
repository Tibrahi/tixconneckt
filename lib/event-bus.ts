/**
 * Process-local realtime event bus.
 *
 * Socket.IO server instances (one per Node runtime) subscribe to this bus so
 * that any server action or API route can emit an authorized event after its
 * database commit. Events always reflect persisted operations — never
 * optimistic frontend state.
 */

export interface BusEvent<T = unknown> {
  room: string;
  event: string;
  payload: T;
  at: string;
}

type Listener = (event: BusEvent) => void;

const listeners = new Set<Listener>();

export function publishEvent<T>(room: string, event: string, payload: T): void {
  const message: BusEvent<T> = { room, event, payload, at: new Date().toISOString() };
  for (const listener of listeners) {
    try {
      listener(message);
    } catch (error) {
      console.error("[bus:listener]", error instanceof Error ? error.message : error);
    }
  }
}

export function subscribeEvents(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function userRoom(userId: string): string {
  return `user:${userId}`;
}

export function conversationRoom(conversationId: string): string {
  return `conversation:${conversationId}`;
}

export function groupRoom(groupId: string): string {
  return `group:${groupId}`;
}
