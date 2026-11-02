"use client";

import { useCallback, useEffect, useState } from "react";
import { formatCallDuration } from "@/lib/call-transcript";
import { formatDateTime } from "@/lib/currency";
import { DynamicValue } from "@/components/dynamic/DynamicValue";
import { Badge } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState, LoadError, SkeletonList } from "@/components/ui/Feedback";
import { Icon } from "@/components/ui/Icon";

interface HistoryCall {
  id: string;
  kind: string;
  status: string;
  callerId: string;
  calleeId: string;
  callerName: string;
  createdAt: string;
  answeredAt: string | null;
  endedAt: string | null;
  failureReason: string | null;
  durationMs: number | null;
  transcriptSegments: number;
  transcriptActive: boolean;
  hidden: boolean;
}

interface TranscriptSegment {
  segmentIndex: number;
  speaker: string | null;
  text: string;
  final: boolean;
}

interface DialogueLine {
  segmentIndex: number;
  speaker: string | null;
  text: string;
  final: boolean;
  who: string;
  name: string | null;
}

interface StoredInterpretation {
  id: string;
  result: unknown;
  model: string;
  segmentCount: number;
  createdBy: string;
  createdAt: string;
}

interface TranscriptDetail {
  segments: TranscriptSegment[];
  dialogue: DialogueLine[];
  interpretation: StoredInterpretation | null;
  active: boolean;
  canControl: boolean;
  consents: Array<{ userId: string; consented: boolean; updatedAt: string }>;
}

function outcomeTone(status: string): "success" | "warning" | "danger" | "info" | "neutral" {
  if (status === "ended") return "success";
  if (status === "missed" || status === "declined") return "warning";
  if (status === "failed") return "danger";
  if (status === "accepted" || status === "ringing") return "info";
  return "neutral";
}

/**
 * Calls/Video history for one direct conversation — separate from messages.
 * Shows missed, declined, failed, and ended calls with outcome, duration,
 * per-call transcription consent, and participant-only transcripts.
 */
export function CallHistory({
  conversationId,
  myUserId,
  peerName,
  onError,
}: {
  conversationId: string;
  myUserId: string;
  peerName: string;
  onError: (m: string) => void;
}) {
  const [calls, setCalls] = useState<HistoryCall[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<TranscriptDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [consentBusy, setConsentBusy] = useState(false);
  const [hideBusy, setHideBusy] = useState<string | null>(null);
  const [deleteArmed, setDeleteArmed] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const res = await fetch(
        `/api/calls?conversationId=${encodeURIComponent(conversationId)}${showHidden ? "&showHidden=1" : ""}`,
        { cache: "no-store" },
      );
      const body = (await res.json()) as { ok: boolean; data?: { calls: HistoryCall[] }; error?: string };
      if (!res.ok || !body.ok || !body.data) throw new Error(body.error ?? "Could not load call history.");
      setCalls(body.data.calls);
    } catch (error) {
      setFailed(true);
      onError(error instanceof Error ? error.message : "Could not load call history.");
    }
  }, [conversationId, showHidden, onError]);

  useEffect(() => {
    load();
  }, [load]);

  async function openDetail(callId: string) {
    if (expanded === callId) {
      setExpanded(null);
      setDetail(null);
      return;
    }
    setExpanded(callId);
    setDetail(null);
    setDeleteArmed(false);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/calls/${encodeURIComponent(callId)}/transcript`, { cache: "no-store" });
      const body = (await res.json()) as { ok: boolean; data?: TranscriptDetail; error?: string };
      if (!res.ok || !body.ok || !body.data) throw new Error(body.error ?? "Could not load the transcript.");
      setDetail(body.data);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not load the transcript.");
      setExpanded(null);
    } finally {
      setDetailLoading(false);
    }
  }

  async function setConsent(callId: string, consented: boolean) {
    setConsentBusy(true);
    try {
      const res = await fetch(`/api/calls/${encodeURIComponent(callId)}/transcript/consent`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consented }),
      });
      const body = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !body.ok) throw new Error(body.error ?? "Could not update consent.");
      await openDetailRefresh(callId);
      load();
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not update consent.");
    } finally {
      setConsentBusy(false);
    }
  }

  async function openDetailRefresh(callId: string) {
    try {
      const res = await fetch(`/api/calls/${encodeURIComponent(callId)}/transcript`, { cache: "no-store" });
      const body = (await res.json()) as { ok: boolean; data?: TranscriptDetail };
      if (res.ok && body.ok && body.data) setDetail(body.data);
    } catch {
      /* refresh is best-effort; the last loaded state stays visible */
    }
  }

  // Live transcript: while a call's details stay open, new segments and
  // interpretations stream in instead of sitting static.
  useEffect(() => {
    if (!expanded) return;
    const id = window.setInterval(() => void openDetailRefresh(expanded), 4000);
    return () => window.clearInterval(id);
  }, [expanded]);

  async function setHidden(callId: string, hidden: boolean) {
    setHideBusy(callId);
    try {
      const res = await fetch(`/api/calls/${encodeURIComponent(callId)}/hide`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hidden }),
      });
      const body = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !body.ok) throw new Error(body.error ?? "Could not update visibility.");
      load();
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not update visibility.");
    } finally {
      setHideBusy(null);
    }
  }

  async function deleteTranscript(callId: string) {
    if (!deleteArmed) {
      setDeleteArmed(true);
      return;
    }
    try {
      const res = await fetch(`/api/calls/${encodeURIComponent(callId)}/transcript`, { method: "DELETE" });
      const body = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !body.ok) throw new Error(body.error ?? "Could not delete the transcript.");
      setDeleteArmed(false);
      await openDetailRefresh(callId);
      load();
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not delete the transcript.");
    }
  }

  if (failed) return <LoadError onRetry={load} />;
  if (!calls) return <SkeletonList rows={3} />;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-neutral-600">
          Calls with {peerName}. Missed, declined, and failed calls always stay visible.
        </p>
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showHidden}
            onChange={(e) => setShowHidden(e.target.checked)}
            className="h-4 w-4 accent-brand-600"
          />
          Show ended calls I hid
        </label>
      </div>

      {calls.length === 0 ? (
        <EmptyState
          icon="phone"
          title="No calls yet"
          message={showHidden ? "No calls in this conversation." : "No calls yet — or every ended call is hidden. Toggle above to review hidden calls."}
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {calls.map((call) => {
            const outgoing = call.callerId === myUserId;
            const isOpen = expanded === call.id;
            return (
              <li key={call.id} className="rounded-md border border-neutral-200 bg-white p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span aria-hidden="true" className="text-neutral-600">
                    <Icon name={call.kind === "video" ? "video" : "phone"} />
                  </span>
                  <span className="text-sm font-medium text-black">
                    {outgoing ? "Outgoing" : "Incoming"} {call.kind} call
                  </span>
                  <Badge tone={outcomeTone(call.status)}>{call.status}</Badge>
                  {call.transcriptSegments > 0 ? (
                    <Badge tone="info">{call.transcriptSegments} transcript segment{call.transcriptSegments === 1 ? "" : "s"}</Badge>
                  ) : null}
                  {call.transcriptActive ? <Badge tone="info">transcribing</Badge> : null}
                  {call.hidden ? <Badge>hidden</Badge> : null}
                  <span className="ml-auto font-mono text-xs text-neutral-600">
                    {formatDateTime(call.createdAt, "UTC")} · {formatCallDuration(call.durationMs)}
                  </span>
                </div>
                {call.failureReason ? (
                  <p className="mt-1.5 text-sm text-blue-700">{call.failureReason}</p>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => openDetail(call.id)}>
                    {isOpen ? "Close details" : "Details & transcript"}
                  </Button>
                  {(call.status === "accepted" || call.status === "ended") && !call.hidden ? (
                    <Button size="sm" variant="ghost" loading={hideBusy === call.id} onClick={() => setHidden(call.id, true)}>
                      Hide
                    </Button>
                  ) : null}
                  {call.hidden ? (
                    <Button size="sm" variant="ghost" loading={hideBusy === call.id} onClick={() => setHidden(call.id, false)}>
                      Show
                    </Button>
                  ) : null}
                </div>

                {isOpen ? (
                  <div className="mt-3 border-t border-neutral-200 pt-3">
                    {detailLoading || !detail ? (
                      <p className="text-sm text-neutral-600">Loading details…</p>
                    ) : (
                      <CallDetail
                        call={call}
                        detail={detail}
                        myUserId={myUserId}
                        peerName={peerName}
                        consentBusy={consentBusy}
                        deleteArmed={deleteArmed}
                        onConsent={(consented) => setConsent(call.id, consented)}
                        onDelete={() => deleteTranscript(call.id)}
                        onInterpreted={() => openDetailRefresh(call.id)}
                        onError={onError}
                      />
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function CallDetail({
  call,
  detail,
  myUserId,
  peerName,
  consentBusy,
  deleteArmed,
  onConsent,
  onDelete,
  onInterpreted,
  onError,
}: {
  call: HistoryCall;
  detail: TranscriptDetail;
  myUserId: string;
  peerName: string;
  consentBusy: boolean;
  deleteArmed: boolean;
  onConsent: (consented: boolean) => void;
  onDelete: () => void;
  onInterpreted: () => void;
  onError: (m: string) => void;
}) {
  const isCaller = call.callerId === myUserId;
  const switchOn = detail.active;
  const live = call.status === "ringing" || call.status === "accepted";
  const [interpreting, setInterpreting] = useState(false);
  const [interpretNote, setInterpretNote] = useState<string | null>(null);

  async function runInterpret() {
    setInterpreting(true);
    setInterpretNote(null);
    try {
      const res = await fetch(`/api/calls/${encodeURIComponent(call.id)}/transcript/interpret`, { method: "POST" });
      const body = (await res.json()) as { ok: boolean; data?: { pending?: boolean; pendingReason?: string }; error?: string };
      if (!res.ok || !body.ok) throw new Error(body.error ?? "The assistant is unavailable right now.");
      if (body.data?.pending) {
        setInterpretNote(body.data.pendingReason ?? "The assistant is unavailable right now.");
        return;
      }
      onInterpreted();
    } catch (error) {
      onError(error instanceof Error ? error.message : "The assistant is unavailable right now.");
    } finally {
      setInterpreting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3">
        <p className="text-sm font-medium text-black">
          Transcription {switchOn ? "is on" : "is off"}
          {switchOn ? " · every voice is saved as text" : ""}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-neutral-600">
          {isCaller
            ? "You started this call, so this switch is yours. Turning it off stops further saving at once; already-saved text stays until someone deletes it."
            : `Only ${peerName} (who started this call) can turn transcription on or off. Already-saved text stays until someone deletes it.`}{" "}
          No call audio is ever stored.
        </p>
        {isCaller ? (
          <div className="mt-2">
            <Button size="sm" variant="secondary" loading={consentBusy} onClick={() => onConsent(!switchOn)}>
              Turn transcription {switchOn ? "off" : "on"}
            </Button>
          </div>
        ) : null}
        {live && !switchOn ? (
          <p className="mt-2 text-xs text-blue-800">This call is live but transcription is off — nothing is being saved.</p>
        ) : null}
      </div>

      {detail.dialogue.length === 0 ? (
        <p className="text-sm text-neutral-600">No transcript saved for this call.</p>
      ) : (
        <>
          <div>
            <p className="mb-1 text-sm font-medium text-black">What everyone said</p>
            <ol className="flex max-h-72 flex-col gap-2 overflow-y-auto">
              {detail.dialogue.map((line) => (
                <li key={line.segmentIndex} className="rounded-md border border-neutral-200 p-2 text-sm">
                  <p className="text-xs font-semibold text-brand-700">
                    {line.who}
                    {line.name ? <span className="ml-1 font-medium text-neutral-600">{line.name}</span> : null}
                  </p>
                  <p className="text-black">{line.text}</p>
                  {!line.final ? <p className="text-xs text-neutral-500">Partial — still processing.</p> : null}
                </li>
              ))}
            </ol>
          </div>
          <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3">
            <p className="text-sm font-medium text-black">Conversation interpretation</p>
            {detail.interpretation ? (
              <>
                <div className="mt-2 rounded-md border border-neutral-200 bg-white p-2">
                  <DynamicValue doc={detail.interpretation.result} />
                </div>
                <p className="mt-1 font-mono text-[11px] text-neutral-500">
                  {detail.interpretation.model} · {detail.interpretation.segmentCount} segments ·{" "}
                  {new Date(detail.interpretation.createdAt).toLocaleString("en-US")}
                </p>
              </>
            ) : (
              <p className="mt-1 text-xs text-neutral-600">
                No interpretation stored yet. Run one to summarize what everyone said together.
              </p>
            )}
            <div className="mt-2">
              <Button size="sm" variant="secondary" loading={interpreting} onClick={runInterpret}>
                {detail.interpretation ? "Re-interpret conversation" : "Interpret conversation"}
              </Button>
            </div>
            {interpretNote ? <p className="mt-1 text-xs text-blue-800">{interpretNote}</p> : null}
          </div>
          <div>
            <Button size="sm" variant="danger" onClick={onDelete}>
              {deleteArmed ? "Click again to delete the transcript" : "Delete transcript"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
