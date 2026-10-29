"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge, Card } from "@/components/ui/Card";
import { EmptyState, LoadError, PendingIntegration, SkeletonList } from "@/components/ui/Feedback";
import { Button } from "@/components/ui/Button";
import { TextAreaField } from "@/components/ui/Fields";
import { ErrorDialog } from "@/components/ui/Modal";

interface Detail {
  project: {
    id: string;
    title: string;
    summary: string;
    details: string | null;
    visibility: string;
    stage: string;
  };
  owner: { name: string; shortId: string } | null;
  contributions: Array<{
    id: string;
    body: string;
    createdAt: string;
    authorName: string;
    authorShortId: string;
    replies: Array<{ id: string; body: string; authorName: string; createdAt: string }>;
  }>;
  reactionCount: number;
  liked: boolean;
  analyses: Array<{ id: string; version: number; document: Record<string, unknown>; evidence: string; status: string; createdAt: string }>;
  canEdit: boolean;
}

export function ProjectDetailPage({ projectId }: { projectId: string }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contribution, setContribution] = useState("");
  const [replyFor, setReplyFor] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [aiPending, setAiPending] = useState<string | null>(null);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}`, { cache: "no-store" });
      if (!res.ok) throw new Error();
      const body = (await res.json()) as { ok: boolean; data?: Detail };
      if (!body.ok || !body.data) throw new Error();
      setDetail(body.data);
    } catch {
      setFailed(true);
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  async function act(action: string, extra: Record<string, unknown> = {}) {
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const body = (await res.json()) as { ok: boolean; data?: { pending?: boolean; pendingReason?: string }; error?: string };
      if (!res.ok || !body.ok) {
        setError(body.error ?? "We couldn't complete this action. Please try again.");
        return;
      }
      if (body.data?.pending) {
        setAiPending(body.data.pendingReason ?? "AI analysis is not configured");
        return;
      }
      setAiPending(null);
      load();
    } catch {
      setError("Your connection was interrupted. Please try again.");
    }
  }

  async function submitContribution() {
    if (!contribution.trim()) return;
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: contribution.trim() }),
      });
      const body = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !body.ok) {
        setError(body.error ?? "We couldn't save your contribution. Please try again.");
        return;
      }
      setContribution("");
      load();
    } catch {
      setError("Your connection was interrupted. Please try again.");
    }
  }

  if (failed) {
    return (
      <>
        <PageHeader title="Project" />
        <LoadError message="We couldn't open this project. It may be private or removed." onRetry={load} />
      </>
    );
  }
  if (!detail) {
    return (
      <>
        <PageHeader title="Project" />
        <SkeletonList rows={4} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={detail.project.title}
        description={`by ${detail.owner?.name ?? "Unknown"} · ${detail.project.visibility} · stage: ${detail.project.stage}`}
        actions={
          <>
            <Button
              size="sm"
              variant={detail.liked ? "primary" : "secondary"}
              icon="thumbs-up"
              onClick={() => act("react")}
            >
              {detail.reactionCount}
            </Button>
            {detail.canEdit ? (
              <Button size="sm" variant="secondary" icon="wand-magic-sparkles" loading={analyzing} onClick={async () => { setAnalyzing(true); await act("analyze"); setAnalyzing(false); }}>
                Re-analyze
              </Button>
            ) : null}
          </>
        }
      />
      {aiPending ? (
        <div className="mb-4">
          <PendingIntegration name="AI project analysis" detail={aiPending} />
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Idea">
          <p className="whitespace-pre-wrap text-sm">{detail.project.summary}</p>
          {detail.project.details ? (
            <p className="mt-3 whitespace-pre-wrap text-sm text-neutral-700">{detail.project.details}</p>
          ) : null}
        </Card>

        <Card title={`Analysis versions (${detail.analyses.length})`}>
          {detail.analyses.length === 0 ? (
            <EmptyState icon="file-lines" title="No analysis yet" message="The owner can request an AI-assisted structured analysis. Previous versions are always kept." />
          ) : (
            <ul className="flex flex-col gap-2">
              {detail.analyses.map((a) => (
                <li key={a.id} className="rounded-md border border-neutral-200 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm">Version {a.version}</span>
                    <Badge tone={a.evidence === "assumption" ? "warning" : "info"}>
                      Evidence: {a.evidence}
                    </Badge>
                  </div>
                  <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap font-mono text-xs">
                    {JSON.stringify(a.document, null, 2)}
                  </pre>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title={`Contributions (${detail.contributions.length})`} className="lg:col-span-2">
          <div className="mb-3 flex flex-col gap-2">
            <TextAreaField label="Add your contribution" value={contribution} onChange={(e) => setContribution(e.target.value)} placeholder="Share an improvement, resource, or concern…" />
            <div>
              <Button size="sm" disabled={!contribution.trim()} onClick={submitContribution}>
                Contribute
              </Button>
            </div>
          </div>
          {detail.contributions.length === 0 ? (
            <p className="text-sm text-neutral-600">No contributions yet — yours can be the first.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {detail.contributions.map((c) => (
                <li key={c.id} className="rounded-md border border-neutral-200 p-3">
                  <p className="text-sm font-medium">{c.authorName} <span className="font-mono text-xs text-neutral-500">({c.authorShortId})</span></p>
                  <div className="mt-1 text-sm" dangerouslySetInnerHTML={{ __html: c.body }} />
                  <ul className="mt-2 flex flex-col gap-1 pl-4">
                    {c.replies.map((r) => (
                      <li key={r.id} className="border-l-2 border-neutral-200 pl-2 text-sm">
                        <span className="font-medium">{r.authorName}:</span>{" "}
                        <span dangerouslySetInnerHTML={{ __html: r.body }} />
                      </li>
                    ))}
                  </ul>
                  {replyFor === c.id ? (
                    <div className="mt-2 flex flex-col gap-2">
                      <TextAreaField label="Reply" value={replyText} onChange={(e) => setReplyText(e.target.value)} />
                      <div className="flex gap-2">
                        <Button size="sm" disabled={!replyText.trim()} onClick={() => { act("reply", { contributionId: c.id, body: replyText.trim() }); setReplyFor(null); setReplyText(""); }}>
                          Send reply
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => setReplyFor(null)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <button type="button" className="mt-2 text-sm font-medium text-brand-700 hover:underline" onClick={() => setReplyFor(c.id)}>
                      Reply
                    </button>
                  )}
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
