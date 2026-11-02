"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { convertToTranscribableWav } from "@/lib/audio-convert";

interface ConsentState {
  active: boolean;
  mineConsented: boolean;
  peerConsented: boolean;
  /** True when the viewer is the caller — the only one who can toggle. */
  canControl: boolean;
  controlledBy: string | null;
  consents: Array<{ userId: string; consented: boolean }>;
}

interface UseCallTranscriptionOptions {
  callId: string | null;
  capture: boolean;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  /** Peer user id for 1:1 calls — tags the remote channel. Null in groups. */
  peerUserId: string | null;
}

/** 30s per channel: dialogue appears while people are still talking. */
const CHUNK_MS = 30_000;

/** Persists only transcript text; audio is processed in memory and discarded. */
export function useCallTranscription({ callId, capture, localStream, remoteStream, peerUserId }: UseCallTranscriptionOptions) {
  const [consents, setConsents] = useState<ConsentState>({
    active: false,
    mineConsented: false,
    peerConsented: false,
    canControl: false,
    controlledBy: null,
    consents: [],
  });
  const [savingConsent, setSavingConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const segmentIndex = useRef(0);

  useEffect(() => {
    segmentIndex.current = 0;
    setConsents({
      active: false,
      mineConsented: false,
      peerConsented: false,
      canControl: false,
      controlledBy: null,
      consents: [],
    });
    setError(null);
    if (!callId) return;

    let stopped = false;
    const refresh = async () => {
      try {
        const response = await fetch(`/api/calls/${encodeURIComponent(callId)}/transcript`, { cache: "no-store" });
        const body = (await response.json()) as { ok: boolean; data?: ConsentState; error?: string };
        if (!response.ok || !body.ok || !body.data) throw new Error(body.error ?? "Could not load call transcription status.");
        if (!stopped) setConsents(body.data);
      } catch (cause) {
        if (!stopped && cause instanceof Error) setError(cause.message);
      }
    };
    void refresh();
    const interval = window.setInterval(() => void refresh(), 4000);
    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, [callId]);

  // Own identity tags the local channel — one cheap call per call.
  useEffect(() => {
    let active = true;
    setMyUserId(null);
    if (!callId) return;
    fetch("/api/profile", { cache: "no-store" })
      .then(async (res) => {
        const body = (await res.json()) as { ok: boolean; data?: { id: string } };
        if (active && res.ok && body.ok && body.data) setMyUserId(body.data.id);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [callId]);

  const mineConsented = consents.mineConsented;
  const peerConsented = consents.peerConsented;

  const setConsent = useCallback(async (consented: boolean) => {
    if (!callId) return false;
    setSavingConsent(true);
    setError(null);
    try {
      const response = await fetch(`/api/calls/${encodeURIComponent(callId)}/transcript/consent`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consented }),
      });
      const body = (await response.json()) as { ok: boolean; data?: { consented: boolean; active: boolean; peerConsented: boolean }; error?: string };
      if (!response.ok || !body.ok || !body.data) throw new Error(body.error ?? "Could not update transcription consent.");
      setConsents((previous) => ({
        ...previous,
        active: body.data!.active,
        mineConsented: body.data!.consented,
        peerConsented: body.data!.peerConsented,
      }));
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update transcription consent.");
      return false;
    } finally {
      setSavingConsent(false);
    }
  }, [callId]);

  useEffect(() => {
    if (!callId || !capture || !consents.active || !myUserId || !window.MediaRecorder) return;
    if (!localStream && !remoteStream) return;

    let disposed = false;
    const timers: number[] = [];
    const recorders: MediaRecorder[] = [];

    const transcribeChunk = async (blob: Blob, speaker: string | null) => {
      if (blob.size < 2048) return; // silence — nothing to transcribe
      const call = callId;
      try {
        const { wav } = await convertToTranscribableWav(blob);
        const form = new FormData();
        form.append("audio", wav, "call-segment.wav");
        form.append("context", "call");
        const response = await fetch("/api/ai/voice/stream", { method: "POST", body: form });
        const result = (await response.json()) as { ok: boolean; data?: { transcript?: string; turns?: Array<{ turnId?: number; transcript?: string; speaker?: string }> }; error?: string };
        // Silent or unintelligible chunk: skip quietly, never error the UI.
        if (!response.ok || !result.ok || !result.data?.transcript?.trim()) return;
        const turns = (result.data.turns ?? []).filter((turn) => turn.transcript?.trim());
        const sources = turns.length ? turns : [{ transcript: result.data.transcript }];
        // Synchronous block: index assignment stays race-free across channels.
        const segments = sources.map((turn) => ({
          segmentIndex: segmentIndex.current++,
          ...((turn.speaker ?? speaker) ? { speaker: (turn.speaker ?? speaker) as string } : {}),
          text: turn.transcript!.trim(),
          final: true,
          ...(typeof turn.turnId === "number" ? { turnId: turn.turnId } : {}),
        }));
        const save = await fetch(`/api/calls/${encodeURIComponent(call)}/transcript`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ segments }),
        });
        // 409 = the caller switched transcription off mid-flight: stop quietly.
        if (save.status === 409) return;
        const saved = (await save.json()) as { ok: boolean; error?: string };
        if (!save.ok || !saved.ok) throw new Error(saved.error ?? "The transcript could not be saved.");
      } catch (cause) {
        if (!disposed) setError(cause instanceof Error ? cause.message : "Call transcription failed.");
      }
    };

    const startChannel = (stream: MediaStream, speaker: string | null) => {
      if (stream.getAudioTracks().length === 0) return;
      const loop = () => {
        if (disposed) return;
        const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) => MediaRecorder.isTypeSupported(type));
        let recorder: MediaRecorder;
        try {
          recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        } catch {
          setError("This browser cannot record audio for transcription.");
          return;
        }
        recorders.push(recorder);
        const chunks: Blob[] = [];
        recorder.ondataavailable = (event) => { if (event.data.size > 0) chunks.push(event.data); };
        recorder.onstop = () => {
          if (chunks.length) void transcribeChunk(new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" }), speaker);
          if (!disposed) loop();
        };
        recorder.start();
        timers.push(window.setTimeout(() => recorder.state === "recording" && recorder.stop(), CHUNK_MS));
      };
      loop();
    };

    // Continue after the last saved index so a reload never overwrites history.
    let cancelled = false;
    fetch(`/api/calls/${encodeURIComponent(callId)}/transcript`, { cache: "no-store" })
      .then(async (res) => {
        const body = (await res.json()) as { ok: boolean; data?: { segments?: Array<{ segmentIndex: number }> } };
        if (!cancelled && res.ok && body.ok && body.data?.segments?.length) {
          segmentIndex.current = Math.max(...body.data.segments.map((s) => s.segmentIndex)) + 1;
        }
      })
      .catch(() => {})
      .finally(() => {
        if (cancelled || disposed) return;
        if (localStream) startChannel(localStream, myUserId);
        if (remoteStream) startChannel(remoteStream, peerUserId);
      });

    return () => {
      disposed = true;
      cancelled = true;
      for (const id of timers) window.clearTimeout(id);
      for (const recorder of recorders) {
        if (recorder.state === "recording") {
          try {
            recorder.stop();
          } catch {
            /* already stopped */
          }
        }
      }
    };
  }, [callId, capture, consents.active, localStream, remoteStream, myUserId, peerUserId]);

  return {
    active: consents.active,
    mineConsented,
    peerConsented,
    canControl: consents.canControl,
    savingConsent,
    error,
    setConsent,
  };
}
