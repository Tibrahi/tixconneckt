import { apiError, apiOk } from "@/lib/api-response";
import { getSession } from "@/lib/session";

/**
 * Authenticated ICE configuration for WebRTC calls. TURN credentials live
 * server-side (TURN_USERNAME/TURN_PASSWORD) and are delivered here per
 * session — the browser only ever sees them inside this authenticated
 * response. Deployments that still carry the previous
 * NEXT_PUBLIC_TURN_USERNAME/PASSWORD variables keep working through a
 * server-side fallback (warned once per boot) until they migrate.
 * STUN/TURN URLs stay public; without TURN credentials, restrictive
 * networks may fail and the call UI reports the failure honestly.
 */
let fallbackWarned = false;

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
    // Preferred server-side credentials, with a compatibility fallback to
    // the previous public variable names (still served only to sessions).
    const username = process.env.TURN_USERNAME || process.env.NEXT_PUBLIC_TURN_USERNAME || undefined;
    const credential = process.env.TURN_PASSWORD || process.env.NEXT_PUBLIC_TURN_PASSWORD || undefined;
    if (username && credential && !process.env.TURN_USERNAME && !fallbackWarned) {
      fallbackWarned = true;
      console.warn("[calls:ice] serving TURN credentials from NEXT_PUBLIC_TURN_* — move them to TURN_USERNAME/TURN_PASSWORD");
    }
    servers.push(
      username && credential ? { urls: turn, username, credential } : { urls: turn },
    );
  }
  return apiOk({ iceServers: servers });
}
