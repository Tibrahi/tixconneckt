"use client";

import { useCallback, useEffect, useState } from "react";
import { formatMoney } from "@/lib/currency";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, StatusBadge } from "@/components/ui/Card";
import { LoadError, SkeletonList } from "@/components/ui/Feedback";
import { Button } from "@/components/ui/Button";
import { Pagination } from "@/components/ui/Pagination";
import { ErrorDialog } from "@/components/ui/Modal";

interface QueueItem {
  id: string;
  name?: string;
  title?: string;
  summary?: string;
  objective?: string | null;
  visibility?: string;
  stage?: string;
  status?: string;
  amountMinor?: number;
  currency?: string;
  ownerName?: string;
  projectTitle?: string;
  requesterType?: string;
  createdAt: string;
}

export function ModerationQueue({ queue, title }: { queue: "groups" | "projects" | "requests"; title: string }) {
  const [items, setItems] = useState<QueueItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const res = await fetch(`/api/admin/moderation?queue=${queue}&page=${page}`, { cache: "no-store" });
      if (!res.ok) throw new Error();
      const body = (await res.json()) as { ok: boolean; data?: { items: QueueItem[]; total: number } };
      if (!body.ok || !body.data) throw new Error();
      setItems(body.data.items);
      setTotal(body.data.total);
    } catch {
      setFailed(true);
    }
  }, [queue, page]);

  useEffect(() => {
    load();
  }, [load]);

  async function moderate(id: string, action: "archive" | "close") {
    try {
      const res = await fetch("/api/admin/moderation", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queue, id, action }),
      });
      const body = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !body.ok) {
        setError(body.error ?? "We couldn't complete moderation. Please try again.");
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
        <PageHeader title={title} />
        <LoadError onRetry={load} />
      </>
    );
  }
  if (!items) {
    return (
      <>
        <PageHeader title={title} />
        <SkeletonList rows={4} />
      </>
    );
  }

  return (
    <>
      <PageHeader title={title} description="Review flagged records. Actions are audit-recorded." />
      <Card title="">
        {items.length === 0 ? (
          <p className="text-sm text-neutral-600">Nothing to review.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-neutral-200 p-3">
                <div className="min-w-0">
                  <p className="font-medium">{item.title ?? item.name ?? item.projectTitle ?? item.id}</p>
                  <p className="truncate text-sm text-neutral-600">
                    {item.summary ?? item.objective ?? ""}
                    {item.amountMinor !== undefined && item.currency
                      ? ` · ${formatMoney(item.amountMinor, item.currency)}`
                      : ""}
                    {item.ownerName ? ` · by ${item.ownerName}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {item.stage ? <StatusBadge status={item.stage} /> : null}
                  {item.status ? <StatusBadge status={item.status} /> : null}
                  {queue === "projects" && item.stage !== "archived" ? (
                    <Button size="sm" variant="secondary" onClick={() => moderate(item.id, "archive")}>
                      Archive
                    </Button>
                  ) : null}
                  {queue === "requests" && !["closed", "funded"].includes(item.status ?? "") ? (
                    <Button size="sm" variant="secondary" onClick={() => moderate(item.id, "close")}>
                      Close
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
        <Pagination page={page} pageSize={20} total={total} onPage={setPage} />
      </Card>
      {error ? <ErrorDialog message={error} onClose={() => setError(null)} /> : null}
    </>
  );
}
