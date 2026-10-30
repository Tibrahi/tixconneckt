"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/currency";
import { DynamicValue } from "@/components/dynamic/DynamicValue";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PendingIntegration } from "@/components/ui/Feedback";
import { TextAreaField } from "@/components/ui/Fields";
import { FileUpload } from "@/components/ui/FileUpload";
import { readApi, type ProposedTx } from "./types";

function ReadonlyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-1">
      <dt className="text-xs font-medium tracking-wide text-neutral-600 uppercase">{label}</dt>
      <dd className="text-sm font-medium text-black">{value}</dd>
    </div>
  );
}

/**
 * Transaction evidence intake (wallet.md §2): upload proof or paste a
 * message, review the read-only extracted fields, then submit for
 * verification. Members cannot edit extracted values.
 */
export function DepositIntake({
  onSubmitted,
  onError,
}: {
  onSubmitted: () => void;
  onError: (message: string) => void;
}) {
  const [mode, setMode] = useState<"paste" | "upload">("paste");
  const [pasted, setPasted] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [proposed, setProposed] = useState<ProposedTx | null>(null);
  const [aiPending, setAiPending] = useState<string | null>(null);
  const [extractionFailed, setExtractionFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  function reset(clearInput: boolean) {
    setJobId(null);
    setProposed(null);
    setAiPending(null);
    setExtractionFailed(null);
    setDone(null);
    if (clearInput) setPasted("");
  }

  async function runExtraction(id: string) {
    try {
      const res = await fetch(`/api/documents/jobs/${encodeURIComponent(id)}`, { method: "POST" });
      const data = await readApi<{
        pending?: boolean;
        pendingReason?: string;
        proposed?: ProposedTx;
      }>(res);
      if (data.pending) {
        setAiPending(data.pendingReason ?? "AI parsing is not configured");
        return;
      }
      if (data.proposed) setProposed(data.proposed);
    } catch (error) {
      // Extraction failed but the evidence is saved — offer manual review.
      setExtractionFailed(
        error instanceof Error ? error.message : "Automatic extraction failed for this evidence.",
      );
    }
  }

  async function uploadProof(file: File) {
    reset(false);
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("module", "wallet");
      const res = await fetch("/api/documents", { method: "POST", body: form });
      const data = await readApi<{ documentId: string; jobId: string }>(res);
      setJobId(data.jobId);
      await runExtraction(data.jobId);
    } catch (error) {
      // The evidence may still be saved server-side; surface honestly.
      onError(error instanceof Error ? error.message : "Your connection was interrupted. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function submitPasted() {
    if (!pasted.trim()) return;
    reset(false);
    setBusy(true);
    try {
      const res = await fetch("/api/documents", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: pasted.trim(), module: "wallet" }),
      });
      const data = await readApi<{ jobId: string }>(res);
      setJobId(data.jobId);
      await runExtraction(data.jobId);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Your connection was interrupted. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function submitForVerification() {
    if (!jobId) return;
    setBusy(true);
    try {
      const res = await fetch("/api/wallet/self-funding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parsingJobId: jobId }),
      });
      const data = await readApi<{ reference?: string; queuedForManualReview?: boolean }>(res);
      if (data.queuedForManualReview) {
        setDone("manual");
      } else {
        setDone(data.reference ?? "submitted");
      }
      setProposed(null);
      setAiPending(null);
      onSubmitted();
    } catch (error) {
      onError(error instanceof Error ? error.message : "We couldn't submit this evidence. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      title="Deposit"
      subtitle="Upload proof or paste a transaction message. Extracted details are read-only and verified by a reviewer."
    >
      {done ? (
        <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          {done === "manual"
            ? "Your evidence was saved and queued for manual review. A reviewer will verify it against the original proof."
            : `Submitted for verification as ${done}. Your balance updates only after a reviewer approves it.`}{" "}
          <button
            type="button"
            className="font-semibold underline"
            onClick={() => {
              reset(true);
            }}
          >
            Submit another
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div role="tablist" aria-label="Evidence type" className="flex gap-1 border-b border-neutral-200">
            {(["paste", "upload"] as const).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                onClick={() => {
                  setMode(m);
                  reset(false);
                }}
                className={`px-3 py-2 text-sm font-medium ${
                  mode === m ? "border-b-2 border-brand-600 text-brand-700" : "text-black hover:text-brand-700"
                }`}
              >
                {m === "paste" ? "Paste message" : "Upload proof"}
              </button>
            ))}
          </div>

          {mode === "paste" ? (
            <>
              <TextAreaField
                label="Transaction message"
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                placeholder="e.g. You have received 50,000 RWF from …"
              />
              <div>
                <Button variant="secondary" size="sm" loading={busy} disabled={!pasted.trim()} onClick={submitPasted}>
                  Extract details
                </Button>
              </div>
            </>
          ) : (
            <FileUpload label="Screenshot, image, PDF, or receipt (max 10 MB)" onSelect={uploadProof} />
          )}

          {aiPending ? (
            <div className="flex flex-col gap-2">
              <PendingIntegration name="AI document parsing" detail={aiPending} />
              <p className="text-sm text-neutral-600">
                Your evidence was saved. You can still submit it — a reviewer will verify it manually.
              </p>
              <div>
                <Button size="sm" variant="secondary" loading={busy} disabled={!jobId} onClick={submitForVerification}>
                  Submit for manual review
                </Button>
              </div>
            </div>
          ) : null}

          {extractionFailed ? (
            <div className="flex flex-col gap-2 rounded-md border border-amber-200 bg-amber-50 p-3">
              <p className="text-sm font-medium text-amber-800">{extractionFailed}</p>
              <p className="text-sm text-neutral-600">
                Your evidence was saved. Submit it for manual review and a reviewer will verify the original proof.
              </p>
              <div>
                <Button size="sm" variant="secondary" loading={busy} disabled={!jobId} onClick={submitForVerification}>
                  Submit for manual review
                </Button>
              </div>
            </div>
          ) : null}

          {proposed ? (
            <div className="rounded-md border border-neutral-200 p-3">
              <p className="mb-2 text-sm font-semibold text-black">Extracted fields (read-only)</p>
              <dl className="divide-y divide-neutral-100">
                <ReadonlyRow label="Amount" value={formatMoney(proposed.amountMinor, proposed.currency)} />
                {proposed.reference ? <ReadonlyRow label="Transaction reference" value={proposed.reference} /> : null}
                {proposed.sender ? <ReadonlyRow label="Sender" value={proposed.sender} /> : null}
                {proposed.recipient ? <ReadonlyRow label="Recipient" value={proposed.recipient} /> : null}
                {proposed.provider ? <ReadonlyRow label="Provider" value={proposed.provider} /> : null}
                {proposed.occurredAt ? (
                  <ReadonlyRow label="Date" value={new Date(proposed.occurredAt).toLocaleString("en-US")} />
                ) : null}
                {proposed.paymentStatus ? <ReadonlyRow label="Payment status" value={proposed.paymentStatus} /> : null}
                {proposed.extractionConfidence !== undefined ? (
                  <ReadonlyRow
                    label="Extraction confidence"
                    value={`${Math.round(proposed.extractionConfidence * 100)}%`}
                  />
                ) : null}
              </dl>
              {proposed.extractionConfidence !== undefined && proposed.extractionConfidence < 0.6 ? (
                <p className="mt-2 text-xs font-medium text-amber-800">
                  Low extraction confidence — a reviewer will verify this against the original proof.
                </p>
              ) : null}
              {!proposed.reference || !proposed.sender || !proposed.provider ? (
                <p className="mt-1 text-xs text-neutral-600">
                  Some verification details are missing from the extraction. A reviewer will confirm them manually.
                </p>
              ) : null}
              {proposed.extra && Object.keys(proposed.extra).length > 0 ? (
                <div className="mt-2">
                  <p className="mb-1 text-xs font-semibold tracking-wide text-neutral-600 uppercase">
                    Other details found in the evidence
                  </p>
                  <DynamicValue doc={proposed.extra} />
                </div>
              ) : null}
              <div className="mt-3">
                <Button loading={busy} onClick={submitForVerification}>
                  Submit for verification
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </Card>
  );
}
