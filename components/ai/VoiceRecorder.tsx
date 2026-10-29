"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";

/**
 * Reusable voice capture (correction §4).
 * - Explains why microphone access is needed before requesting it.
 * - Records with MediaRecorder, or accepts an audio file instead.
 * - Posts to the given endpoint and surfaces transcript / honesty states.
 * - Never simulates a transcript; failures preserve the recording for retry.
 */

export interface VoiceResultMeta {
  audioRetained?: boolean;
  audioNote?: string;
  pendingReason?: string;
}

export function VoiceRecorder({
  endpoint,
  task = "transcribe",
  docModule = "profile",
  onTranscript,
  disabled = false,
}: {
  endpoint: string;
  task?: string;
  docModule?: string;
  onTranscript: (transcript: string, meta: VoiceResultMeta) => void;
  disabled?: boolean;
}) {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [hasRecording, setHasRecording] = useState(false);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const lastBlobRef = useRef<Blob | null>(null);

  async function submitBlob(blob: Blob) {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("audio", blob, "recording.webm");
      form.append("task", task);
      form.append("module", docModule);
      const res = await fetch(endpoint, { method: "POST", body: form });
      const body = (await res.json()) as {
        ok: boolean;
        data?: {
          pending?: boolean;
          pendingReason?: string;
          transcript?: string;
          record?: { doc?: { transcript?: string } };
          audioRetained?: boolean;
          audioNote?: string;
        };
        error?: string;
      };
      if (!res.ok || !body.ok || !body.data) {
        setError(body.error ?? "Transcription failed. Your recording is kept below — retry when ready.");
        return;
      }
      if (body.data.pending) {
        // Some endpoints transcribe first and then find the next AI step
        // unconfigured — the transcript is still usable.
        if (body.data.transcript) {
          onTranscript(body.data.transcript, {
            audioRetained: body.data.audioRetained,
            audioNote: body.data.audioNote,
            pendingReason: body.data.pendingReason,
          });
          return;
        }
        setError(body.data.pendingReason ?? "Voice transcription is not configured.");
        return;
      }
      const transcript = body.data.transcript ?? body.data.record?.doc?.transcript;
      if (typeof transcript !== "string" || !transcript) {
        setError("Transcription returned no text. Your recording is kept below — retry when ready.");
        return;
      }
      onTranscript(transcript, {
        audioRetained: body.data.audioRetained,
        audioNote: body.data.audioNote,
      });
    } catch {
      setError("Your connection was interrupted. Your recording is kept below — retry when ready.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleRecording() {
    if (recording) {
      mediaRef.current?.stop();
      return;
    }
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        setRecording(false);
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        if (blob.size === 0) return;
        lastBlobRef.current = blob;
        setRecordedUrl(URL.createObjectURL(blob));
        setHasRecording(true);
        await submitBlob(blob);
      };
      mediaRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      setError("Microphone access was denied. You can upload an audio file instead.");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-neutral-600">
        The microphone is used only to capture your voice for transcription. You can also upload
        an audio file instead of recording.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          icon="microphone"
          loading={busy}
          disabled={disabled}
          onClick={toggleRecording}
        >
          {recording ? "Stop recording" : "Record voice"}
        </Button>
        <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-black transition-colors hover:border-black">
          Upload audio
          <input
            type="file"
            accept="audio/webm,audio/mpeg,audio/mp4,audio/wav,audio/ogg"
            className="sr-only"
            disabled={disabled || busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                lastBlobRef.current = file;
                setRecordedUrl(URL.createObjectURL(file));
                setHasRecording(true);
                submitBlob(file);
              }
              e.target.value = "";
            }}
          />
        </label>
        {hasRecording && !busy ? (
          <Button size="sm" variant="ghost" icon="refresh" disabled={disabled} onClick={() => {
            const blob = lastBlobRef.current;
            if (blob) submitBlob(blob);
          }}>
            Retry transcription
          </Button>
        ) : null}
      </div>
      {recording ? (
        <p role="status" className="text-sm font-medium text-brand-700">
          Recording… speak now, then press Stop.
        </p>
      ) : null}
      {recordedUrl ? (
        <audio controls src={recordedUrl} className="mt-1 w-full max-w-md" aria-label="Your recording" />
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
