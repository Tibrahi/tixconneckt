/**
 * Browser-native WebRTC helpers — no call SDK, no media server.
 * Signaling travels through our own API + Socket.IO rooms; audio/video
 * flows peer-to-peer. STUN defaults to a free public server and can be
 * overridden with NEXT_PUBLIC_STUN_URLS (comma-separated).
 */

export function callsSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof RTCPeerConnection !== "undefined" &&
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

export function iceServers(): RTCIceServer[] {
  const stun = (process.env.NEXT_PUBLIC_STUN_URLS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const servers: RTCIceServer[] = [
    { urls: stun.length > 0 ? stun : ["stun:stun.l.google.com:19302"] },
  ];
  // Optional TURN for restrictive networks (symmetric NAT). Without it,
  // some networks cannot establish peer media — surfaced honestly in UI.
  const turn = (process.env.NEXT_PUBLIC_TURN_URLS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (turn.length > 0) {
    servers.push({
      urls: turn,
      username: process.env.NEXT_PUBLIC_TURN_USERNAME || undefined,
      credential: process.env.NEXT_PUBLIC_TURN_PASSWORD || undefined,
    });
  }
  return servers;
}

/** True when a TURN relay is configured for restrictive networks. */
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
  onCandidate: (candidate: RTCIceCandidate) => void,
): RTCPeerConnection {
  const pc = new RTCPeerConnection({ iceServers: iceServers() });
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
