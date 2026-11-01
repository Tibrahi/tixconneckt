import { apiError, apiOk } from "@/lib/api-response";
import { getSession } from "@/lib/session";

/**
 * Authenticated ICE configuration for WebRTC calls. TURN credentials live
 * server-side (TURN_USERNAME/TURN_PASSWORD) and are delivered here per
 * session — never through NEXT_PUBLIC variables. STUN/TURN URLs stay
 * public; without TURN credentials, restrictive networks may fail and the
 * call UI reports the connection failure honestly.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);

  const stun = (process.env.NEXT_PUBLIC_STUN_URLS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const servers: Array<{ urls: string[]; username?: string; credential?: string }> = [
    { urls: stun.length > 0 ? stun : ["stun:stun.l.google.com:19302"] },
  ];
  const turn = (process.env.NEXT_PUBLIC_TURN_URLS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (turn.length > 0) {
    const username = process.env.TURN_USERNAME || undefined;
    const credential = process.env.TURN_PASSWORD || undefined;
    servers.push(
      username && credential ? { urls: turn, username, credential } : { urls: turn },
    );
  }
  return apiOk({ iceServers: servers });
}
