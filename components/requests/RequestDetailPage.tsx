"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ROUTES } from "@/lib/routes";
import { formatMoney } from "@/lib/currency";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, StatusBadge } from "@/components/ui/Card";
import { EmptyState, LoadError, SkeletonList } from "@/components/ui/Feedback";
import { Button } from "@/components/ui/Button";
import { TextAreaField, TextField } from "@/components/ui/Fields";
import { ErrorDialog, Modal } from "@/components/ui/Modal";

interface Detail {
  request: {
    id: string;
    status: string;
    amountMinor: number;
    currency: string;
    message: string | null;
    requesterType: string;
  };
  project: {
    id: string;
    title: string;
    summary: string;
    details: string | null;
    detailsHidden: boolean;
    stage: string;
    visibility: string;
  };
  provider: { id: string; name: string; shortId: string } | null;
  agreements: Array<{
    id: string;
    version: number;
    title: string;
    terms: string | null;
    status: string;
    createdAt: string;
  }>;
  viewer: { requesterSide: boolean; providerSide: boolean };
}

export function RequestDetailPage({ requestId }: { requestId: string }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agreeOpen, setAgreeOpen] = useState(false);
  const [agreeTitle, setAgreeTitle] = useState("");
  const [agreeTerms, setAgreeTerms] = useState("");

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const res = await fetch(`/api/requests/${encodeURIComponent(requestId)}`, { cache: "no-store" });
      if (!res.ok) throw new Error();
      const body = (await res.json()) as { ok: boolean; data?: Detail };
      if (!body.ok || !body.data) throw new Error();
      setDetail(body.data);
    } catch {
      setFailed(true);
    }
  }, [requestId]);

  useEffect(() => {
    load();
  }, [load]);

  async function review(decision: "under_review" | "approved" | "rejected") {
    try {
      const res = await fetch(`/api/requests/${encodeURIComponent(requestId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const body = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !body.ok) {
        setError(body.error ?? "We couldn't record your review. Please try again.");
        return;
      }
      load();
    } catch {
      setError("Your connection was interrupted. Please try again.");
    }
  }

  async function draftAgreement() {
    try {
      const res = await fetch(`/api/requests/${encodeURIComponent(requestId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: agreeTitle.trim(), terms: agreeTerms.trim() || undefined }),
      });
      const body = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !body.ok) {
        setError(body.error ?? "We couldn't save this agreement. Please try again.");
        return;
      }
      setAgreeOpen(false);
      setAgreeTitle("");
      setAgreeTerms("");
      load();
    } catch {
      setError("Your connection was interrupted. Please try again.");
    }
  }

  async function decideAgreement(agreementId: string, decision: "accepted" | "rejected") {
    try {
      const res = await fetch(`/api/requests/${encodeURIComponent(requestId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agreementId, decision }),
      });
      const body = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !body.ok) {
        setError(body.error ?? "We couldn't record your decision. Please try again.");
        return;
      }
      load();
    } catch {
      setError("Your connection was interrupted. Please try again.");
    }
  }

  if (failed) {
    return (
      <>
        <PageHeader title="Request" />
        <LoadError message="We couldn't open this request. You may not have access." onRetry={load} />
      </>
    );
  }
  if (!detail) {
    return (
      <>
        <PageHeader title="Request" />
        <SkeletonList rows={3} />
      </>
    );
  }

  const latestPending = detail.agreements.find((a) => a.status === "pending");

  return (
    <>
      <PageHeader
        title={detail.project.title}
        description={
          <>
            <span className="font-mono font-semibold">{formatMoney(detail.request.amountMinor, detail.request.currency)}</span>
            {" · "}
            {detail.request.requesterType} request
            {detail.provider ? ` · Provider: ${detail.provider.name}` : ""}
          </>
        }
        actions={<StatusBadge status={detail.request.status} />}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Project summary">
          <p className="text-sm">{detail.project.summary}</p>
          {detail.project.detailsHidden ? (
            <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">
              Private project details are hidden at this stage. They become visible when an agreement
              is accepted.
            </p>
          ) : detail.project.details ? (
            <p className="mt-3 whitespace-pre-wrap text-sm">{detail.project.details}</p>
          ) : null}
          {detail.viewer.requesterSide ? (
            <p className="mt-3 text-sm">
              <Link href={ROUTES.projectById(detail.project.id)} className="font-medium text-brand-700 hover:underline">
                Open full project
              </Link>
            </p>
          ) : null}
          {detail.request.message ? (
            <p className="mt-3 text-sm text-neutral-600">Requester note: {detail.request.message}</p>
          ) : null}
        </Card>

        {detail.viewer.providerSide && ["pending", "under_review"].includes(detail.request.status) ? (
          <Card title="Provider review">
            <p className="mb-3 text-sm text-neutral-600">
              Reviewing is not funding. Funding is released only when the requester accepts an agreement.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => review("under_review")}>
                Mark under review
              </Button>
              <Button size="sm" icon="check" onClick={() => review("approved")}>
                Approve
              </Button>
              <Button size="sm" variant="danger" onClick={() => review("rejected")}>
                Reject
              </Button>
            </div>
          </Card>
        ) : null}

        <Card
          title="Agreements"
          className="lg:col-span-2"
          actions={
            detail.viewer.providerSide && ["pending", "under_review", "approved"].includes(detail.request.status) ? (
              <Button size="sm" variant="secondary" onClick={() => setAgreeOpen(true)}>
                Draft new version
              </Button>
            ) : undefined
          }
        >
          {detail.agreements.length === 0 ? (
            <EmptyState icon="file-contract" title="No agreements yet" message="The provider drafts the agreement terms here. Every version is preserved." />
          ) : (
            <ul className="flex flex-col gap-3">
              {detail.agreements.map((a) => (
                <li key={a.id} className="rounded-md border border-neutral-200 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">
                      v{a.version} — {a.title}
                    </span>
                    <StatusBadge status={a.status} />
                  </div>
                  {a.terms ? <p className="mt-2 whitespace-pre-wrap text-sm">{a.terms}</p> : null}
                  {detail.viewer.requesterSide && a.status === "pending" ? (
                    <div className="mt-3 flex gap-2">
                      <Button size="sm" icon="check" onClick={() => decideAgreement(a.id, "accepted")}>
                        Accept & release funding
                      </Button>
                      <Button size="sm" variant="secondary" icon="xmark" onClick={() => decideAgreement(a.id, "rejected")}>
                        Reject
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {latestPending && detail.viewer.requesterSide ? (
            <p className="mt-2 text-xs text-neutral-600">
              Accepting releases funding to your wallet and marks the request funded. Rejection keeps the version in history.
            </p>
          ) : null}
        </Card>
      </div>

      {agreeOpen ? (
        <Modal title="Draft agreement" onClose={() => setAgreeOpen(false)} wide>
          <div className="flex flex-col gap-3">
            <TextField label="Title" value={agreeTitle} onChange={(e) => setAgreeTitle(e.target.value)} />
            <TextAreaField label="Terms" value={agreeTerms} onChange={(e) => setAgreeTerms(e.target.value)} placeholder="Funding amount, milestones, repayment terms…" />
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAgreeOpen(false)}>
              Cancel
            </Button>
            <Button disabled={agreeTitle.trim().length < 4} onClick={draftAgreement}>
              Save version
            </Button>
          </div>
        </Modal>
      ) : null}
      {error ? <ErrorDialog message={error} onClose={() => setError(null)} /> : null}
    </>
  );
}
