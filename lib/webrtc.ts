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
  const stream = await navigator.mediaDevices.getUserMedia(
    kind === "video"
      ? {
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        }
      : {
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: false,
        },
  );
  // Fail fast with a diagnosable error instead of a silent one-way call:
  // some browsers/devices resolve getUserMedia without the requested track.
  if (stream.getAudioTracks().length === 0) {
    stopStream(stream);
    throw new Error("no-microphone-track");
  }
  if (kind === "video" && stream.getVideoTracks().length === 0) {
    stopStream(stream);
    throw new Error("no-camera-track");
  }
  return stream;
}

/** Re-acquire just the microphone (device reconnect) without touching video. */
export async function getMicrophoneTrack(): Promise<MediaStreamTrack> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  const [track] = stream.getAudioTracks();
  if (!track) {
    stopStream(stream);
    throw new Error("no-microphone-track");
  }
  // Detach: the caller owns the track and stops the leftover stream tracks.
  stream.getTracks().forEach((t) => {
    if (t !== track) {
      try {
        t.stop();
      } catch {
        /* already stopped */
      }
    }
  });
  return track;
}

/** Honest, specific capture failures for UI display. */
export function micErrorMessage(error: unknown): string {
  const name = error instanceof DOMException || error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : "";
  if (message === "no-microphone-track") {
    return "Your microphone produced no audio track, so the call couldn't start. Check your system input device and try again.";
  }
  if (message === "no-camera-track") {
    return "Your camera produced no video track. Try an audio call instead.";
  }
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Microphone access was denied, so the call couldn't start. Allow it in your browser settings and try again.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError" || name === "OverconstrainedError") {
    return "No usable microphone was found on this device, so the call couldn't start.";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "Your microphone is busy in another app, so the call couldn't start. Close it and try again.";
  }
  return "Your microphone couldn't start, so the call couldn't start.";
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
