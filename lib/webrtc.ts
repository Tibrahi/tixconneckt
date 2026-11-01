/**
 * Browser-native WebRTC helpers — no call SDK, no media server.
 * Signaling travels through our own API + Ably personal channels;
 * audio/video flows peer-to-peer. STUN defaults to a free public server
 * and can be overridden with NEXT_PUBLIC_STUN_URLS (comma-separated).
 * TURN credentials are server-side only, delivered per-session via
 * GET /api/calls/ice — never through NEXT_PUBLIC variables.
 */

export function callsSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof RTCPeerConnection !== "undefined" &&
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

interface IceResponse {
  ok: boolean;
  data?: { iceServers: RTCIceServer[] };
}

let iceCache: { servers: RTCIceServer[]; expires: number } | null = null;

/**
 * ICE servers for a call: STUN from public config plus TURN relay with
 * server-issued credentials. Cached briefly; falls back to STUN-only when
 * the credential endpoint is unreachable (calls may then fail on
 * restrictive networks, reported honestly by connection state).
 */
export async function getIceServers(): Promise<RTCIceServer[]> {
  if (iceCache && iceCache.expires > Date.now()) return iceCache.servers;
  const stun = (process.env.NEXT_PUBLIC_STUN_URLS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const fallback: RTCIceServer[] = [
    { urls: stun.length > 0 ? stun : ["stun:stun.l.google.com:19302"] },
  ];
  try {
    const res = await fetch("/api/calls/ice", { cache: "no-store" });
    const body = (await res.json()) as IceResponse;
    if (res.ok && body.ok && body.data && body.data.iceServers.length > 0) {
      iceCache = { servers: body.data.iceServers, expires: Date.now() + 10 * 60 * 1000 };
      return body.data.iceServers;
    }
  } catch {
    /* STUN-only fallback below */
  }
  return fallback;
}

/** True when a TURN relay URL is configured for restrictive networks. */
export function turnConfigured(): boolean {
  return (process.env.NEXT_PUBLIC_TURN_URLS ?? "").split(",").some((s) => s.trim().length > 0);
}

export async function getCallMedia(kind: "audio" | "video"): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia(
    kind === "video"
      ? { audio: true, video: { width: { ideal: 1280 }, height: { ideal: 720 } } }
      : { audio: true, video: false },
  );
}

export function createPeerConnection(
  servers: RTCIceServer[],
  onCandidate: (candidate: RTCIceCandidate) => void,
): RTCPeerConnection {
  const pc = new RTCPeerConnection({ iceServers: servers });
  pc.onicecandidate = (event) => {
    if (event.candidate) onCandidate(event.candidate);
  };
  return pc;
}

export function stopStream(stream: MediaStream | null): void {
  if (!stream) return;
  for (const track of stream.getTracks()) {
    try {
      track.stop();
    } catch {
      /* already stopped */
    }
  }
}

export function setTrackEnabled(
  stream: MediaStream | null,
  kind: "audio" | "video",
  enabled: boolean,
): void {
  if (!stream) return;
  const tracks = kind === "audio" ? stream.getAudioTracks() : stream.getVideoTracks();
  for (const track of tracks) track.enabled = enabled;
}
