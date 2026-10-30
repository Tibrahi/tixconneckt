"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useSocket } from "@/components/realtime/SocketProvider";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import {
  callsSupported,
  createPeerConnection,
  getCallMedia,
  setTrackEnabled,
  stopStream,
  turnConfigured,
} from "@/lib/webrtc";

/**
 * Global 1:1 call manager. Listens for incoming calls anywhere in the
 * dashboard, runs the WebRTC handshake over our own signaling API, and
 * renders the incoming/active call UI. Media is peer-to-peer; only the
 * call lifecycle and SDP/ICE signaling touch our servers.
 */

type CallKind = "audio" | "video";

interface IncomingCall {
  callId: string;
  conversationId: string;
  kind: CallKind;
  callerName: string;
}

interface ActiveCall {
  callId: string;
  conversationId: string;
  kind: CallKind;
  role: "caller" | "callee";
  peerName: string;
  phase: "ringing" | "connecting" | "active";
  startedAt: number;
}

interface CallContextValue {
  startCall: (conversationId: string, kind: CallKind, peerName: string) => void;
  inCall: boolean;
}

const CallContext = createContext<CallContextValue>({
  startCall: () => {},
  inCall: false,
});

export function useCall(): CallContextValue {
  return useContext(CallContext);
}

const RING_TIMEOUT_MS = 60_000;
const OFFER_WAIT_MS = 15_000;
const MEDIA_TIMEOUT_MS = 25_000;

function formatElapsed(since: number, now: number): string {
  const total = Math.max(0, Math.floor((now - since) / 1000));
  const mm = String(Math.floor(total / 60)).padStart(2, "0");
  const ss = String(total % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

/** Audio/video call buttons for a 1:1 thread header. Disabled mid-call. */
export function CallButtons({ conversationId, calleeName }: { conversationId: string; calleeName: string }) {
  const { startCall, inCall } = useCall();
  if (!callsSupported()) {
    return <span className="text-xs text-neutral-500">Calls unavailable in this browser</span>;
  }
  return (
    <span className="flex gap-1">
      <Button
        size="sm"
        variant="secondary"
        icon="phone"
        disabled={inCall}
        onClick={() => startCall(conversationId, "audio", calleeName)}
      >
        Audio
      </Button>
      <Button
        size="sm"
        variant="secondary"
        icon="video"
        disabled={inCall}
        onClick={() => startCall(conversationId, "video", calleeName)}
      >
        Video
      </Button>
    </span>
  );
}

export function CallProvider({ children }: { children: ReactNode }) {
  const { onEvent } = useSocket();
  const [incoming, setIncoming] = useState<IncomingCall | null>(null);
  const [active, setActive] = useState<ActiveCall | null>(null);
  const [ringingOffline, setRingingOffline] = useState(false);
  const [callError, setCallError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localRef = useRef<MediaStream | null>(null);
  const activeRef = useRef<ActiveCall | null>(null);
  const incomingRef = useRef<IncomingCall | null>(null);
  const pendingOfferRef = useRef<RTCSessionDescriptionInit | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const timersRef = useRef<number[]>([]);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);
  useEffect(() => {
    incomingRef.current = incoming;
  }, [incoming]);

  function later(fn: () => void, ms: number): void {
    const id = window.setTimeout(fn, ms);
    timersRef.current.push(id);
  }

  function clearTimers(): void {
    for (const id of timersRef.current) window.clearTimeout(id);
    timersRef.current = [];
  }

  const cleanupMedia = useCallback(() => {
    clearTimers();
    try {
      pcRef.current?.close();
    } catch {
      /* already closed */
    }
    pcRef.current = null;
    stopStream(localRef.current);
    localRef.current = null;
    pendingOfferRef.current = null;
    pendingCandidatesRef.current = [];
    setLocalStream(null);
    setRemoteStream(null);
    setMuted(false);
    setCameraOff(false);
  }, []);

  const endLocally = useCallback(
    (message?: string) => {
      cleanupMedia();
      setActive(null);
      setIncoming(null);
      setRingingOffline(false);
      setCallError(message ?? null);
      window.dispatchEvent(new Event("tix:calls"));
    },
    [cleanupMedia],
  );

  async function postSignal(callId: string, signal: Record<string, unknown>): Promise<boolean> {
    try {
      const res = await fetch(`/api/calls/${encodeURIComponent(callId)}/signal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(signal),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async function decide(callId: string, decision: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/calls/${encodeURIComponent(callId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  const attachPeerHandlers = useCallback(
    (callId: string): void => {
      const pc = pcRef.current;
      if (!pc) return;
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        postSignal(callId, {
          kind: "candidate",
          candidate: event.candidate.candidate,
          sdpMid: event.candidate.sdpMid,
          sdpMLineIndex: event.candidate.sdpMLineIndex,
        }).catch(() => {});
      }
    };
    pc.ontrack = (event) => {
      const [stream] = event.streams;
      if (stream) {
        setRemoteStream(stream);
        setActive((a) => (a && a.callId === callId ? { ...a, phase: "active", startedAt: Date.now() } : a));
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed") {
        endLocally(
          turnConfigured()
            ? "The connection failed — network conditions blocked the call. Hang up and try again."
            : "The connection failed — network conditions blocked the call, and no TURN relay is configured on this deployment.",
        );
        decide(callId, "ended").catch(() => {});
      } else if (pc.connectionState === "disconnected") {
        setActive((a) => (a && a.callId === callId ? { ...a, phase: "connecting" } : a));
      } else if (pc.connectionState === "connected") {
        setActive((a) => (a && a.callId === callId ? { ...a, phase: "active" } : a));
      }
    };
    },
    [endLocally],
  );

  async function flushPendingCandidates(): Promise<void> {
    const pc = pcRef.current;
    if (!pc || !pc.remoteDescription) return;
    const queued = pendingCandidatesRef.current;
    pendingCandidatesRef.current = [];
    for (const init of queued) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(init));
      } catch {
        /* stale candidate */
      }
    }
  }

  const hangup = useCallback(async () => {
    const call = activeRef.current;
    const pending = incomingRef.current;
    const callId = call?.callId ?? pending?.callId;
    if (callId) {
      // Callee hanging up while ringing counts as declining server-side.
      await decide(callId, "ended").catch(() => {});
    }
    endLocally();
  }, [endLocally]);

  const startCall = useCallback(
    async (conversationId: string, kind: CallKind, peerName: string) => {
      if (activeRef.current || incomingRef.current) return;
      setCallError(null);
      if (!callsSupported()) {
        setCallError("Calls need a browser with microphone and camera support (WebRTC).");
        return;
      }
      let callId = "";
      try {
        const res = await fetch("/api/calls", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId, kind }),
        });
        const body = (await res.json()) as {
          ok: boolean;
          data?: { call: { id: string; delivered: boolean } };
          error?: string;
        };
        if (!res.ok || !body.ok || !body.data) {
          setCallError(body.error ?? "We couldn't start the call. Please try again.");
          return;
        }
        callId = body.data.call.id;
        setRingingOffline(body.data.call.delivered === false);
      } catch {
        setCallError("Your connection was interrupted. Please try again.");
        return;
      }

      setActive({
        callId,
        conversationId,
        kind,
        role: "caller",
        peerName,
        phase: "ringing",
        startedAt: Date.now(),
      });

      let stream: MediaStream;
      try {
        stream = await getCallMedia(kind);
      } catch {
        await decide(callId, "ended").catch(() => {});
        endLocally("Microphone access was denied, so the call couldn't start.");
        return;
      }
      localRef.current = stream;
      setLocalStream(stream);

      const pc = createPeerConnection(() => {});
      pcRef.current = pc;
      for (const track of stream.getTracks()) pc.addTrack(track, stream);
      attachPeerHandlers(callId);
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        const sent = await postSignal(callId, { kind: "offer", sdp: offer.sdp ?? "" });
        if (!sent) throw new Error("signaling failed");
      } catch {
        await decide(callId, "ended").catch(() => {});
        endLocally("We couldn't reach the other side. Please try again.");
        return;
      }

      // Unanswered ring becomes a missed call server-side on hangup.
      later(() => {
        const current = activeRef.current;
        if (current && current.callId === callId && current.phase === "ringing") {
          decide(callId, "ended").catch(() => {});
          endLocally(`${peerName} didn't answer. A missed-call notification was sent.`);
        }
      }, RING_TIMEOUT_MS);
    },
    [attachPeerHandlers, endLocally],
  );

  const acceptCall = useCallback(async () => {
    const inv = incomingRef.current;
    if (!inv) return;
    setIncoming(null);
    setCallError(null);
    if (!callsSupported()) {
      await decide(inv.callId, "declined").catch(() => {});
      setCallError("Calls need a browser with microphone and camera support (WebRTC).");
      return;
    }
    const ok = await decide(inv.callId, "accepted").catch(() => false);
    if (!ok) {
      endLocally("This call is no longer available — it may have been answered elsewhere or cancelled.");
      return;
    }
    setActive({
      callId: inv.callId,
      conversationId: inv.conversationId,
      kind: inv.kind,
      role: "callee",
      peerName: inv.callerName,
      phase: "connecting",
      startedAt: Date.now(),
    });

    let stream: MediaStream;
    try {
      stream = await getCallMedia(inv.kind);
    } catch {
      await decide(inv.callId, "ended").catch(() => {});
      endLocally("Microphone access was denied, so the call couldn't start.");
      return;
    }
    localRef.current = stream;
    setLocalStream(stream);

    const pc = createPeerConnection(() => {});
    pcRef.current = pc;
    for (const track of stream.getTracks()) pc.addTrack(track, stream);
    attachPeerHandlers(inv.callId);

    // The offer usually arrived while ringing; otherwise wait briefly.
    const waitStart = Date.now();
    while (!pendingOfferRef.current && Date.now() - waitStart < OFFER_WAIT_MS) {
      if (activeRef.current?.callId !== inv.callId) return;
      await new Promise((r) => setTimeout(r, 200));
    }
    const offer = pendingOfferRef.current;
    pendingOfferRef.current = null;
    if (!offer || activeRef.current?.callId !== inv.callId) {
      if (activeRef.current?.callId === inv.callId) {
        await decide(inv.callId, "ended").catch(() => {});
        endLocally("We couldn't establish the connection. Please try again.");
      }
      return;
    }
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      await flushPendingCandidates();
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await postSignal(inv.callId, { kind: "answer", sdp: answer.sdp ?? "" });
    } catch {
      await decide(inv.callId, "ended").catch(() => {});
      endLocally("We couldn't establish the connection. Please try again.");
    }
  }, [attachPeerHandlers, endLocally]);

  const declineCall = useCallback(async () => {
    const inv = incomingRef.current;
    setIncoming(null);
    if (inv) await decide(inv.callId, "declined").catch(() => {});
    window.dispatchEvent(new Event("tix:calls"));
  }, []);

  // ---- Realtime event wiring ----
  useEffect(() => {
    const offs = [
      onEvent("call:incoming", (payload) => {
        const data = payload as {
          callId?: string;
          conversationId?: string;
          kind?: string;
          caller?: { name?: string };
        };
        if (!data.callId || !data.conversationId) return;
        if (activeRef.current || incomingRef.current) {
          // Busy in another call — politely decline the new one.
          decide(String(data.callId), "declined").catch(() => {});
          return;
        }
        setCallError(null);
        setIncoming({
          callId: String(data.callId),
          conversationId: String(data.conversationId),
          kind: data.kind === "video" ? "video" : "audio",
          callerName: String(data.caller?.name ?? "Unknown"),
        });
        later(() => {
          // Ringing UI expires locally; the caller side still resolves the record.
          if (incomingRef.current?.callId === String(data.callId)) setIncoming(null);
        }, RING_TIMEOUT_MS);
      }),
      onEvent("call:signal", (payload) => {
        const data = payload as {
          callId?: string;
          signal?: { kind?: string; sdp?: string; candidate?: string; sdpMid?: string | null; sdpMLineIndex?: number | null };
        };
        const current = activeRef.current;
        if (!data.callId || !data.signal) return;
        if (current?.callId === String(data.callId)) {
          const pc = pcRef.current;
          const signal = data.signal;
          if (signal.kind === "answer" && pc && typeof signal.sdp === "string") {
            pc.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp: signal.sdp }))
              .then(() => flushPendingCandidates())
              .catch(() => {});
            setActive((a) => (a ? { ...a, phase: "connecting" } : a));
            // Media must arrive promptly once the answer is in.
            later(() => {
              const still = activeRef.current;
              if (still && still.callId === String(data.callId) && still.phase !== "active") {
                decide(String(data.callId), "ended").catch(() => {});
                endLocally("Media couldn't be established. Check your connection and try again.");
              }
            }, MEDIA_TIMEOUT_MS);
          } else if (signal.kind === "candidate" && typeof signal.candidate === "string") {
            const init: RTCIceCandidateInit = {
              candidate: signal.candidate,
              sdpMid: signal.sdpMid,
              sdpMLineIndex: signal.sdpMLineIndex,
            };
            if (pc && pc.remoteDescription) {
              pc.addIceCandidate(new RTCIceCandidate(init)).catch(() => {});
            } else {
              pendingCandidatesRef.current.push(init);
            }
          }
        } else if (incomingRef.current?.callId === String(data.callId)) {
          // Pre-accept signaling (offer + early ICE) is buffered, not dropped.
          const signal = data.signal;
          if (signal.kind === "offer" && typeof signal.sdp === "string") {
            pendingOfferRef.current = { type: "offer", sdp: signal.sdp };
          } else if (signal.kind === "candidate" && typeof signal.candidate === "string") {
            pendingCandidatesRef.current.push({
              candidate: signal.candidate,
              sdpMid: signal.sdpMid,
              sdpMLineIndex: signal.sdpMLineIndex,
            });
          }
        }
      }),
      onEvent("call:accepted", (payload) => {
        const data = payload as { callId?: string };
        setActive((a) =>
          a && data.callId === a.callId ? { ...a, phase: "connecting" } : a,
        );
      }),
      onEvent("call:declined", (payload) => {
        const data = payload as { callId?: string };
        if (activeRef.current?.callId === data.callId) {
          endLocally("The call was declined.");
        }
      }),
      onEvent("call:ended", (payload) => {
        const data = payload as { callId?: string };
        if (activeRef.current?.callId === data.callId) endLocally();
        if (incomingRef.current?.callId === data.callId) setIncoming(null);
      }),
      onEvent("call:missed", (payload) => {
        const data = payload as { callId?: string };
        if (incomingRef.current?.callId === data.callId) setIncoming(null);
      }),
    ];
    return () => offs.forEach((off) => off());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onEvent]);

  // Attach media streams to elements.
  useEffect(() => {
    if (localVideoRef.current) localVideoRef.current.srcObject = localStream;
  }, [localStream, active?.callId]);
  useEffect(() => {
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = remoteStream;
  }, [remoteStream, active?.callId]);

  // Elapsed timer + unmount cleanup.
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);
  useEffect(() => () => cleanupMedia(), [cleanupMedia]);

  function toggleMute(): void {
    const next = !muted;
    setMuted(next);
    setTrackEnabled(localRef.current, "audio", !next);
  }

  function toggleCamera(): void {
    const next = !cameraOff;
    setCameraOff(next);
    setTrackEnabled(localRef.current, "video", !next);
  }

  const phaseLabel =
    active?.phase === "ringing" ? "Ringing…" : active?.phase === "connecting" ? "Connecting…" : "In call";

  return (
    <CallContext.Provider value={{ startCall: (c, k, p) => void startCall(c, k, p), inCall: active !== null }}>
      {children}

      {incoming ? (
        <Modal title={`Incoming ${incoming.kind} call`} onClose={declineCall}>
          <p className="text-sm text-neutral-600">
            <span className="font-semibold text-black">{incoming.callerName}</span> is calling you.
            Your camera and microphone turn on only if you accept.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" icon="phone" onClick={() => void declineCall()}>
              Decline
            </Button>
            <Button icon="phone" onClick={() => void acceptCall()}>
              Accept
            </Button>
          </div>
        </Modal>
      ) : null}

      {active ? (
        <Modal title={`${active.kind === "video" ? "Video" : "Audio"} call`} onClose={() => void hangup()} wide>
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm">
                <span className="font-semibold">{active.peerName}</span>{" "}
                <span className="text-neutral-600">
                  · {active.phase === "ringing" && ringingOffline ? "Ringing… they may be offline; we notified them" : phaseLabel}
                  {active.phase === "active" ? ` · ${formatElapsed(active.startedAt, now)}` : ""}
                </span>
              </p>
              <p className="font-mono text-xs text-neutral-500">
                {active.role === "caller" ? "outgoing" : "incoming"} · peer-to-peer
              </p>
            </div>

            {active.kind === "video" ? (
              <div className="grid gap-2 sm:grid-cols-[2fr_1fr]">
                <div className="overflow-hidden rounded-lg border border-neutral-200 bg-black">
                  <video
                    ref={remoteVideoRef}
                    autoPlay
                    playsInline
                    aria-label={`${active.peerName} video`}
                    className="aspect-video w-full object-cover"
                  />
                </div>
                <div className="overflow-hidden rounded-lg border border-neutral-200 bg-black">
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    aria-label="Your video preview"
                    className="aspect-video w-full object-cover"
                  />
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-lg border border-neutral-200 p-4">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-600 text-lg text-white" aria-hidden="true">
                  <Icon name="user" />
                </span>
                <div>
                  <p className="font-semibold">{active.peerName}</p>
                  <p className="text-sm text-neutral-600">Audio only — no video is shared.</p>
                </div>
                <audio ref={remoteAudioRef} autoPlay aria-label={`${active.peerName} audio`} className="hidden" />
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" icon="microphone" onClick={toggleMute}>
                {muted ? "Unmute" : "Mute"}
              </Button>
              {active.kind === "video" ? (
                <Button size="sm" variant="secondary" icon="camera" onClick={toggleCamera}>
                  {cameraOff ? "Camera on" : "Camera off"}
                </Button>
              ) : null}
              <Button size="sm" variant="danger" icon="phone" onClick={() => void hangup()}>
                Hang up
              </Button>
            </div>
            <p className="text-xs text-neutral-600">
              If the other side can&rsquo;t hear or see you, you are likely behind a restrictive network —
              voice and video need a direct peer connection.
            </p>
          </div>
        </Modal>
      ) : null}

      {callError && !active && !incoming ? (
        <Modal title="Call" onClose={() => setCallError(null)}>
          <p className="text-sm">{callError}</p>
          <div className="mt-4 flex justify-end">
            <Button variant="secondary" onClick={() => setCallError(null)}>
              Close
            </Button>
          </div>
        </Modal>
      ) : null}
    </CallContext.Provider>
  );
}
