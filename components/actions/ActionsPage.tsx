"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
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

interface Proposal {
  kind: string;
  title: string;
  payload: Record<string, unknown>;
  scheduledFor?: string;
  timezone?: string;
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

const WORKFLOW_EXAMPLE = `[
  {"kind": "message", "title": "Kickoff", "payload": {"conversationId": "…", "body": "Meeting starts now."}},
  {"kind": "reminder", "payload": {"text": "Share the meeting notes"}}
]`;

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export function ActionsPage() {
  const [items, setItems] = useState<ActionItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [instruction, setInstruction] = useState("");
  const [interpreting, setInterpreting] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [aiPending, setAiPending] = useState<string | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [proposalLocal, setProposalLocal] = useState(false);
  const [proposalNotes, setProposalNotes] = useState<string[]>([]);

  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
  const [kind, setKind] = useState("reminder");
  const [title, setTitle] = useState("");
  const [reminderText, setReminderText] = useState("");
  const [messageConv, setMessageConv] = useState("");
  const [messageBody, setMessageBody] = useState("");
  const [phone, setPhone] = useState("");
  const [profileName, setProfileName] = useState("");
  const [country, setCountry] = useState("");
  const [extraFields, setExtraFields] = useState<Record<string, unknown>>({});
  const [workflowNote, setWorkflowNote] = useState("");
  const [workflowSteps, setWorkflowSteps] = useState("");
  const [when, setWhen] = useState("");
  const [timezone, setTimezone] = useState(browserTz);
  const [scheduling, setScheduling] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Array<{ id: string; title: string }>>([]);
  const idempotencyRef = useRef(crypto.randomUUID());
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

  function clearForm() {
    setTitle("");
    setReminderText("");
    setMessageConv("");
    setMessageBody("");
    setPhone("");
    setProfileName("");
    setCountry("");
    setExtraFields({});
    setWorkflowNote("");
    setWorkflowSteps("");
    setWhen("");
    setEditingId(null);
    idempotencyRef.current = crypto.randomUUID();
  }

  /** Fill the review form from an interpreted or edited action payload. */
  function fillFromPayload(pKind: string, pTitle: string, payload: Record<string, unknown>) {
    setKind(pKind);
    setTitle(pTitle);
    if (pKind === "reminder") {
      setReminderText(str(payload.text));
    } else if (pKind === "message") {
      setMessageConv(str(payload.conversationId));
      setMessageBody(str(payload.body));
    } else if (pKind === "profile_update") {
      const fields = (payload.fields ?? {}) as Record<string, unknown>;
      setPhone(str(fields.phone));
      setProfileName(str(fields.name));
      setCountry(str(fields.country));
      const rest = { ...fields };
      delete rest.phone;
      delete rest.name;
      delete rest.country;
      setExtraFields(rest);
    } else if (pKind === "workflow") {
      setWorkflowNote(str(payload.note));
      setWorkflowSteps(payload.steps !== undefined ? JSON.stringify(payload.steps, null, 2) : "");
    }
  }

  function fillWhen(isoUtc: string, tz: string) {
    const d = new Date(isoUtc);
    if (Number.isNaN(d.getTime())) return;
    setTimezone(tz);
    setWhen(formatInTimeZone(d, tz, "yyyy-MM-dd'T'HH:mm"));
  }

  async function interpret() {
    if (!instruction.trim()) return;
    setInterpreting(true);
    setAiPending(null);
    setProposal(null);
    setProposalNotes([]);
    setTranscript(null);
    try {
      const res = await fetch("/api/actions/interpret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: instruction.trim(), timezone: browserTz }),
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: {
          pending?: boolean;
          pendingReason?: string;
          transcript?: string;
          local?: boolean;
          proposal?: Proposal;
          notes?: string[];
        };
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
      setProposalLocal(body.data.local === true);
      setProposalNotes(body.data.notes ?? []);
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
          form.append("timezone", browserTz);
          const res = await fetch("/api/actions/interpret", { method: "POST", body: form });
          const body = (await res.json()) as {
            ok: boolean;
            data?: {
              pending?: boolean;
              pendingReason?: string;
              transcript?: string;
              local?: boolean;
              proposal?: Proposal;
              notes?: string[];
            };
            error?: string;
          };
          if (res.ok && body.ok && body.data) {
            if (body.data.pending) {
              setAiPending(body.data.pendingReason ?? "Voice transcription is not configured");
            } else {
              setTranscript(body.data.transcript ?? null);
              setProposal(body.data.proposal ?? null);
              setProposalLocal(body.data.local === true);
              setProposalNotes(body.data.notes ?? []);
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
    fillFromPayload(proposal.kind, proposal.title, proposal.payload);
    if (proposal.scheduledFor) {
      fillWhen(proposal.scheduledFor, proposal.timezone ?? timezone);
    } else if (proposal.timezone) {
      setTimezone(proposal.timezone);
    }
    setProposal(null);
    setProposalNotes([]);
  }

  /** Build the validated payload for the current kind, or report the problem. */
  function buildPayload(): { payload?: Record<string, unknown>; problem?: string } {
    if (kind === "reminder") {
      if (!reminderText.trim()) return { problem: "Reminders need text." };
      return { payload: { text: reminderText.trim() } };
    }
    if (kind === "message") {
      if (!messageConv) return { problem: "Choose the conversation to message." };
      if (!messageBody.trim()) return { problem: "Message text cannot be empty." };
      return { payload: { conversationId: messageConv, body: messageBody.trim() } };
    }
    if (kind === "profile_update") {
      const fields: Record<string, unknown> = { ...extraFields };
      if (phone.trim()) fields.phone = phone.trim();
      if (profileName.trim()) fields.name = profileName.trim();
      if (country.trim()) fields.country = country.trim();
      if (Object.keys(fields).length === 0) {
        return { problem: "Profile actions need at least one field to change." };
      }
      return { payload: { fields } };
    }
    const payload: Record<string, unknown> = {};
    if (workflowNote.trim()) payload.note = workflowNote.trim();
    if (workflowSteps.trim()) {
      try {
        payload.steps = JSON.parse(workflowSteps) as unknown;
      } catch {
        return { problem: "The workflow steps must be valid JSON." };
      }
    }
    return { payload };
  }

  function parseWhen(): { utc?: Date; problem?: string } {
    if (!when) return { problem: "Choose when this should run." };
    let utc: Date;
    try {
      utc = fromZonedTime(when, timezone);
    } catch {
      return { problem: "The scheduled time or timezone is invalid." };
    }
    if (utc.getTime() <= Date.now()) return { problem: "Schedule a time in the future." };
    return { utc };
  }

  async function schedule() {
    const built = buildPayload();
    if (built.problem || !built.payload) {
      setError(built.problem ?? "Review every field before scheduling.");
      return;
    }
    const parsed = parseWhen();
    if (parsed.problem || !parsed.utc) {
      setError(parsed.problem ?? "Choose when this should run.");
      return;
    }
    if (!title.trim()) {
      setError("Give this action a title.");
      return;
    }
    setScheduling(true);
    try {
      if (editingId) {
        const res = await fetch("/api/actions", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            actionId: editingId,
            decision: "edit",
            title: title.trim(),
            payload: built.payload,
            scheduledFor: parsed.utc.toISOString(),
            timezone,
          }),
        });
        const body = (await res.json()) as { ok: boolean; error?: string };
        if (!res.ok || !body.ok) {
          setError(body.error ?? "We couldn't save these changes. Please try again.");
          return;
        }
      } else {
        const res = await fetch("/api/actions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind,
            title: title.trim(),
            payload: built.payload,
            scheduledFor: parsed.utc.toISOString(),
            timezone,
            idempotencyKey: idempotencyRef.current,
          }),
        });
        const body = (await res.json()) as { ok: boolean; error?: string };
        if (!res.ok || !body.ok) {
          setError(body.error ?? "We couldn't schedule this action. Please try again.");
          return;
        }
      }
      clearForm();
      setInstruction("");
      setTranscript(null);
      load();
    } catch {
      setError("Your connection was interrupted. Please try again.");
    } finally {
      setScheduling(false);
    }
  }

  function startEdit(a: ActionItem) {
    fillFromPayload(a.kind, a.title, a.payload);
    fillWhen(a.scheduledFor, a.timezone);
    setEditingId(a.id);
  }

  async function cancel(actionId: string) {
    try {
      const res = await fetch("/api/actions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionId, decision: "cancel" }),
      });
      if (!res.ok) throw new Error();
      if (editingId === actionId) clearForm();
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
              <p className="mb-1 text-sm font-medium">
                Proposed action — review before applying:
                {proposalLocal ? (
                  <span className="ml-2 text-xs font-normal text-neutral-600">(interpreted on this device)</span>
                ) : null}
              </p>
              {proposalNotes.length > 0 ? (
                <ul className="mb-2 flex flex-col gap-0.5">
                  {proposalNotes.map((n, i) => (
                    <li key={i} className="text-xs font-medium text-amber-800">
                      {n}
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="max-h-64 overflow-auto">
                <DynamicValue doc={proposal as unknown as Record<string, unknown>} />
              </div>
              <div className="mt-2 flex gap-2">
                <Button size="sm" onClick={applyProposal}>
                  Apply to form
                </Button>
                <Button size="sm" variant="secondary" onClick={() => { setProposal(null); setProposalNotes([]); }}>
                  Discard
                </Button>
              </div>
            </div>
          ) : null}
        </Card>

        <Card title={editingId ? "2. Edit scheduled action" : "2. Review and schedule"}>
          <div className="flex flex-col gap-3">
            {editingId ? (
              <p className="text-xs text-neutral-600">
                Editing a pending action. The type cannot change — cancel and recreate to change it.
              </p>
            ) : (
              <SelectField
                label="Type"
                value={kind}
                onChange={(e) => setKind(e.target.value)}
                options={[
                  { value: "reminder", label: "Reminder" },
                  { value: "message", label: "Scheduled message" },
                  { value: "profile_update", label: "Profile update" },
                  { value: "workflow", label: "Workflow" },
                ]}
              />
            )}
            <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
            {kind === "reminder" ? (
              <TextAreaField label="Reminder text" value={reminderText} onChange={(e) => setReminderText(e.target.value)} placeholder="Call the group" />
            ) : null}
            {kind === "message" ? (
              <>
                <SelectField
                  label="Conversation"
                  value={messageConv}
                  onChange={(e) => setMessageConv(e.target.value)}
                  options={[
                    { value: "", label: conversations.length > 0 ? "Choose a conversation" : "No conversations found" },
                    ...conversations.map((c) => ({ value: c.id, label: `${c.title} (${c.id.slice(0, 8)})` })),
                  ]}
                />
                <TextAreaField label="Message" value={messageBody} onChange={(e) => setMessageBody(e.target.value)} placeholder="Hello group!" />
              </>
            ) : null}
            {kind === "profile_update" ? (
              <>
                <TextField label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+250…" />
                <div className="grid gap-3 sm:grid-cols-2">
                  <TextField label="Name" value={profileName} onChange={(e) => setProfileName(e.target.value)} />
                  <TextField label="Country" value={country} onChange={(e) => setCountry(e.target.value)} />
                </div>
                {Object.keys(extraFields).length > 0 ? (
                  <p className="text-xs text-neutral-600">
                    Additional proposed fields ({Object.keys(extraFields).join(", ")}) will be kept as interpreted.
                  </p>
                ) : null}
              </>
            ) : null}
            {kind === "workflow" ? (
              <>
                <TextField label="Note" value={workflowNote} onChange={(e) => setWorkflowNote(e.target.value)} placeholder="Prepare the meeting agenda" />
                <TextAreaField
                  label="Steps (JSON, optional)"
                  value={workflowSteps}
                  onChange={(e) => setWorkflowSteps(e.target.value)}
                  placeholder={WORKFLOW_EXAMPLE}
                  hint="Up to 5 steps. Each step is a message, reminder, or profile update that runs in order."
                />
              </>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label="Date and time" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
              <SelectField
                label="Timezone"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                options={(TIMEZONES.includes(timezone) ? TIMEZONES : [timezone, ...TIMEZONES]).map((t) => ({ value: t, label: t }))}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button loading={scheduling} disabled={!title.trim()} onClick={schedule}>
                {editingId ? "Save changes" : "Confirm and schedule"}
              </Button>
              {editingId ? (
                <Button variant="secondary" onClick={clearForm}>
                  Stop editing
                </Button>
              ) : null}
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
                    {a.executedAt ? ` · ran ${formatDateTime(a.executedAt, a.timezone)}` : ""}
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
                    <div className="mt-2 flex gap-2">
                      <Button size="sm" variant="secondary" icon="pen" onClick={() => startEdit(a)}>
                        Edit
                      </Button>
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
