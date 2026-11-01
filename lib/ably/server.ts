import "server-only";
import Ably from "ably";

/**
 * Server-side Ably REST client. The private ABLY_API_KEY never leaves the
 * server: browsers authenticate with short-lived token requests issued by
 * /api/ably/token (see app/api/ably/token/route.ts).
 */

let rest: Ably.Rest | null = null;

export function ablyConfigured(): boolean {
  return Boolean(process.env.ABLY_API_KEY);
}

function getRest(): Ably.Rest | null {
  const key = process.env.ABLY_API_KEY;
  if (!key) return null;
  if (!rest) rest = new Ably.Rest({ key });
  return rest;
}

/** Publish one event to a channel. Returns false when unavailable/failing. */
export async function publishToChannel(
  channel: string,
  event: string,
  payload: unknown,
): Promise<boolean> {
  const client = getRest();
  if (!client) return false;
  try {
    const body =
      payload && typeof payload === "object" && !Array.isArray(payload)
        ? { ...(payload as Record<string, unknown>), at: new Date().toISOString() }
        : { value: payload, at: new Date().toISOString() };
    await client.channels.get(channel).publish(event, body);
    return true;
  } catch (error) {
    console.error(
      "[ably:publish]",
      channel,
      event,
      error instanceof Error ? error.message : error,
    );
    return false;
  }
}

export interface TokenScope {
  userId: string;
  conversationIds: string[];
  groupIds: string[];
}

/**
 * Mint a short-lived token request scoped to exactly the channels this user
 * may access: their personal channel, the global presence channel, and the
 * conversations/groups they belong to. No wildcards — membership verified
 * by the caller before invoking.
 */
export async function createTokenRequest(
  scope: TokenScope,
): Promise<Record<string, unknown> | null> {
  const client = getRest();
  if (!client) return null;
  const capability: Record<string, string[]> = {
    [`private:user:${scope.userId}`]: ["subscribe", "presence"],
    "private:presence": ["subscribe", "presence"],
  };
  const conversations = scope.conversationIds.slice(0, 500);
  const groups = scope.groupIds.slice(0, 500);
  for (const id of conversations) capability[`private:conversation:${id}`] = ["subscribe", "presence"];
  for (const id of groups) capability[`private:group:${id}`] = ["subscribe"];
  try {
    const request = await client.auth.createTokenRequest({
      clientId: scope.userId,
      ttl: 60 * 60 * 1000,
      capability: JSON.stringify(capability),
    });
    return request as unknown as Record<string, unknown>;
  } catch (error) {
    console.error("[ably:token]", error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Client ids currently present on the global presence channel.
 * Returns null when Ably is unconfigured or unreachable — callers must
 * show no presence rather than a guess.
 */
export async function getPresenceClientIds(): Promise<string[] | null> {
  const client = getRest();
  if (!client) return null;
  try {
    const page = await client.channels.get("private:presence").presence.get();
    const ids = new Set<string>();
    // First page (up to 100 members) is enough at current scale; the
    // channel only carries lightweight enter/leave markers.
    for (const member of page.items) {
      if (member.clientId) ids.add(member.clientId);
    }
    return [...ids];
  } catch (error) {
    console.error("[ably:presence]", error instanceof Error ? error.message : error);
    return null;
  }
}
