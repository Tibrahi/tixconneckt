"use client";

import { useCallback, useEffect, useState } from "react";
import { formatMoney } from "@/lib/currency";
import { Button } from "@/components/ui/Button";
import { Card, StatusBadge } from "@/components/ui/Card";
import { EmptyState, SkeletonList } from "@/components/ui/Feedback";
import { TextAreaField, TextField } from "@/components/ui/Fields";
import { readApi } from "./types";

interface QueueEntry {
  id: string;
  reference: string;
  direction: string;
  amountMinor: number;
  currency: string;
  status: string;
  metadata: Record<string, unknown> | null;
  documentId: string | null;
  createdBy: string | null;
  createdAt: string;
  uploaderName: string | null;
  uploaderShortId: string | null;
}

interface ManualJob {
  id: string;
  documentId: string | null;
  inputText: string | null;
  error: string | null;
  requestedBy: string;
  createdAt: string;
  uploaderName: string | null;
  uploaderShortId: string | null;
}

function meta(entry: QueueEntry, key: string): string | null {
  const v = entry.metadata?.[key];
  return typeof v === "string" && v ? v : null;
}

function EvidenceButton({ documentId, onError }: { documentId: string | null; onError: (m: string) => void }) {
  const [busy, setBusy] = useState(false);
  if (!documentId) return null;
  return (
    <Button
      size="sm"
      variant="secondary"
      icon="eye"
      loading={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const res = await fetch(`/api/documents/${encodeURIComponent(documentId)}/url`);
          const data = await readApi<{ url: string }>(res);
          window.open(data.url, "_blank", "noopener,noreferrer");
        } catch (error) {
          onError(error instanceof Error ? error.message : "Evidence is unavailable right now.");
        } finally {
          setBusy(false);
        }
      }}
    >
      View evidence
    </Button>
  );
}

function QueueCard({
  entry,
  onDecided,
  onError,
}: {
  entry: QueueEntry;
  onDecided: () => void;
  onError: (m: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function decide(decision: "approved" | "rejected" | "needs_evidence") {
    if ((decision === "rejected" || decision === "needs_evidence") && !reason.trim()) {
      onError(
        decision === "rejected"
          ? "A reason is required when rejecting a transaction."
          : "Describe what additional evidence is needed.",
      );
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/wallet/reviews", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryId: entry.id, decision, reason: reason.trim() || undefined }),
      });
      await readApi(res);
      setReason("");
      onDecided();
    } catch (error) {
      onError(error instanceof Error ? error.message : "We couldn't record this decision. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const confidence = entry.metadata?.extractionConfidence;
  const missing = entry.metadata?.extractionMissing;

  return (
    <li className="rounded-md border border-neutral-200 p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-xs text-neutral-600">{entry.reference}</span>
        <StatusBadge status={entry.status} />
      </div>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
        <span>
          {entry.uploaderName ?? "Member"}
          {entry.uploaderShortId ? ` · ${entry.uploaderShortId}` : ""} ·{" "}
          {new Date(entry.createdAt).toLocaleString("en-US")}
        </span>
        <span className="font-mono font-semibold text-green-700">
          +{formatMoney(entry.amountMinor, entry.currency)}
        </span>
      </div>
      <dl className="mt-2 grid gap-x-6 gap-y-1 text-xs text-neutral-600 sm:grid-cols-2">
        {meta(entry, "providerReference") ? <div>Provider ref: <span className="font-mono text-black">{meta(entry, "providerReference")}</span></div> : null}
        {meta(entry, "sender") ? <div>Sender: <span className="text-black">{meta(entry, "sender")}</span></div> : null}
        {meta(entry, "recipient") ? <div>Recipient: <span className="text-black">{meta(entry, "recipient")}</span></div> : null}
        {meta(entry, "provider") ? <div>Provider: <span className="text-black">{meta(entry, "provider")}</span></div> : null}
        {meta(entry, "paymentStatus") ? <div>Payment status: <span className="text-black">{meta(entry, "paymentStatus")}</span></div> : null}
        {typeof confidence === "number" ? <div>Confidence: <span className="text-black">{Math.round(confidence * 100)}%</span></div> : null}
      </dl>
      {Array.isArray(missing) && missing.length > 0 ? (
        <p className="mt-1 text-xs font-medium text-amber-800">
          Missing from extraction: {missing.join(", ")} — verify against the proof.
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-2">
        <EvidenceButton documentId={entry.documentId} onError={onError} />
      </div>
      <div className="mt-2 flex flex-col gap-2">
        <TextAreaField
          label="Decision note (required to reject or request evidence)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Receipt is cropped — the transaction reference is unreadable."
        />
        <div className="flex flex-wrap gap-2">
          <Button size="sm" icon="check" loading={busy} onClick={() => decide("approved")}>
            Approve & credit
          </Button>
          <Button size="sm" variant="secondary" loading={busy} onClick={() => decide("needs_evidence")}>
            Request evidence
          </Button>
          <Button size="sm" variant="danger" loading={busy} onClick={() => decide("rejected")}>
            Reject
          </Button>
        </div>
      </div>
    </li>
  );
}

function ManualCreditCard({
  job,
  onCredited,
  onError,
}: {
  job: ManualJob;
  onCredited: () => void;
  onError: (m: string) => void;
}) {
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("RWF");
  const [reference, setReference] = useState("");
  const [sender, setSender] = useState("");
  const [recipient, setRecipient] = useState("");
  const [provider, setProvider] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function credit() {
    const minor = Math.round(Number(amount) * 100);
    if (!Number.isInteger(minor) || minor <= 0) {
      onError("Enter the verified positive amount from the evidence.");
      return;
    }
    if (note.trim().length < 3) {
      onError("Add a verification note describing what you confirmed.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/wallet/reviews/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parsingJobId: job.id,
          verified: {
            amountMinor: minor,
            currency: currency.toUpperCase(),
            direction: "credit",
            reference: reference.trim() || undefined,
            sender: sender.trim() || undefined,
            recipient: recipient.trim() || undefined,
            provider: provider.trim() || undefined,
          },
          reason: note.trim(),
        }),
      });
      await readApi(res);
      onCredited();
    } catch (error) {
      onError(error instanceof Error ? error.message : "We couldn't verify this evidence. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded-md border border-amber-200 bg-amber-50/40 p-3 text-sm">
      <p className="font-medium text-black">
        {job.uploaderName ?? "Member"}
        {job.uploaderShortId ? ` · ${job.uploaderShortId}` : ""} · {new Date(job.createdAt).toLocaleString("en-US")}
      </p>
      <p className="mt-1 text-xs text-neutral-600">{job.error ?? "Automatic extraction failed."}</p>
      {job.inputText ? (
        <blockquote className="mt-2 rounded border border-neutral-200 bg-white p-2 text-xs whitespace-pre-wrap">
          {job.inputText}
        </blockquote>
      ) : null}
      <div className="mt-2">
        <EvidenceButton documentId={job.documentId} onError={onError} />
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        <TextField label="Verified amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <TextField label="Currency" value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={3} />
        <TextField label="Provider reference" value={reference} onChange={(e) => setReference(e.target.value)} />
        <TextField label="Sender" value={sender} onChange={(e) => setSender(e.target.value)} />
        <TextField label="Recipient" value={recipient} onChange={(e) => setRecipient(e.target.value)} />
        <TextField label="Provider" value={provider} onChange={(e) => setProvider(e.target.value)} />
      </div>
      <div className="mt-2">
        <TextAreaField label="Verification note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What did you confirm on the original proof?" />
      </div>
      <div className="mt-2">
        <Button size="sm" loading={busy} onClick={credit}>
          Verify & credit
        </Button>
      </div>
    </li>
  );
}

/** Independent review queue for deposits (wallet.md FR-04). Reviewers only. */
export function ReviewQueue({ onError }: { onError: (m: string) => void }) {
  const [entries, setEntries] = useState<QueueEntry[] | null>(null);
  const [manualJobs, setManualJobs] = useState<ManualJob[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/wallet/reviews", { cache: "no-store" });
      const data = await readApi<{ entries: QueueEntry[]; manualJobs: ManualJob[] }>(res);
      setEntries(data.entries);
      setManualJobs(data.manualJobs);
    } catch (error) {
      onError(error instanceof Error ? error.message : "We couldn't load the review queue.");
    }
  }, [onError]);

  useEffect(() => {
    load();
  }, [load]);

  if (entries === null) return <SkeletonList rows={3} />;

  return (
    <div className="flex flex-col gap-4">
      <Card title="Deposits awaiting review" subtitle="Verify the proof before approving. You cannot review your own transactions.">
        {entries.length === 0 ? (
          <EmptyState icon="check-double" title="Queue is clear" message="No deposits are waiting for review." />
        ) : (
          <ul className="flex flex-col gap-3">
            {entries.map((e) => (
              <QueueCard key={e.id} entry={e} onDecided={load} onError={onError} />
            ))}
          </ul>
        )}
      </Card>
      <Card title="Manual verification" subtitle="Evidence automatic extraction could not read. Verify the original proof, then record the verified values.">
        {manualJobs.length === 0 ? (
          <p className="text-sm text-neutral-600">Nothing needs manual verification.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {manualJobs.map((j) => (
              <ManualCreditCard key={j.id} job={j} onCredited={load} onError={onError} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
