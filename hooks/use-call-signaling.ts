"use client";

import { useEffect } from "react";
import { useAbly } from "@/components/realtime/AblyProvider";

/**
 * Call-signaling subscriptions. Ably carries signaling only — SDP/ICE and
 * lifecycle events arrive on the user's personal channel (auto-joined by
 * the provider); audio/video media stays peer-to-peer WebRTC.
 */

export interface CallSignal {
  callId: string;
  from?: string;
  to?: string;
  sdp?: string;
  candidate?: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
}

export interface CallInvite {
  callId: string;
  conversationId: string;
  kind: string;
  caller?: { name?: string };
  groupCall?: boolean;
  participants?: Array<{ id: string; name: string }>;
}

export interface CallSignalingHandlers {
  onInvite: (invite: CallInvite) => void;
  onAccept: (event: { callId: string; userId?: string }) => void;
  onReject: (event: { callId: string; userId?: string }) => void;
  onEnd: (event: { callId: string }) => void;
  onMissed: (event: { callId: string }) => void;
  onOffer: (signal: CallSignal) => void;
  onAnswer: (signal: CallSignal) => void;
  onCandidate: (signal: CallSignal) => void;
  onMediaState: (state: { callId: string; from?: string; muted?: boolean; cameraOff?: boolean }) => void;
  onParticipantLeft?: (event: { callId: string; userId: string }) => void;
}

export function useCallSignaling(handlers: CallSignalingHandlers): void {
  const { onEvent } = useAbly();
  useEffect(() => {
    const offs = [
      onEvent("call:invite", (p) => handlers.onInvite(p as CallInvite)),
      onEvent("call:accept", (p) => handlers.onAccept(p as { callId: string; userId?: string })),
      onEvent("call:reject", (p) => handlers.onReject(p as { callId: string; userId?: string })),
      onEvent("call:end", (p) => handlers.onEnd(p as { callId: string })),
      onEvent("call:missed", (p) => handlers.onMissed(p as { callId: string })),
      onEvent("webrtc:offer", (p) => handlers.onOffer(p as CallSignal)),
      onEvent("webrtc:answer", (p) => handlers.onAnswer(p as CallSignal)),
      onEvent("webrtc:ice-candidate", (p) => handlers.onCandidate(p as CallSignal)),
      onEvent("call:media-state", (p) =>
        handlers.onMediaState(p as { callId: string; from?: string; muted?: boolean; cameraOff?: boolean }),
      ),
      onEvent("call:participant-left", (p) => handlers.onParticipantLeft?.(p as { callId: string; userId: string })),
    ];
    return () => offs.forEach((off) => off());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onEvent]);
}
