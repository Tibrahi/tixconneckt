import { normalizeChannel } from "./ably/events";
import { ablyConfigured, getPresenceClientIds, publishToChannel } from "./ably/server";

/**
 * Server-side realtime relay (Ably-only). API routes call emitToRoom()
 * AFTER their database commit; Ably forwards to subscribed channel
 * members. Delivery failures are logged — clients also poll authoritative
 * endpoints, so a missed event never means lost data.
 */

export function realtimeAvailable(): boolean {
  return ablyConfigured();
}

export async function emitToRoom(room: string, event: string, payload: unknown): Promise<boolean> {
  return publishToChannel(normalizeChannel(room), event, payload);
}

/**
 * Genuine presence: which of these user ids hold a live Ably presence
 * entry right now. Returns null when Ably is unconfigured or unreachable,
 * in which case callers must show no presence rather than a guess.
 */
export async function fetchPresence(userIds: string[]): Promise<string[] | null> {
  if (!ablyConfigured()) return null;
  if (userIds.length === 0) return [];
  const online = await getPresenceClientIds();
  if (online === null) return null;
  const set = new Set(online);
  return userIds.filter((id) => set.has(id));
}
