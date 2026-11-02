"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { convertToTranscribableWav } from "@/lib/audio-convert";

interface ConsentState {
  active: boolean;
  mineConsented: boolean;
  peerConsented: boolean;
  consents: Array<{ userId: string; consented: boolean }>;
}

interface UseCallTranscriptionOptions {
  callId: string | null;
  capture: boolean;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
}

/** Persists only transcript text; audio is processed in memory and discarded. */
export function useCallTranscription({ callId, capture, localStream, remoteStream }: UseCallTranscriptionOptions) {
  const [consents, setConsents] = useState<ConsentState>({ active: false, mineConsented: false, peerConsented: false, consents: [] });
  const [savingConsent, setSavingConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const segmentIndex = useRef(0);

  useEffect(() => {
    segmentIndex.current = 0;
    setConsents({ active: false, mineConsented: false, peerConsented: false, consents: [] });
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
        active: body.data!.active,
        mineConsented: body.data!.consented,
        peerConsented: body.data!.peerConsented,
        consents: previous.consents,
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
    if (!callId || !capture || !consents.active || !localStream || !remoteStream || !window.MediaRecorder) return;
    const AudioContextConstructor = window.AudioContext;
    if (!AudioContextConstructor) return;

    let disposed = false;
    let recorder: MediaRecorder | null = null;
    let timer: number | null = null;
    let context: AudioContext | null = null;
    const recordStream = new MediaStream();
    try {
      context = new AudioContextConstructor();
      const destination = context.createMediaStreamDestination();
      for (const stream of [localStream, remoteStream]) {
        if (stream.getAudioTracks().length > 0) context.createMediaStreamSource(stream).connect(destination);
      }
      for (const track of destination.stream.getAudioTracks()) recordStream.addTrack(track);
    } catch {
      setError("Call transcription could not access the call audio mixer.");
      return () => { void context?.close().catch(() => {}); };
    }

    const transcribeChunk = async (blob: Blob) => {
      if (blob.size < 2048) return;
      try {
        const { wav } = await convertToTranscribableWav(blob);
        const form = new FormData();
        form.append("audio", wav, "call-segment.wav");
        form.append("mode", "DIARIZATION");
        const response = await fetch("/api/ai/voice/stream", { method: "POST", body: form });
        const result = (await response.json()) as { ok: boolean; data?: { transcript?: string; turns?: Array<{ turnId?: number; transcript?: string; speaker?: string }> }; error?: string };
        if (!response.ok || !result.ok || !result.data?.transcript) throw new Error(result.error ?? "Call transcription could not process this segment.");
        const turns = (result.data.turns ?? []).filter((turn) => turn.transcript?.trim());
        const segments = (turns.length ? turns : [{ transcript: result.data.transcript }]).map((turn) => ({
          segmentIndex: segmentIndex.current++,
          ...(turn.speaker ? { speaker: turn.speaker } : {}),
          text: turn.transcript!.trim(),
          final: true,
          ...(typeof turn.turnId === "number" ? { turnId: turn.turnId } : {}),
        }));
        const save = await fetch(`/api/calls/${encodeURIComponent(callId)}/transcript`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ segments }),
        });
        const saved = (await save.json()) as { ok: boolean; error?: string };
        if (!save.ok || !saved.ok) throw new Error(saved.error ?? "The transcript could not be saved.");
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Call transcription failed.");
      }
    };

    const startChunk = () => {
      if (disposed) return;
      const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) => MediaRecorder.isTypeSupported(type));
      try {
        recorder = new MediaRecorder(recordStream, mimeType ? { mimeType } : undefined);
      } catch {
        setError("This browser cannot record audio for transcription.");
        return;
      }
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => { if (event.data.size > 0) chunks.push(event.data); };
      recorder.onstop = () => {
        if (chunks.length) void transcribeChunk(new Blob(chunks, { type: recorder?.mimeType || mimeType || "audio/webm" }));
        if (!disposed) startChunk();
      };
      recorder.start();
      timer = window.setTimeout(() => recorder?.state === "recording" && recorder.stop(), 60_000);
    };
    startChunk();

    return () => {
      disposed = true;
      if (timer !== null) window.clearTimeout(timer);
      if (recorder?.state === "recording") recorder.stop();
      recordStream.getTracks().forEach((track) => track.stop());
      void context?.close().catch(() => {});
    };
  }, [callId, capture, consents.active, localStream, remoteStream]);

  return { active: consents.active, mineConsented, peerConsented, savingConsent, error, setConsent };
}
