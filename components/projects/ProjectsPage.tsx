"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ROUTES } from "@/lib/routes";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge, Card } from "@/components/ui/Card";
import { EmptyState, LoadError, SkeletonList } from "@/components/ui/Feedback";
import { Button } from "@/components/ui/Button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/Fields";
import { ErrorDialog, Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";

interface ProjectItem {
  id: string;
  ownerName: string;
  ownerShortId: string;
  title: string;
  summary: string;
  visibility: string;
  stage: string;
  updatedAt: string;
}

export function ProjectsPage() {
  const [items, setItems] = useState<ProjectItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [mineOnly, setMineOnly] = useState(false);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", summary: "", details: "", visibility: "public" });

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const res = await fetch(`/api/projects?page=${page}&pageSize=12${mineOnly ? "&mine=1" : ""}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error();
      const body = (await res.json()) as {
        ok: boolean;
        data?: { items: ProjectItem[]; total: number };
      };
      if (!body.ok || !body.data) throw new Error();
      setItems(body.data.items);
      setTotal(body.data.total);
    } catch {
      setFailed(true);
    }
  }, [page, mineOnly]);

  useEffect(() => {
    load();
  }, [load]);

  async function submit() {
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title.trim(),
          summary: form.summary.trim(),
          details: form.details.trim() || undefined,
          visibility: form.visibility,
        }),
      });
      const body = (await res.json()) as { ok: boolean; data?: { projectId: string }; error?: string };
      if (!res.ok || !body.ok || !body.data) {
        setError(body.error ?? "We couldn't submit your idea. Please try again.");
        return;
      }
      setOpen(false);
      setForm({ title: "", summary: "", details: "", visibility: "public" });
      window.location.href = ROUTES.projectById(body.data.projectId);
    } catch {
      setError("Your connection was interrupted. Please try again.");
    }
  }

  if (failed) {
    return (
      <>
        <PageHeader title="Project" />
        <LoadError onRetry={load} />
      </>
    );
  }
  if (!items) {
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
        title="Project"
        description="Submit ideas, gather contributions, and develop them with structured analysis."
        actions={
          <>
            <Button size="sm" variant={mineOnly ? "primary" : "secondary"} onClick={() => { setMineOnly(!mineOnly); setPage(1); }}>
              {mineOnly ? "My projects" : "All visible"}
            </Button>
            <Button size="sm" icon="plus" onClick={() => setOpen(true)}>
              Submit idea
            </Button>
          </>
        }
      />
      {items.length === 0 ? (
        <EmptyState
          icon="lightbulb"
          title="No ideas yet"
          message="Be the first to submit an idea. Contributions and analysis build on it from here."
          action={
            <Button size="sm" onClick={() => setOpen(true)}>
              Submit your idea
            </Button>
          }
        />
      ) : (
        <Card title="">
          <ul className="flex flex-col gap-3">
            {items.map((p) => (
              <li key={p.id} className="rounded-lg border border-neutral-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <Link href={ROUTES.projectById(p.id)} className="font-medium text-brand-700 hover:underline">
                      {p.title}
                    </Link>
                    <p className="mt-1 text-sm text-neutral-600">
                      by {p.ownerName} <span className="font-mono text-xs">({p.ownerShortId})</span>
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Badge tone={p.visibility === "private" ? "warning" : "neutral"}>{p.visibility}</Badge>
                    <Badge tone="info">{p.stage}</Badge>
                  </div>
                </div>
                <p className="mt-2 line-clamp-3 text-sm text-black">{p.summary}</p>
              </li>
            ))}
          </ul>
          <Pagination page={page} pageSize={12} total={total} onPage={setPage} />
        </Card>
      )}
      {open ? (
        <Modal title="Submit an idea" onClose={() => setOpen(false)} wide>
          <div className="flex flex-col gap-3">
            <TextField label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <TextAreaField label="Summary (20+ characters)" value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
            <TextAreaField label="Details (optional)" value={form.details} onChange={(e) => setForm({ ...form, details: e.target.value })} />
            <SelectField
              label="Visibility"
              value={form.visibility}
              onChange={(e) => setForm({ ...form, visibility: e.target.value })}
              options={[
                { value: "public", label: "Public" },
                { value: "private", label: "Private (Super plan required)" },
              ]}
            />
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={form.title.trim().length < 4 || form.summary.trim().length < 20} onClick={submit}>
              Submit idea
            </Button>
          </div>
        </Modal>
      ) : null}
      {error ? <ErrorDialog message={error} onClose={() => setError(null)} /> : null}
    </>
  );
}
