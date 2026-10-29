"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { LoadError, SkeletonList } from "@/components/ui/Feedback";
import { Pagination } from "@/components/ui/Pagination";

interface AuditItem {
  id: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown>;
  ipAddress: string | null;
  createdAt: string;
  actorName: string | null;
  actorEmail: string | null;
}

export function AdminAudit() {
  const [items, setItems] = useState<AuditItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const res = await fetch(`/api/admin/audit?page=${page}&pageSize=20`, { cache: "no-store" });
      if (!res.ok) throw new Error();
      const body = (await res.json()) as { ok: boolean; data?: { items: AuditItem[]; total: number } };
      if (!body.ok || !body.data) throw new Error();
      setItems(body.data.items);
      setTotal(body.data.total);
    } catch {
      setFailed(true);
    }
  }, [page]);

  useEffect(() => {
    load();
  }, [load]);

  if (failed) {
    return (
      <>
        <PageHeader title="Audit log" />
        <LoadError onRetry={load} />
      </>
    );
  }
  if (!items) {
    return (
      <>
        <PageHeader title="Audit log" />
        <SkeletonList rows={4} />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Audit log" description="Sensitive operations with actor, target, and outcome." />
      <Card title="">
        {items.length === 0 ? (
          <p className="text-sm text-neutral-600">No audit events yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-neutral-600">
                  <th className="py-2 pr-3 font-medium">Time</th>
                  <th className="py-2 pr-3 font-medium">Actor</th>
                  <th className="py-2 pr-3 font-medium">Action</th>
                  <th className="py-2 pr-3 font-medium">Target</th>
                  <th className="py-2 font-medium">IP</th>
                </tr>
              </thead>
              <tbody>
                {items.map((a) => (
                  <tr key={a.id} className="border-b border-neutral-100">
                    <td className="py-2 pr-3 font-mono text-xs">{new Date(a.createdAt).toLocaleString()}</td>
                    <td className="py-2 pr-3">{a.actorName ?? a.actorEmail ?? "system"}</td>
                    <td className="py-2 pr-3 font-mono text-xs">{a.action}</td>
                    <td className="py-2 pr-3 font-mono text-xs">
                      {a.targetType ?? "—"} {a.targetId ? `· ${a.targetId.slice(0, 8)}` : ""}
                    </td>
                    <td className="py-2 font-mono text-xs">{a.ipAddress ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} pageSize={20} total={total} onPage={setPage} />
      </Card>
    </>
  );
}
