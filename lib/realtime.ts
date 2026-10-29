/**
 * Server-side realtime relay. API routes call emitToRoom() AFTER their
 * database commit; the standalone realtime server forwards to room members.
 * Delivery failures are logged — clients also poll authoritative endpoints.
 */

export function realtimeAvailable(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_REALTIME_URL || process.env.REALTIME_PORT);
}

function relayBase(): string {
  const publicUrl = process.env.NEXT_PUBLIC_REALTIME_URL;
  if (publicUrl) return publicUrl.replace(/\/$/, "");
  return `http://localhost:${process.env.REALTIME_PORT ?? 3001}`;
}

export async function emitToRoom(room: string, event: string, payload: unknown): Promise<boolean> {
  const secret = process.env.INTERNAL_RELAY_SECRET;
  if (!secret) return false;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${relayBase()}/internal/emit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({ room, event, payload }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));
    return res.ok;
  } catch {
    return false;
  }
}
