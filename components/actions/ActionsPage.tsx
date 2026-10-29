"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fromZonedTime } from "date-fns-tz";
import { formatDateTime } from "@/lib/currency";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, StatusBadge } from "@/components/ui/Card";
import { EmptyState, LoadError, PendingIntegration, SkeletonList } from "@/components/ui/Feedback";
import { Button } from "@/components/ui/Button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/Fields";
import { ErrorDialog } from "@/components/ui/Modal";
import { DynamicValue } from "@/components/dynamic/DynamicValue";

interface ActionItem {
  id: string;
  kind: string;
  title: string;
  payload: Record<string, unknown>;
  scheduledFor: string;
  timezone: string;
  status: string;
  attempts: number;
  lastError: string | null;
  executedAt: string | null;
  history: Array<{ outcome: string | null; detail: string | null; startedAt: string }>;
}

const TIMEZONES = [
  "UTC",
  "Africa/Kigali",
  "Africa/Nairobi",
  "Africa/Lagos",
  "Africa/Cairo",
  "Europe/London",
  "Europe/Paris",
  "America/New_York",
  "Asia/Dubai",
  "Asia/Kolkata",
];

export function ActionsPage() {
  const [items, setItems] = useState<ActionItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [instruction, setInstruction] = useState("");
  const [interpreting, setInterpreting] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [aiPending, setAiPending] = useState<string | null>(null);
  const [proposal, setProposal] = useState<{
    kind: string;
    title: string;
    payload: Record<string, unknown>;
    scheduledFor?: string;
    timezone?: string;
  } | null>(null);

  const [kind, setKind] = useState("reminder");
  const [title, setTitle] = useState("");
  const [payloadText, setPayloadText] = useState("");
  const [when, setWhen] = useState("");
  const [timezone, setTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC",
  );
  const [scheduling, setScheduling] = useState(false);
  const [conversations, setConversations] = useState<Array<{ id: string; title: string }>>([]);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const res = await fetch("/api/actions", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const body = (await res.json()) as { ok: boolean; data?: ActionItem[] };
      if (!body.ok || !body.data) throw new Error();
      setItems(body.data);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    load();
    fetch("/api/chat", { cache: "no-store" })
      .then((r) => r.json())
      .then((b: { ok: boolean; data?: { individual: Array<{ id: string; title: string }>; group: Array<{ id: string; title: string }> } }) => {
        if (b.ok && b.data) setConversations([...b.data.individual, ...b.data.group]);
      })
      .catch(() => {});
  }, [load]);

  async function interpret() {
    if (!instruction.trim()) return;
    setInterpreting(true);
    setAiPending(null);
    setProposal(null);
    setTranscript(null);
    try {
      const res = await fetch("/api/actions/interpret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: instruction.trim() }),
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { pending?: boolean; pendingReason?: string; transcript?: string; proposal?: typeof proposal };
        error?: string;
      };
      if (!res.ok || !body.ok || !body.data) {
        setError(body.error ?? "The assistant is unavailable. Fill the form manually.");
        return;
      }
      if (body.data.pending) {
        setAiPending(body.data.pendingReason ?? "AI assistant is not configured");
        if (body.data.transcript) setTranscript(body.data.transcript);
        return;
      }
      setTranscript(body.data.transcript ?? null);
      setProposal(body.data.proposal ?? null);
    } catch {
      setError("Your connection was interrupted. Please try again.");
    } finally {
      setInterpreting(false);
    }
  }

  async function toggleRecording() {
    if (recording) {
      mediaRef.current?.stop();
      return;
    }
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
        setInterpreting(true);
        try {
          const form = new FormData();
          form.append("audio", blob, "instruction.webm");
          const res = await fetch("/api/actions/interpret", { method: "POST", body: form });
          const body = (await res.json()) as {
            ok: boolean;
            data?: { pending?: boolean; pendingReason?: string; transcript?: string; proposal?: typeof proposal };
            error?: string;
          };
          if (res.ok && body.ok && body.data) {
            if (body.data.pending) {
              setAiPending(body.data.pendingReason ?? "Voice transcription is not configured");
            } else {
              setTranscript(body.data.transcript ?? null);
              setProposal(body.data.proposal ?? null);
            }
          } else {
            setError(body.error ?? "Transcription failed.");
          }
        } catch {
          setError("Your connection was interrupted. Please try again.");
        } finally {
          setInterpreting(false);
        }
      };
      mediaRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      setError("Microphone access was denied. Type your instruction instead.");
    }
  }

  function applyProposal() {
    if (!proposal) return;
    setKind(proposal.kind);
    setTitle(proposal.title);
    setPayloadText(JSON.stringify(proposal.payload, null, 2));
    if (proposal.timezone) setTimezone(proposal.timezone);
    if (proposal.scheduledFor) {
      const d = new Date(proposal.scheduledFor);
      if (!Number.isNaN(d.getTime())) {
        setWhen(d.toISOString().slice(0, 16));
      }
    }
    setProposal(null);
  }

  async function schedule() {
    let payload: Record<string, unknown>;
    try {
      payload = payloadText.trim() ? (JSON.parse(payloadText) as Record<string, unknown>) : {};
    } catch {
      setError("The details must be valid JSON.");
      return;
    }
    if (!when) {
      setError("Choose when this should run.");
      return;
    }
    let utc: Date;
    try {
      utc = fromZonedTime(when, timezone);
    } catch {
      setError("The scheduled time or timezone is invalid.");
      return;
    }
    if (utc.getTime() <= Date.now()) {
      setError("Schedule a time in the future.");
      return;
    }
    setScheduling(true);
    try {
      const res = await fetch("/api/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, title: title.trim(), payload, scheduledFor: utc.toISOString(), timezone }),
      });
      const body = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !body.ok) {
        setError(body.error ?? "We couldn't schedule this action. Please try again.");
        return;
      }
      setTitle("");
      setPayloadText("");
      setWhen("");
      setInstruction("");
      setTranscript(null);
      load();
    } catch {
      setError("Your connection was interrupted. Please try again.");
    } finally {
      setScheduling(false);
    }
  }

  async function cancel(actionId: string) {
    try {
      const res = await fetch("/api/actions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionId, decision: "cancel" }),
      });
      if (!res.ok) throw new Error();
      load();
    } catch {
      setError("We couldn't cancel this action. Please try again.");
    }
  }

  if (failed) {
    return (
      <>
        <PageHeader title="Action" />
        <LoadError onRetry={load} />
      </>
    );
  }
  if (!items) {
    return (
      <>
        <PageHeader title="Action" />
        <SkeletonList rows={3} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Action"
        description="Describe what should happen and when. Actions run on the server — your device can be off."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="1. Describe the instruction">
          <TextAreaField
            label="Instruction"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="Remind me to call the group tomorrow at 9am Kigali time"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" loading={interpreting} disabled={!instruction.trim()} onClick={interpret}>
              Interpret
            </Button>
            <Button size="sm" variant="secondary" icon="microphone" onClick={toggleRecording}>
              {recording ? "Stop recording" : "Record voice"}
            </Button>
          </div>
          <p className="mt-2 text-xs text-neutral-600">
            Recording asks for microphone access only to capture your instruction for transcription.
            The audio is kept privately with your account when storage is configured.
          </p>
          {transcript ? (
            <p className="mt-3 rounded-md border border-neutral-200 bg-white p-2 text-sm">
              Heard: {transcript}
            </p>
          ) : null}
          {aiPending ? (
            <div className="mt-3">
              <PendingIntegration name="AI interpretation" detail={aiPending} />
            </div>
          ) : null}
          {proposal ? (
            <div className="mt-3 rounded-md border border-brand-200 bg-brand-50 p-3">
              <p className="mb-1 text-sm font-medium">Proposed action — review before applying:</p>
              <div className="max-h-64 overflow-auto">
                <DynamicValue doc={proposal as unknown as Record<string, unknown>} />
              </div>
              <div className="mt-2 flex gap-2">
                <Button size="sm" onClick={applyProposal}>
                  Apply to form
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setProposal(null)}>
                  Discard
                </Button>
              </div>
            </div>
          ) : null}
        </Card>

        <Card title="2. Review and schedule">
          <div className="flex flex-col gap-3">
            <SelectField
              label="Type"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              options={[
                { value: "reminder", label: "Reminder" },
                { value: "message", label: "Scheduled message" },
                { value: "profile_update", label: "Profile update" },
                { value: "workflow", label: "Workflow note" },
              ]}
            />
            <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
            <TextAreaField
              label="Details (JSON)"
              value={payloadText}
              onChange={(e) => setPayloadText(e.target.value)}
              placeholder={
                kind === "message"
                  ? '{"conversationId": "…", "body": "Hello group!"}'
                  : kind === "profile_update"
                    ? '{"fields": {"phone": "+250…"}}'
                    : kind === "reminder"
                      ? '{"text": "Call the group"}'
                      : '{"note": "Prepare the meeting agenda"}'
              }
            />
            {kind === "message" && conversations.length > 0 ? (
              <p className="text-xs text-neutral-600">
                Your conversations: {conversations.map((c) => `${c.title} (${c.id.slice(0, 8)})`).join(" · ")}
              </p>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label="Date and time" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
              <SelectField
                label="Timezone"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                options={TIMEZONES.map((t) => ({ value: t, label: t }))}
              />
            </div>
            <div>
              <Button loading={scheduling} disabled={!title.trim()} onClick={schedule}>
                Confirm and schedule
              </Button>
            </div>
          </div>
        </Card>

        <Card title={`Scheduled (${items.length})`} className="lg:col-span-2">
          {items.length === 0 ? (
            <EmptyState icon="bolt" title="No actions" message="Interpret an instruction above, review it, and schedule it." />
          ) : (
            <ul className="flex flex-col gap-2">
              {items.map((a) => (
                <li key={a.id} className="rounded-md border border-neutral-200 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{a.title}</span>
                    <StatusBadge status={a.status} />
                  </div>
                  <p className="mt-1 font-mono text-xs text-neutral-600">
                    {a.kind} · {formatDateTime(a.scheduledFor, a.timezone)} ({a.timezone}) · attempts: {a.attempts}
                  </p>
                  {a.lastError ? <p className="mt-1 text-sm text-red-700">{a.lastError}</p> : null}
                  {a.history.length > 0 ? (
                    <ul className="mt-1 flex flex-col gap-0.5">
                      {a.history.map((t, i) => (
                        <li key={i} className="text-xs text-neutral-600">
                          {t.outcome ?? "running"} — {t.detail ?? "…"}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {["draft", "confirmed"].includes(a.status) ? (
                    <div className="mt-2">
                      <Button size="sm" variant="secondary" onClick={() => cancel(a.id)}>
                        Cancel
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      {error ? <ErrorDialog message={error} onClose={() => setError(null)} /> : null}
    </>
  );
}
