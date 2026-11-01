"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { convertToTranscribableWav } from "@/lib/audio-convert";
import { useVoiceRecorder } from "@/hooks/use-voice-recorder";

/**
 * Reusable voice capture (correction §4).
 * - Explains why microphone access is needed before requesting it.
 * - Records with the shared capture hook (pause/resume, duration, preview),
 *   or accepts an audio file instead.
 * - Converts to transcribable WAV in-browser, then posts to the endpoint.
 * - Surfaces transcript / honesty states; failures preserve audio for retry.
 * - Never simulates a transcript.
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
  const voice = useVoiceRecorder();
  const [busy, setBusy] = useState(false);
  const [converting, setConverting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [lastConvertible, setLastConvertible] = useState<Blob | null>(null);
  const [submitted, setSubmitted] = useState(false);

  async function submitBlob(blob: Blob) {
    setSubmitted(true);
    setBusy(true);
    setConverting(true);
    setError(null);
    try {
      // The transcription endpoint only accepts mono 16-bit PCM WAV:
      // convert recordings and uploads alike before sending.
      const { wav } = await convertToTranscribableWav(blob);
      setConverting(false);
      const form = new FormData();
      form.append("audio", wav, "recording.wav");
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
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Your connection was interrupted. Your recording is kept below — retry when ready.",
      );
    } finally {
      setConverting(false);
      setBusy(false);
    }
  }

  function retry() {
    const blob = voice.audioBlob ?? lastConvertible;
    if (blob) void submitBlob(blob);
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-neutral-600">
        The microphone is used only to capture your voice for transcription. You can also upload
        an audio file instead of recording.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {voice.state === "idle" || voice.state === "preview" ? (
          <Button
            size="sm"
            variant="secondary"
            icon="microphone"
            loading={busy}
            disabled={disabled}
            onClick={() => {
              setError(null);
              setFileUrl(null);
              setLastConvertible(null);
              setSubmitted(false);
              void voice.start();
            }}
          >
            Record voice
          </Button>
        ) : (
          <>
            <span role="status" className="text-sm font-medium text-brand-700">
              {voice.state === "paused" ? "Paused" : "Recording"} · {voice.durationLabel}
            </span>
            {voice.state === "recording" ? (
              <Button size="sm" variant="secondary" disabled={disabled} onClick={voice.pause}>
                Pause
              </Button>
            ) : (
              <Button size="sm" variant="secondary" disabled={disabled} onClick={voice.resume}>
                Resume
              </Button>
            )}
            <Button size="sm" disabled={disabled} onClick={voice.stop}>
              Stop
            </Button>
            <Button size="sm" variant="ghost" disabled={disabled} onClick={voice.cancel}>
              Cancel
            </Button>
          </>
        )}
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
                voice.cancel();
                setLastConvertible(file);
                setFileUrl(URL.createObjectURL(file));
                setSubmitted(false);
                submitBlob(file);
              }
              e.target.value = "";
            }}
          />
        </label>
        {(voice.state === "preview" || lastConvertible) && !busy ? (
          <Button
            size="sm"
            variant={submitted ? "ghost" : "primary"}
            icon={submitted ? "refresh" : undefined}
            disabled={disabled}
            onClick={() => {
              if (voice.state === "preview" && voice.audioBlob) {
                setLastConvertible(voice.audioBlob);
                submitBlob(voice.audioBlob);
              } else {
                retry();
              }
            }}
          >
            {submitted ? "Retry transcription" : "Transcribe recording"}
          </Button>
        ) : null}
      </div>
      {converting ? (
        <p role="status" className="text-sm text-neutral-600">
          Preparing audio for transcription…
        </p>
      ) : null}
      {voice.audioUrl ? (
        <audio controls src={voice.audioUrl} className="mt-1 w-full max-w-md" aria-label="Your recording" />
      ) : fileUrl ? (
        <audio controls src={fileUrl} className="mt-1 w-full max-w-md" aria-label="Uploaded audio" />
      ) : null}
      {voice.error ? (
        <p role="alert" className="text-sm text-blue-700">
          {voice.error}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-blue-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
