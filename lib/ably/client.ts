"use client";

import * as Ably from "ably";

/**
 * Browser-side Ably Realtime singleton. Authenticates with short-lived
 * tokens from /api/ably/token (authCallback keeps our enveloped API shape);
 * the private API key is never exposed to the browser.
 */

let client: Ably.Realtime | null = null;

interface TokenEnvelope {
  ok: boolean;
  data?: { tokenRequest: Ably.TokenRequest };
  error?: string;
}

const authCallback: NonNullable<Ably.ClientOptions["authCallback"]> = (_params, callback) => {
  fetch("/api/ably/token", { cache: "no-store" })
    .then(async (res) => {
      if (res.status === 503) throw new Error("Realtime is not configured.");
      const body = (await res.json()) as TokenEnvelope;
      if (!res.ok || !body.ok || !body.data) throw new Error(body.error ?? "Realtime auth failed.");
      callback(null, body.data.tokenRequest);
    })
    .catch((error: unknown) => {
      callback(error instanceof Error ? error.message : "Realtime auth failed.", null);
    });
};

export function getAbly(): Ably.Realtime | null {
  if (typeof window === "undefined") return null;
  if (!client) {
    client = new Ably.Realtime({
      authCallback,
      echoMessages: false,
      autoConnect: true,
      disconnectedRetryTimeout: 5000,
      suspendedRetryTimeout: 15000,
    });
  }
  return client;
}

/** Force the client to fetch a fresh token (fresh memberships) on demand. */
export async function reauthorizeAbly(): Promise<boolean> {
  const ably = getAbly();
  if (!ably) return false;
  try {
    await ably.auth.authorize();
    return true;
  } catch {
    return false;
  }
}

export type { Ably };
