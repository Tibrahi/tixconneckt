"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ROUTES } from "@/lib/routes";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { LoadError, SkeletonList } from "@/components/ui/Feedback";

interface Overview {
  users: number;
  activeUsers: number;
  groups: number;
  projects: number;
  pendingRequests: number;
  pendingPayments: number;
  recentAudit: Array<{ id: string; action: string; createdAt: string }>;
}

function Stat({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link
      href={href}
      className="rounded-lg border border-neutral-200 bg-white p-4 transition-colors hover:border-black"
    >
      <span className="block font-mono text-2xl font-semibold">{value}</span>
      <span className="block text-sm text-neutral-600">{label}</span>
    </Link>
  );
}

export function AdminOverview() {
  const [data, setData] = useState<Overview | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const res = await fetch("/api/admin/overview", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const body = (await res.json()) as { ok: boolean; data?: Overview };
      if (!body.ok || !body.data) throw new Error();
      setData(body.data);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (failed) {
    return (
      <>
        <PageHeader title="Administration" />
        <LoadError onRetry={load} />
      </>
    );
  }
  if (!data) {
    return (
      <>
        <PageHeader title="Administration" />
        <SkeletonList rows={3} />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Administration" description="Operational controls with full audit records." />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Stat label="Total users" value={data.users} href={ROUTES.adminUsers} />
        <Stat label="Active users" value={data.activeUsers} href={ROUTES.adminUsers} />
        <Stat label="Groups" value={data.groups} href={ROUTES.adminGroups} />
        <Stat label="Projects" value={data.projects} href={ROUTES.adminProjects} />
        <Stat label="Pending funding requests" value={data.pendingRequests} href={ROUTES.adminRequests} />
        <Stat label="Pending payments" value={data.pendingPayments} href={ROUTES.adminSettings} />
      </div>
      <div className="mt-4">
        <Card
          title="Recent administrative events"
          actions={
            <Link href={ROUTES.adminAudit} className="text-sm font-medium text-brand-700 hover:underline">
              Full audit log
            </Link>
          }
        >
          {data.recentAudit.length === 0 ? (
            <p className="text-sm text-neutral-600">No audit events yet.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {data.recentAudit.map((a) => (
                <li key={a.id} className="flex justify-between gap-2 text-sm">
                  <span className="font-mono">{a.action}</span>
                  <span className="font-mono text-xs text-neutral-500">
                    {new Date(a.createdAt).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
