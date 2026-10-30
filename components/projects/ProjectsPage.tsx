"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ROUTES } from "@/lib/routes";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge, Card } from "@/components/ui/Card";
import { EmptyState, LoadError, SkeletonList } from "@/components/ui/Feedback";
import { Button } from "@/components/ui/Button";
import { Pagination } from "@/components/ui/Pagination";
import { ProjectCreateDialog } from "./ProjectCreateDialog";

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
  const router = useRouter();
  const [items, setItems] = useState<ProjectItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [mineOnly, setMineOnly] = useState(false);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);

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
              New project
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
              Create your project
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
        <ProjectCreateDialog
          onClose={() => setOpen(false)}
          onDone={(projectId) => {
            router.push(ROUTES.projectById(projectId));
          }}
        />
      ) : null}
    </>
  );
}
