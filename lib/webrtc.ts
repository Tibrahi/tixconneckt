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
  const configured = (process.env.NEXT_PUBLIC_STUN_URLS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const urls = configured.length > 0 ? configured : ["stun:stun.l.google.com:19302"];
  return [{ urls }];
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
