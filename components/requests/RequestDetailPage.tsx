"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ROUTES } from "@/lib/routes";
import { formatMoney } from "@/lib/currency";
import { DocEditor } from "@/components/projects/DocEditor";
import { api } from "@/components/projects/types";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge, Card, StatusBadge } from "@/components/ui/Card";
import { EmptyState, LoadError, SkeletonList } from "@/components/ui/Feedback";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
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

interface SharedFolder {
  id: string;
  parentFolderId: string | null;
  name: string;
}

interface SharedFile {
  id: string;
  folderId: string;
  title: string;
  documentType: string;
  updatedAt: string;
  versionNumber: number;
  isResponse: boolean;
  submitted: boolean;
  mine: boolean;
}

export function RequestDetailPage({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agreeOpen, setAgreeOpen] = useState(false);
  const [agreeTitle, setAgreeTitle] = useState("");
  const [agreeTerms, setAgreeTerms] = useState("");
  const [folders, setFolders] = useState<SharedFolder[] | null>(null);
  const [files, setFiles] = useState<SharedFile[] | null>(null);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [openFileId, setOpenFileId] = useState<string | null>(null);
  const [responseOpen, setResponseOpen] = useState(false);
  const [responseTitle, setResponseTitle] = useState("");
  const [responseType, setResponseType] = useState("response");
  const [org, setOrg] = useState<{ name: string; verificationStatus: string; logoDocumentId: string | null } | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const data = await api<Detail>(`/api/requests/${encodeURIComponent(requestId)}`);
      setDetail(data);
    } catch {
      setFailed(true);
    }
  }, [requestId]);

  const loadFiles = useCallback(async () => {
    try {
      const data = await api<{ folders: SharedFolder[]; files: SharedFile[] }>(
        `/api/requests/${encodeURIComponent(requestId)}/files`,
      );
      setFolders(data.folders);
      setFiles(data.files);
      if (!folderId && data.folders.length > 0) {
        const root = data.folders.find((f) => f.parentFolderId === null) ?? data.folders[0];
        setFolderId(root.id);
      }
    } catch {
      setFolders([]);
      setFiles([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestId]);

  useEffect(() => {
    load();
    loadFiles();
  }, [load, loadFiles]);

  // Provider organization badge (public orgs only).
  useEffect(() => {
    if (!detail?.provider) return;
    api<{ organizations: Array<{ ownerId: string; name: string; visibility: string; verificationStatus: string; logoDocumentId: string | null }> }>("/api/organizations")
      .then((d) => {
        const match = d.organizations.find((o) => o.ownerId === detail.provider!.id && o.visibility === "public");
        if (!match) return;
        setOrg(match);
        if (match.logoDocumentId) {
          api<{ url: string }>(`/api/documents/${match.logoDocumentId}/url`)
            .then((u) => setLogoUrl(u.url))
            .catch(() => setLogoUrl(null));
        }
      })
      .catch(() => undefined);
  }, [detail?.provider]);

  async function review(decision: "under_review" | "approved" | "rejected") {
    try {
      await api(`/api/requests/${encodeURIComponent(requestId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "We couldn't record your review.");
    }
  }

  async function draftAgreement() {
    try {
      await api(`/api/requests/${encodeURIComponent(requestId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: agreeTitle.trim(), terms: agreeTerms.trim() || undefined }),
      });
      setAgreeOpen(false);
      setAgreeTitle("");
      setAgreeTerms("");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "We couldn't save this agreement.");
    }
  }

  async function decideAgreement(agreementId: string, decision: "accepted" | "rejected") {
    try {
      await api(`/api/requests/${encodeURIComponent(requestId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agreementId, decision }),
      });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "We couldn't record your decision.");
    }
  }

  async function openThread() {
    try {
      const res = await api<{ conversationId: string }>(`/api/requests/${encodeURIComponent(requestId)}/conversation`, {
        method: "POST",
      });
      router.push(ROUTES.chatThread(res.conversationId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't open the conversation.");
    }
  }

  async function createResponse() {
    try {
      const res = await api<{ fileId: string }>(`/api/requests/${encodeURIComponent(requestId)}/responses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: responseTitle.trim(), documentType: responseType.trim() || "response" }),
      });
      setResponseOpen(false);
      setResponseTitle("");
      loadFiles();
      setOpenFileId(res.fileId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create the response.");
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

  if (openFileId) {
    return (
      <>
        <PageHeader
          title={`${detail.project.title} — Funding Request`}
          description="Shared project folder"
          actions={<StatusBadge status={detail.request.status} />}
        />
        <DocEditor
          projectId={detail.project.id}
          fileId={openFileId}
          contextFiles={(files ?? []).map((f) => ({ id: f.id, title: f.title }))}
          onClose={() => {
            setOpenFileId(null);
            loadFiles();
          }}
          onShare={() => undefined}
          onChanged={loadFiles}
        />
        {error ? <ErrorDialog message={error} onClose={() => setError(null)} /> : null}
      </>
    );
  }

  const visibleFolders = (folders ?? []).filter((f) => f.parentFolderId === folderId);
  const visibleFiles = (files ?? []).filter((f) => f.folderId === folderId);
  const responses = (files ?? []).filter((f) => f.isResponse);
  const crumbs: SharedFolder[] = [];
  {
    let current = (folders ?? []).find((f) => f.id === folderId) ?? null;
    const seen = new Set<string>();
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      crumbs.unshift(current);
      current = (folders ?? []).find((f) => f.id === current!.parentFolderId) ?? null;
    }
  }

  return (
    <>
      <PageHeader
        title={`${detail.project.title} — Funding Request`}
        description={
          <>
            <span className="font-mono font-semibold">{formatMoney(detail.request.amountMinor, detail.request.currency)}</span>
            {" · "}
            {detail.request.requesterType} request
            {detail.provider ? ` · Provider: ${detail.provider.name}` : ""}
          </>
        }
        actions={
          <span className="flex items-center gap-2">
            {org ? (
              <span className="flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white py-0.5 pl-0.5 pr-2.5 text-xs font-medium">
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoUrl} alt="" className="h-5 w-5 rounded-full object-cover" />
                ) : (
                  <Icon name="building" className="pl-1 text-neutral-500" />
                )}
                {org.name}
                <Badge tone={org.verificationStatus === "verified" ? "success" : org.verificationStatus === "pending" ? "warning" : "neutral"}>
                  {org.verificationStatus === "verified" ? "Verified" : org.verificationStatus === "pending" ? "Pending" : "Unverified"}
                </Badge>
              </span>
            ) : null}
            <StatusBadge status={detail.request.status} />
          </span>
        }
      />

      {detail.viewer.providerSide ? (
        <p className="mb-3 rounded-md border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-900">
          You see only the files and folders explicitly shared with you for this request — nothing else from the project.
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title="Shared project folder"
          actions={
            <span className="flex gap-1.5">
              {detail.viewer.providerSide ? (
                <Button size="sm" variant="secondary" icon="file-plus" onClick={() => setResponseOpen(true)}>
                  New response
                </Button>
              ) : null}
              <Button size="sm" variant="secondary" icon="comments" onClick={openThread}>
                Open thread
              </Button>
            </span>
          }
        >
          {folders === null || files === null ? (
            <p className="text-sm text-neutral-600">Loading shared files…</p>
          ) : (
            <>
              <nav aria-label="Breadcrumb" className="mb-2 flex flex-wrap items-center gap-1 text-sm">
                {crumbs.map((c, i) => (
                  <span key={c.id} className="flex items-center gap-1">
                    {i > 0 ? <Icon name="chevron-right" className="text-xs text-neutral-400" /> : null}
                    <button
                      type="button"
                      onClick={() => setFolderId(c.id)}
                      className={`rounded px-1 py-0.5 hover:bg-neutral-100 ${i === crumbs.length - 1 ? "font-semibold text-black" : "text-brand-700"}`}
                    >
                      {c.name}
                    </button>
                  </span>
                ))}
              </nav>
              {visibleFolders.length === 0 && visibleFiles.length === 0 ? (
                <p className="text-sm text-neutral-600">Nothing shared in this folder.</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {visibleFolders.map((f) => (
                    <li key={f.id}>
                      <button
                        type="button"
                        onClick={() => setFolderId(f.id)}
                        className="flex w-full items-center gap-2 rounded-md border border-neutral-200 px-3 py-2 text-left text-sm hover:border-brand-400"
                      >
                        <Icon name="folder" className="text-brand-500" />
                        <span className="font-medium text-black">{f.name}</span>
                      </button>
                    </li>
                  ))}
                  {visibleFiles.map((f) => (
                    <li key={f.id}>
                      <button
                        type="button"
                        onClick={() => setOpenFileId(f.id)}
                        className="flex w-full items-center gap-2 rounded-md border border-neutral-200 px-3 py-2 text-left text-sm hover:border-brand-400"
                      >
                        <Icon name={f.isResponse ? "reply" : "file-lines"} className="text-neutral-500" />
                        <span className="min-w-0 flex-1 truncate text-black">{f.title}</span>
                        {f.isResponse ? (
                          <Badge tone={f.submitted ? "success" : "warning"}>
                            {f.submitted ? "submitted" : "draft"}
                          </Badge>
                        ) : null}
                        <span className="text-xs text-neutral-500">v{f.versionNumber}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {responses.length > 0 ? (
                <p className="mt-2 text-xs text-neutral-600">
                  {responses.filter((r) => r.submitted).length} of {responses.length} response(s) submitted.
                </p>
              ) : null}
            </>
          )}
        </Card>

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
      {responseOpen ? (
        <Modal title="New response document" onClose={() => setResponseOpen(false)}>
          <div className="flex flex-col gap-3">
            <TextField
              label="Response title"
              value={responseTitle}
              onChange={(e) => setResponseTitle(e.target.value)}
              placeholder="e.g. Loan Offer, Funding Assessment, Questions…"
            />
            <TextField label="Document type" value={responseType} onChange={(e) => setResponseType(e.target.value)} />
            <p className="text-xs text-neutral-600">
              Any title and structure — offer, assessment, conditions, questions, or rejection explanation.
              It opens in the playground; submit when ready.
            </p>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setResponseOpen(false)}>
              Cancel
            </Button>
            <Button disabled={!responseTitle.trim()} onClick={createResponse}>
              Open in playground
            </Button>
          </div>
        </Modal>
      ) : null}
      {error ? <ErrorDialog message={error} onClose={() => setError(null)} /> : null}
    </>
  );
}
