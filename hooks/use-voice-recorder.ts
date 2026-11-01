"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatAudioDuration } from "@/lib/audio-convert";

/**
 * Single microphone-capture implementation for the whole app (chat voice
 * notes, voice transcription, action dictation). One code path means one
 * behavior: real MediaRecorder capture with pause/resume, a live duration
 * readout, a 10-minute cap matching the transcription limit, preview
 * playback before anything is sent, and honest permission errors.
 *
 * The recorded MIME type always comes from the recorder itself — Safari
 * records MP4, Chromium WebM — so uploads are never mislabeled.
 */

export type VoiceRecorderState = "idle" | "recording" | "paused" | "preview";

export const MAX_VOICE_NOTE_MS = 10 * 60 * 1000;

function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const candidate of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]) {
    try {
      if (MediaRecorder.isTypeSupported(candidate)) return candidate;
    } catch {
      /* try the next candidate */
    }
  }
  return "";
}

export function extensionForMime(mimeType: string): string {
  const base = mimeType.split(";")[0].trim().toLowerCase();
  if (base === "audio/mp4") return "m4a";
  if (base === "audio/ogg") return "ogg";
  if (base === "audio/wav") return "wav";
  if (base === "audio/mpeg") return "mp3";
  return "webm";
}

function micErrorMessage(error: unknown): string {
  if (error instanceof DOMException || error instanceof Error) {
    if (error.name === "NotAllowedError" || error.name === "SecurityError") {
      return "Microphone access was denied. Allow it in your browser settings, or attach an audio file instead.";
    }
    if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
      return "No microphone was found on this device. Attach an audio file instead.";
    }
    if (error.name === "NotReadableError" || error.name === "TrackStartError") {
      return "The microphone is busy in another app. Close it and try again.";
    }
  }
  return "The microphone couldn't start. Attach an audio file instead.";
}

export function useVoiceRecorder() {
  const [state, setState] = useState<VoiceRecorderState>("idle");
  const [durationMs, setDurationMs] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioMime, setAudioMime] = useState("");
  const [error, setError] = useState<string | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const pausedTotalRef = useRef(0);
  const pausedAtRef = useRef(0);
  const tickerRef = useRef<number | null>(null);
  const urlRef = useRef<string | null>(null);
  const cancelledRef = useRef(false);

  const stopTicker = useCallback(() => {
    if (tickerRef.current !== null) {
      window.clearInterval(tickerRef.current);
      tickerRef.current = null;
    }
  }, []);

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch {
        /* already stopped */
      }
    });
    streamRef.current = null;
    mediaRef.current = null;
  }, []);

  const revokeUrl = useCallback(() => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    setAudioUrl(null);
  }, []);

  const stop = useCallback(() => {
    const recorder = mediaRef.current;
    if (!recorder || (recorder.state !== "recording" && recorder.state !== "paused")) return;
    try {
      recorder.stop();
    } catch {
      /* already stopped */
    }
  }, []);

  const start = useCallback(async () => {
    setError(null);
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("Voice recording is unavailable in this browser. Attach an audio file instead.");
      return;
    }
    if (typeof MediaRecorder === "undefined") {
      setError("Voice recording is unavailable in this browser. Attach an audio file instead.");
      return;
    }
    revokeUrl();
    setAudioBlob(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stopTicker();
        releaseStream();
        const wasCancelled = cancelledRef.current;
        cancelledRef.current = false;
        if (wasCancelled) return;
        const actualType = recorder.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: actualType });
        chunksRef.current = [];
        if (blob.size === 0) {
          setError("Nothing was recorded — the microphone produced no audio. Try again.");
          setState("idle");
          return;
        }
        setAudioBlob(blob);
        setAudioMime(actualType);
        const url = URL.createObjectURL(blob);
        urlRef.current = url;
        setAudioUrl(url);
        setState("preview");
      };
      recorder.onerror = () => {
        setError("Recording was interrupted. Try again.");
        setState("idle");
      };
      mediaRef.current = recorder;
      startedAtRef.current = Date.now();
      pausedTotalRef.current = 0;
      setDurationMs(0);
      recorder.start(250);
      setState("recording");
      stopTicker();
      tickerRef.current = window.setInterval(() => {
        const elapsed = Date.now() - startedAtRef.current - pausedTotalRef.current;
        setDurationMs(elapsed);
        if (elapsed >= MAX_VOICE_NOTE_MS) stop();
      }, 250);
      stream.getAudioTracks().forEach((track) => {
        track.onended = () => {
          if (mediaRef.current && mediaRef.current.state !== "inactive") {
            try {
              mediaRef.current.stop();
            } catch {
              /* already stopped */
            }
            setError("The microphone disconnected, so recording stopped.");
          }
        };
      });
    } catch (cause) {
      releaseStream();
      setError(micErrorMessage(cause));
      setState("idle");
    }
  }, [releaseStream, revokeUrl, stop, stopTicker]);

  const pause = useCallback(() => {
    const recorder = mediaRef.current;
    if (!recorder || recorder.state !== "recording") return;
    try {
      recorder.pause();
      pausedAtRef.current = Date.now();
      setState("paused");
    } catch {
      /* unsupported transition */
    }
  }, []);

  const resume = useCallback(() => {
    const recorder = mediaRef.current;
    if (!recorder || recorder.state !== "paused") return;
    try {
      recorder.resume();
      pausedTotalRef.current += Date.now() - pausedAtRef.current;
      setState("recording");
    } catch {
      /* unsupported transition */
    }
  }, []);

  const cancel = useCallback(() => {
    stopTicker();
    cancelledRef.current = true;
    const recorder = mediaRef.current;
    if (recorder && recorder.state !== "inactive") {
      chunksRef.current = [];
      try {
        recorder.stop();
      } catch {
        /* already stopped */
      }
    }
    releaseStream();
    revokeUrl();
    setAudioBlob(null);
    setDurationMs(0);
    setError(null);
    setState("idle");
  }, [releaseStream, revokeUrl, stopTicker]);

  useEffect(
    () => () => {
      stopTicker();
      releaseStream();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [releaseStream, stopTicker],
  );

  return {
    state,
    durationMs,
    durationLabel: formatAudioDuration(durationMs),
    audioUrl,
    audioBlob: state === "preview" ? audioBlob : null,
    audioMime,
    error,
    clearError: () => setError(null),
    start,
    pause,
    resume,
    stop,
    cancel,
  };
}
