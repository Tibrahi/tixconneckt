"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ROUTES } from "@/lib/routes";
import { formatMoney } from "@/lib/currency";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, StatusBadge } from "@/components/ui/Card";
import { EmptyState, LoadError, SkeletonList } from "@/components/ui/Feedback";
import { Button } from "@/components/ui/Button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/Fields";
import { ErrorDialog, Modal } from "@/components/ui/Modal";
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
  const [data, setData] = useState<{ outgoing: RequestRow[]; incoming: RequestRow[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<Array<{ id: string; title: string }>>([]);
  const [providers, setProviders] = useState<Array<{ id: string; name: string; shortId: string }>>([]);
  const [form, setForm] = useState({ projectId: "", providerId: "", amount: "", message: "" });

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
    fetch("/api/providers", { cache: "no-store" })
      .then((r) => r.json())
      .then((b: { ok: boolean; data?: { providers: Array<{ id: string; name: string; shortId: string }> } }) => {
        if (b.ok && b.data) setProviders(b.data.providers);
      })
      .catch(() => {});
  }, [load]);

  async function submit() {
    const minor = Math.round(Number(form.amount) * 100);
    if (!form.projectId || !form.providerId || !Number.isInteger(minor) || minor <= 0) {
      setError("Select a project and provider, and enter a valid amount.");
      return;
    }
    try {
      // Individual request: requesterId resolved server-side from ownership; pass my id via profile.
      const me = await fetch("/api/profile", { cache: "no-store" }).then((r) => r.json()) as {
        ok: boolean;
        data?: { id: string };
      };
      if (!me.ok || !me.data) throw new Error();
      const res = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: form.projectId,
          requesterType: "individual",
          requesterId: me.data.id,
          providerId: form.providerId,
          amountMinor: minor,
          currency: "USD",
          message: form.message || undefined,
        }),
      });
      const body = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !body.ok) {
        setError(body.error ?? "We couldn't submit this request. Please try again.");
        return;
      }
      setOpen(false);
      setForm({ projectId: "", providerId: "", amount: "", message: "" });
      load();
    } catch {
      setError("Your connection was interrupted. Please try again.");
    }
  }

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
            <SelectField
              label="Project"
              value={form.projectId}
              onChange={(e) => setForm({ ...form, projectId: e.target.value })}
              options={[{ value: "", label: "Select project" }, ...projects.map((p) => ({ value: p.id, label: p.title }))]}
            />
            <SelectField
              label="Provider"
              value={form.providerId}
              onChange={(e) => setForm({ ...form, providerId: e.target.value })}
              options={[{ value: "", label: "Select provider" }, ...providers.map((p) => ({ value: p.id, label: `${p.name} (${p.shortId})` }))]}
            />
            <TextField label="Amount" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="500.00" />
            <TextAreaField label="Message (optional)" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit}>Submit request</Button>
          </div>
        </Modal>
      ) : null}
      {error ? <ErrorDialog message={error} onClose={() => setError(null)} /> : null}
    </>
  );
}
