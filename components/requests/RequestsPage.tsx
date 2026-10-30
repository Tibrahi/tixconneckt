"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ROUTES } from "@/lib/routes";
import { formatMoney } from "@/lib/currency";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, StatusBadge } from "@/components/ui/Card";
import { EmptyState, LoadError, SkeletonList } from "@/components/ui/Feedback";
import { Button } from "@/components/ui/Button";
import { SelectField } from "@/components/ui/Fields";
import { Modal } from "@/components/ui/Modal";
import { Tabs } from "@/components/ui/Tabs";

interface RequestRow {
  id: string;
  projectId: string;
  requesterType: string;
  status: string;
  amountMinor: number;
  currency: string;
  createdAt: string;
  projectTitle: string;
  providerName?: string;
}

export function RequestsPage() {
  const router = useRouter();
  const [data, setData] = useState<{ outgoing: RequestRow[]; incoming: RequestRow[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<Array<{ id: string; title: string }>>([]);
  const [form, setForm] = useState({ projectId: "" });

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const res = await fetch("/api/requests", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const body = (await res.json()) as { ok: boolean; data?: typeof data };
      if (!body.ok || !body.data) throw new Error();
      setData(body.data);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    load();
    fetch("/api/projects?mine=1", { cache: "no-store" })
      .then((r) => r.json())
      .then((b: { ok: boolean; data?: { items: Array<{ id: string; title: string }> } }) => {
        if (b.ok && b.data) setProjects(b.data.items);
      })
      .catch(() => {});
  }, [load]);

  if (failed) {
    return (
      <>
        <PageHeader title="Request" />
        <LoadError onRetry={load} />
      </>
    );
  }
  if (!data) {
    return (
      <>
        <PageHeader title="Request" />
        <SkeletonList rows={3} />
      </>
    );
  }

  const list = (rows: RequestRow[], emptyTitle: string, emptyMessage: string) =>
    rows.length === 0 ? (
      <EmptyState icon="file-signature" title={emptyTitle} message={emptyMessage} />
    ) : (
      <ul className="flex flex-col gap-2">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-neutral-200 p-3">
            <div>
              <Link href={ROUTES.requestById(r.id)} className="font-medium text-brand-700 hover:underline">
                {r.projectTitle}
              </Link>
              <p className="text-sm text-neutral-600">
                <span className="font-mono font-semibold text-black">{formatMoney(r.amountMinor, r.currency)}</span>
                {r.providerName ? ` · Provider: ${r.providerName}` : ""} · {r.requesterType}
              </p>
            </div>
            <StatusBadge status={r.status} />
          </li>
        ))}
      </ul>
    );

  return (
    <>
      <PageHeader
        title="Request"
        description="Formal funding requests with staged provider visibility and versioned agreements."
        actions={
          <Button size="sm" icon="plus" onClick={() => setOpen(true)}>
            New request
          </Button>
        }
      />
      <Card title="">
        <Tabs
          tabs={[
            {
              id: "outgoing",
              label: `My requests (${data.outgoing.length})`,
              icon: "file-lines",
              content: list(data.outgoing, "No requests", "Submit a request for one of your projects."),
            },
            {
              id: "incoming",
              label: `Incoming (${data.incoming.length})`,
              icon: "file-signature",
              content: list(data.incoming, "Nothing assigned", "Providers see funding requests directed at them here."),
            },
          ]}
        />
      </Card>
      {open ? (
        <Modal title="New funding request" onClose={() => setOpen(false)}>
          <div className="flex flex-col gap-3">
            <p className="text-sm text-neutral-600">
              Requests share project documents with the provider, so they are prepared inside the
              project workspace — pick the project to continue there.
            </p>
            <SelectField
              label="Project"
              value={form.projectId}
              onChange={(e) => setForm({ ...form, projectId: e.target.value })}
              options={[{ value: "", label: "Select project" }, ...projects.map((p) => ({ value: p.id, label: p.title }))]}
            />
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!form.projectId}
              onClick={() => {
                router.push(`${ROUTES.projectById(form.projectId)}?newRequest=loan`);
              }}
            >
              Continue in project
            </Button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
