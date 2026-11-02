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
import { Button, IconButton } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { useCallSignaling, type CallInvite, type CallSignal } from "@/hooks/use-call-signaling";
import { useCallTranscription } from "@/hooks/use-call-transcription";
import {
  callsSupported,
  createPeerConnection,
  getCallMedia,
  getIceServers,
  getMicrophoneTrack,
  micErrorMessage,
  setTrackEnabled,
  stopStream,
  turnConfigured,
} from "@/lib/webrtc";

/**
 * Global 1:1 call manager. Listens for incoming calls anywhere in the
 * dashboard, runs the WebRTC handshake over our signaling API (relayed via
 * Ably personal channels), and renders the incoming/active call UI. Media
 * is peer-to-peer; only the call lifecycle and SDP/ICE signaling touch our
 * servers.
 */

type CallKind = "audio" | "video";

interface IncomingCall {
  callId: string;
  conversationId: string;
  kind: CallKind;
  callerName: string;
  callerId: string;
  groupCall: boolean;
  participants: Array<{ id: string; name: string }>;
}

interface ActiveCall {
  callId: string;
  conversationId: string;
  kind: CallKind;
  role: "caller" | "callee";
  peerName: string;
  phase: "ringing" | "connecting" | "active";
  startedAt: number;
  groupCall: boolean;
  participants: Array<{ id: string; name: string }>;
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
      <IconButton
        label={`Start audio call with ${calleeName}`}
        icon="phone"
        disabled={inCall}
        onClick={() => startCall(conversationId, "audio", calleeName)}
      />
      <IconButton
        label={`Start video call with ${calleeName}`}
        icon="video"
        disabled={inCall}
        onClick={() => startCall(conversationId, "video", calleeName)}
      />
    </span>
  );
}

export function CallProvider({ children }: { children: ReactNode }) {
  const [incoming, setIncoming] = useState<IncomingCall | null>(null);
  const [active, setActive] = useState<ActiveCall | null>(null);
  const [ringingOffline, setRingingOffline] = useState(false);
  const [callError, setCallError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [peerMedia, setPeerMedia] = useState<{ muted: boolean; cameraOff: boolean }>({ muted: false, cameraOff: false });
  const [fullscreen, setFullscreen] = useState(false);
  const [needsResume, setNeedsResume] = useState(false);
  const [micState, setMicState] = useState<"live" | "muted" | "ended">("live");
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [remoteParticipants, setRemoteParticipants] = useState<Array<{ id: string; name: string; stream: MediaStream }>>([]);
  const [now, setNow] = useState(() => Date.now());
  const transcription = useCallTranscription({
    callId: active?.callId ?? incoming?.callId ?? null,
    capture: active?.role === "caller" && active.phase === "active",
    localStream,
    remoteStream,
  });

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const peerNamesRef = useRef<Map<string, string>>(new Map());
  const remoteStreamsRef = useRef<Map<string, MediaStream>>(new Map());
  const groupAudioContextRef = useRef<AudioContext | null>(null);
  const groupAudioDestinationsRef = useRef<Map<string, MediaStreamAudioDestinationNode>>(new Map());
  const relayedAudioSourcesRef = useRef<Map<string, MediaStreamAudioSourceNode>>(new Map());
  const localRef = useRef<MediaStream | null>(null);
  const activeRef = useRef<ActiveCall | null>(null);
  const incomingRef = useRef<IncomingCall | null>(null);
  const mutedRef = useRef(false);
  const pendingOfferRef = useRef<RTCSessionDescriptionInit | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const timersRef = useRef<number[]>([]);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const videoWrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);
  useEffect(() => {
    incomingRef.current = incoming;
  }, [incoming]);
  useEffect(() => {
    mutedRef.current = muted;
    setMicState((prev) => {
      if (prev === "ended") return prev;
      return muted ? "muted" : "live";
    });
  }, [muted]);

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
      for (const connection of peerConnectionsRef.current.values()) connection.close();
    } catch {
      /* already closed */
    }
    pcRef.current = null;
    peerConnectionsRef.current.clear();
    peerNamesRef.current.clear();
    remoteStreamsRef.current.clear();
    groupAudioDestinationsRef.current.clear();
    relayedAudioSourcesRef.current.clear();
    void groupAudioContextRef.current?.close().catch(() => {});
    groupAudioContextRef.current = null;
    setRemoteParticipants([]);
    stopStream(localRef.current);
    localRef.current = null;
    pendingOfferRef.current = null;
    pendingCandidatesRef.current = [];
    setLocalStream(null);
    setRemoteStream(null);
    setMuted(false);
    setCameraOff(false);
    setPeerMedia({ muted: false, cameraOff: false });
    setNeedsResume(false);
    setMicState("live");
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
    (callId: string, peerId: string, pc: RTCPeerConnection): void => {
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        postSignal(callId, {
          kind: "candidate",
          toUserId: peerId,
          candidate: event.candidate.candidate,
          sdpMid: event.candidate.sdpMid,
          sdpMLineIndex: event.candidate.sdpMLineIndex,
        }).catch(() => {});
      }
    };
    pc.ontrack = (event) => {
      const [stream] = event.streams;
      if (stream) {
        remoteStreamsRef.current.set(peerId, stream);
        const groupAudioContext = groupAudioContextRef.current;
        if (activeRef.current?.groupCall && groupAudioContext && stream.getAudioTracks().length > 0 && !relayedAudioSourcesRef.current.has(peerId)) {
          try {
            const source = groupAudioContext.createMediaStreamSource(stream);
            relayedAudioSourcesRef.current.set(peerId, source);
            for (const [targetId, destination] of groupAudioDestinationsRef.current) {
              if (targetId !== peerId) source.connect(destination);
            }
          } catch {
            setCallError("Group audio relay could not be started. Participants may not hear one another.");
          }
        }
        setRemoteParticipants([...remoteStreamsRef.current.entries()].map(([id, remote]) => ({
          id,
          name: peerNamesRef.current.get(id) ?? "Participant",
          stream: remote,
        })));
        const combined = new MediaStream();
        for (const remote of remoteStreamsRef.current.values()) {
          for (const track of remote.getTracks()) {
            if (!combined.getTracks().some((existing) => existing.id === track.id)) combined.addTrack(track);
          }
        }
        setRemoteStream(combined);
        setActive((a) => (a && a.callId === callId ? { ...a, phase: "active", startedAt: Date.now() } : a));
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed") {
        pc.close();
        peerConnectionsRef.current.delete(peerId);
        if (peerConnectionsRef.current.size === 0) endLocally(
          turnConfigured()
            ? "The connection failed — network conditions blocked the call. Hang up and try again."
            : "The connection failed — network conditions blocked the call, and no TURN relay is configured on this deployment.",
        );
        if (peerConnectionsRef.current.size === 0) decide(callId, "ended").catch(() => {});
      } else if (pc.connectionState === "disconnected") {
        setActive((a) => (a && a.callId === callId ? { ...a, phase: "connecting" } : a));
      } else if (pc.connectionState === "connected") {
        setActive((a) => (a && a.callId === callId ? { ...a, phase: "active" } : a));
      }
    };
      },
    [endLocally],
  );

  async function flushPendingCandidates(peerId?: string): Promise<void> {
    const pc = peerId ? peerConnectionsRef.current.get(peerId) : pcRef.current;
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
      let callData: { call: { id: string; delivered: boolean }; invitees?: Array<{ id: string; name: string }>; groupCall?: boolean } | undefined;
      try {
        const res = await fetch("/api/calls", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId, kind }),
        });
        const body = (await res.json()) as {
        ok: boolean;
          data?: { call: { id: string; delivered: boolean }; invitees?: Array<{ id: string; name: string }>; groupCall?: boolean };
          error?: string;
        };
        if (!res.ok || !body.ok || !body.data) {
          setCallError(body.error ?? "We couldn't start the call. Please try again.");
          return;
        }
        callData = body.data;
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
        groupCall: Boolean(callData?.groupCall),
        participants: callData?.invitees ?? [],
      });

      let stream: MediaStream;
      try {
        stream = await getCallMedia(kind);
      } catch (error) {
        await decide(callId, "ended").catch(() => {});
        endLocally(micErrorMessage(error));
        return;
      }
      localRef.current = stream;
      setLocalStream(stream);

      try {
        const invitees = callData?.invitees ?? [];
        const peers = invitees.length ? invitees : [{ id: "", name: peerName }];
        const iceServers = await getIceServers();
        let groupAudio: AudioContext | null = null;
        let microphoneSource: MediaStreamAudioSourceNode | null = null;
        if (callData?.groupCall && stream.getAudioTracks().length > 0 && window.AudioContext) {
          try {
            groupAudio = new window.AudioContext();
            await groupAudio.resume();
            microphoneSource = groupAudio.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));
            groupAudioContextRef.current = groupAudio;
          } catch {
            groupAudio = null;
            microphoneSource = null;
          }
        }
        for (const peer of peers) {
          const pc = createPeerConnection(iceServers, () => {});
          peerConnectionsRef.current.set(peer.id, pc);
          peerNamesRef.current.set(peer.id, peer.name);
          if (!pcRef.current) pcRef.current = pc;
          for (const track of stream.getTracks()) pc.addTrack(track, stream);
          if (groupAudio && microphoneSource) {
            const destination = groupAudio.createMediaStreamDestination();
            microphoneSource.connect(destination);
            groupAudioDestinationsRef.current.set(peer.id, destination);
            for (const [sourceId, source] of relayedAudioSourcesRef.current) {
              if (sourceId !== peer.id) source.connect(destination);
            }
            const audioSender = pc.getSenders().find((sender) => sender.track?.kind === "audio");
            const mixedAudio = destination.stream.getAudioTracks()[0];
            if (audioSender && mixedAudio) await audioSender.replaceTrack(mixedAudio);
          }
          attachPeerHandlers(callId, peer.id, pc);
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          const sent = await postSignal(callId, { kind: "offer", toUserId: peer.id || undefined, sdp: offer.sdp ?? "" });
          if (!sent) throw new Error("signaling failed");
        }
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
      groupCall: inv.groupCall,
      participants: inv.participants,
    });

    let stream: MediaStream;
    try {
      stream = await getCallMedia(inv.kind);
    } catch (error) {
      await decide(inv.callId, "ended").catch(() => {});
      endLocally(micErrorMessage(error));
      return;
    }
    localRef.current = stream;
    setLocalStream(stream);

    const pc = createPeerConnection(await getIceServers(), () => {});
    pcRef.current = pc;
    peerConnectionsRef.current.set(inv.callerId, pc);
    peerNamesRef.current.set(inv.callerId, inv.callerName);
    for (const track of stream.getTracks()) pc.addTrack(track, stream);
    attachPeerHandlers(inv.callId, inv.callerId, pc);

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
      await postSignal(inv.callId, { kind: "answer", toUserId: inv.callerId, sdp: answer.sdp ?? "" });
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

  // ---- Ably call-signaling subscriptions (signaling only; media is P2P) ----
  useCallSignaling({
    onInvite: (data: CallInvite) => {
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
        callerId: String((data.caller as { id?: string } | undefined)?.id ?? ""),
        groupCall: Boolean(data.groupCall),
        participants: data.participants ?? [],
      });
      later(() => {
        // Ringing UI expires locally; the caller side still resolves the record.
        if (incomingRef.current?.callId === String(data.callId)) setIncoming(null);
      }, RING_TIMEOUT_MS);
    },
    onOffer: (signal: CallSignal) => {
      // Pre-accept offers are buffered for acceptCall, not dropped.
      if (incomingRef.current?.callId === String(signal.callId) && typeof signal.sdp === "string") {
        pendingOfferRef.current = { type: "offer", sdp: signal.sdp };
      }
    },
    onAnswer: (signal: CallSignal) => {
      if (activeRef.current?.callId !== String(signal.callId)) return;
      const peerId = signal.from ?? "";
      const pc = peerConnectionsRef.current.get(peerId) ?? pcRef.current;
      if (!pc || typeof signal.sdp !== "string") return;
      pc.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp: signal.sdp }))
        .then(() => flushPendingCandidates(peerId))
        .catch(() => {});
      setActive((a) => (a ? { ...a, phase: "connecting" } : a));
      // Media must arrive promptly once the answer is in.
      later(() => {
        const still = activeRef.current;
        if (still && still.callId === String(signal.callId) && still.phase !== "active") {
          decide(String(signal.callId), "ended").catch(() => {});
          endLocally("Media couldn't be established. Check your connection and try again.");
        }
      }, MEDIA_TIMEOUT_MS);
    },
    onCandidate: (signal: CallSignal) => {
      if (typeof signal.candidate !== "string") return;
      const init: RTCIceCandidateInit = {
        candidate: signal.candidate,
        sdpMid: signal.sdpMid,
        sdpMLineIndex: signal.sdpMLineIndex,
      };
      const peerId = signal.from ?? "";
      const pc = peerConnectionsRef.current.get(peerId) ?? pcRef.current;
      if (activeRef.current?.callId === String(signal.callId)) {
        if (pc && pc.remoteDescription) {
          pc.addIceCandidate(new RTCIceCandidate(init)).catch(() => {});
        } else {
          pendingCandidatesRef.current.push(init);
        }
      } else if (incomingRef.current?.callId === String(signal.callId)) {
        pendingCandidatesRef.current.push(init);
      }
    },
    onMediaState: (state) => {
      if (activeRef.current?.callId !== String(state.callId)) return;
      setPeerMedia((prev) => ({
        muted: typeof state.muted === "boolean" ? state.muted : prev.muted,
        cameraOff: typeof state.cameraOff === "boolean" ? state.cameraOff : prev.cameraOff,
      }));
    },
    onAccept: (data) => {
      setActive((a) => (a && data.callId === a.callId ? { ...a, phase: "connecting" } : a));
    },
    onReject: (data) => {
      if (activeRef.current?.callId === data.callId && data.userId) {
        peerConnectionsRef.current.get(data.userId)?.close();
        peerConnectionsRef.current.delete(data.userId);
        remoteStreamsRef.current.delete(data.userId);
        if (peerConnectionsRef.current.size > 0) return;
      }
      if (activeRef.current?.callId === data.callId) {
        endLocally("The call was declined.");
      }
    },
    onEnd: (data) => {
      if (activeRef.current?.callId === data.callId) endLocally();
      if (incomingRef.current?.callId === data.callId) setIncoming(null);
    },
    onMissed: (data) => {
      if (incomingRef.current?.callId === data.callId) setIncoming(null);
    },
    onParticipantLeft: (data) => {
      if (activeRef.current?.callId !== data.callId) return;
      peerConnectionsRef.current.get(data.userId)?.close();
      peerConnectionsRef.current.delete(data.userId);
      remoteStreamsRef.current.delete(data.userId);
      relayedAudioSourcesRef.current.get(data.userId)?.disconnect();
      relayedAudioSourcesRef.current.delete(data.userId);
      groupAudioDestinationsRef.current.get(data.userId)?.stream.getTracks().forEach((track) => track.stop());
      groupAudioDestinationsRef.current.delete(data.userId);
      setRemoteParticipants([...remoteStreamsRef.current.entries()].map(([id, stream]) => ({ id, name: peerNamesRef.current.get(id) ?? "Participant", stream })));
      const combined = new MediaStream();
      for (const remote of remoteStreamsRef.current.values()) for (const track of remote.getTracks()) combined.addTrack(track);
      setRemoteStream(combined);
    },
  });

  // Attach media streams to elements. Remote playback is started
  // explicitly: bare `autoPlay` is blocked when the browser's transient
  // user activation expired while ICE connected, which silences calls
  // with no visible error. A blocked play() surfaces a resume action.
  const playRemote = useCallback(() => {
    setNeedsResume(false);
    const targets = [remoteVideoRef.current, remoteAudioRef.current].filter(
      (el): el is HTMLVideoElement | HTMLAudioElement => el !== null,
    );
    for (const el of targets) {
      const attempt = el.play();
      if (attempt && typeof attempt.catch === "function") {
        attempt.catch(() => setNeedsResume(true));
      }
    }
  }, []);

  useEffect(() => {
    if (localVideoRef.current) localVideoRef.current.srcObject = localStream;
  }, [localStream, active?.callId]);
  useEffect(() => {
    if (!remoteStream) return;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = remoteStream;
    playRemote();
  }, [remoteStream, active?.callId, playRemote]);
  useEffect(() => {
    for (const participant of remoteParticipants) {
      const video = document.getElementById(`call-video-${participant.id}`) as HTMLVideoElement | null;
      if (video) {
        video.srcObject = participant.stream;
        void video.play().catch(() => setNeedsResume(true));
      }
    }
  }, [remoteParticipants, active?.callId]);

  // Microphone device disconnect/reconnect: when the local audio track
  // ends mid-call, re-acquire just the microphone and swap it onto the
  // existing audio sender — no renegotiation needed.
  useEffect(() => {
    if (!active || typeof navigator === "undefined" || !navigator.mediaDevices) return;
    let cancelled = false;
    const recoverMic = async () => {
      const stream = localRef.current;
      const sender = pcRef.current?.getSenders().find((s) => s.track?.kind === "audio");
      const track = stream?.getAudioTracks()[0];
      if (!stream || !sender || (track && track.readyState === "live")) return;
      try {
        const fresh = await getMicrophoneTrack();
        if (cancelled) {
          fresh.stop();
          return;
        }
        if (track) {
          try {
            stream.removeTrack(track);
            track.stop();
          } catch {
            /* already gone */
          }
        }
        stream.addTrack(fresh);
        setTrackEnabled(stream, "audio", !mutedRef.current);
        await sender.replaceTrack(fresh);
        setMicState(mutedRef.current ? "muted" : "live");
        setCallError(null);
      } catch {
        if (!cancelled) {
          setMicState("ended");
          setCallError("Your microphone disconnected and couldn't be recovered. Hang up and call again.");
        }
      }
    };
    const onDevices = () => {
      void recoverMic();
    };
    navigator.mediaDevices.addEventListener("devicechange", onDevices);
    const localTrack = localRef.current?.getAudioTracks()[0];
    const onEnded = () => {
      void recoverMic();
    };
    if (localTrack) localTrack.onended = onEnded;
    return () => {
      cancelled = true;
      navigator.mediaDevices?.removeEventListener("devicechange", onDevices);
      if (localTrack) localTrack.onended = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.callId]);

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
    const callId = activeRef.current?.callId;
    if (callId) postSignal(callId, { kind: "media-state", muted: next }).catch(() => {});
  }

  function toggleCamera(): void {
    const next = !cameraOff;
    setCameraOff(next);
    setTrackEnabled(localRef.current, "video", !next);
    const callId = activeRef.current?.callId;
    if (callId) postSignal(callId, { kind: "media-state", cameraOff: next }).catch(() => {});
  }

  /** Switch between front/back cameras where the device has several. */
  const switchCamera = useCallback(async () => {
    const call = activeRef.current;
    const stream = localRef.current;
    if (!call || call.kind !== "video" || !stream) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = devices.filter((d) => d.kind === "videoinput");
      if (cameras.length < 2) {
        setCallError("Only one camera is available on this device.");
        return;
      }
      const current = stream.getVideoTracks()[0];
      const currentId = current?.getSettings().deviceId;
      const next = cameras.find((c) => c.deviceId && c.deviceId !== currentId) ?? cameras[0];
      const nextStream = await navigator.mediaDevices.getUserMedia({
        video: next.deviceId ? { deviceId: { exact: next.deviceId } } : true,
        audio: false,
      });
      const nextTrack = nextStream.getVideoTracks()[0];
      if (!nextTrack) throw new Error("no track");
      const sender = pcRef.current?.getSenders().find((s) => s.track?.kind === "video");
      await sender?.replaceTrack(nextTrack);
      if (current) {
        stream.removeTrack(current);
        current.stop();
      }
      stream.addTrack(nextTrack);
      nextStream.getTracks().forEach((t) => {
        if (t !== nextTrack) t.stop();
      });
      // Re-attach the preview element to the mutated stream.
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
    } catch {
      setCallError("We couldn't switch cameras on this device.");
    }
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const el = videoWrapRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await el.requestFullscreen();
    } catch {
      /* fullscreen unsupported — the call itself is unaffected */
    }
  }, []);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement !== null);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

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
          <label className="mt-4 flex items-start gap-2 rounded-md border border-neutral-200 bg-neutral-50 p-3 text-sm">
            <input
              type="checkbox"
              checked={transcription.mineConsented}
              disabled={transcription.savingConsent}
              onChange={(event) => void transcription.setConsent(event.currentTarget.checked)}
              className="mt-0.5 h-4 w-4 accent-[#1447e6]"
            />
            <span>
              <span className="font-medium text-black">Allow call transcription</span>
              <span className="mt-0.5 block text-xs text-neutral-600">Optional. It starts only if both people agree. Only transcript text is saved; call audio is processed and discarded.</span>
            </span>
          </label>
          {transcription.error ? <p role="alert" className="mt-2 text-xs text-red-700">{transcription.error}</p> : null}
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" icon="phone-slash" onClick={() => void declineCall()}>
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
                  {peerMedia.muted ? " · peer muted" : ""}
                  {active.kind === "video" && peerMedia.cameraOff ? " · peer camera off" : ""}
                </span>
              </p>
              <p className="flex items-center gap-1.5 text-xs text-neutral-600">
                <span
                  aria-hidden="true"
                  className={`inline-block h-2 w-2 rounded-full ${micState === "live" ? "bg-blue-600" : micState === "muted" ? "bg-blue-500" : "bg-blue-600"}`}
                />
                <span>
                  {micState === "live" ? "Microphone live" : micState === "muted" ? "Microphone muted" : "Microphone unavailable"}
                </span>
              </p>
              {needsResume ? (
                <div className="flex flex-wrap items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2">
                  <p className="text-xs text-blue-900">
                    Your browser paused call audio. Tap resume to hear {active.peerName}.
                  </p>
                  <Button size="sm" icon="play" onClick={playRemote}>
                    Resume sound
                  </Button>
                </div>
              ) : null}
              <p className="font-mono text-xs text-neutral-500">
                {active.role === "caller" ? "outgoing" : "incoming"} · peer-to-peer
              </p>
            </div>

            {active.kind === "video" ? (
              <div ref={videoWrapRef} className={`grid gap-2 bg-white sm:grid-cols-2 lg:grid-cols-3 ${fullscreen ? "h-full content-center p-4" : ""}`}>
                {remoteParticipants.map((participant) => (
                  <div key={participant.id} className="relative overflow-hidden rounded-lg border border-neutral-200 bg-black">
                    <video id={`call-video-${participant.id}`} autoPlay playsInline muted aria-label={`${participant.name} video`} className="aspect-video w-full object-cover" />
                    <span className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-1 text-xs text-white">{participant.name}</span>
                  </div>
                ))}
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

            <div className="flex flex-wrap items-center gap-2">
              <label className="flex min-h-9 items-center gap-2 rounded-md border border-neutral-200 px-3 text-xs">
                <input
                  type="checkbox"
                  checked={transcription.mineConsented}
                  disabled={transcription.savingConsent}
                  onChange={(event) => void transcription.setConsent(event.currentTarget.checked)}
                  className="h-4 w-4 accent-[#1447e6]"
                />
                Allow transcription
              </label>
              <span className="text-xs text-neutral-600" role="status" aria-live="polite">
                {transcription.active ? "Transcription is on" : transcription.peerConsented ? "Waiting for your consent" : "Both people must agree"}
              </span>
              <IconButton
                label={muted ? "Unmute microphone" : "Mute microphone"}
                icon={muted ? "microphone-slash" : "microphone"}
                onClick={toggleMute}
              />
              {active.kind === "video" ? (
                <>
                  <IconButton
                    label={cameraOff ? "Turn camera on" : "Turn camera off"}
                    icon={cameraOff ? "video-slash" : "video"}
                    onClick={toggleCamera}
                  />
                  <IconButton label="Switch camera" icon="camera-rotate" onClick={() => void switchCamera()} />
                  <IconButton
                    label={fullscreen ? "Exit full screen" : "Full-screen video"}
                    icon="expand"
                    onClick={() => void toggleFullscreen()}
                  />
                </>
              ) : null}
              <Button size="sm" variant="danger" icon="phone-slash" onClick={() => void hangup()}>
                Hang up
              </Button>
            </div>
            {callError ? (
              <p role="alert" className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
                {callError}
              </p>
            ) : null}
            {transcription.error ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{transcription.error}</p> : null}
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
