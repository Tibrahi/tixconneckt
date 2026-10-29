"use client";

import { useCallback, useEffect, useState } from "react";
import { formatMoney } from "@/lib/currency";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { EmptyState, LoadError, SkeletonList } from "@/components/ui/Feedback";
import { Button } from "@/components/ui/Button";
import { ErrorDialog } from "@/components/ui/Modal";

interface PendingPayment {
  id: string;
  subscriptionId: string;
  amountMinor: number;
  currency: string;
  provider: string;
  providerRef: string | null;
  createdAt: string;
  userEmail: string;
  userName: string;
  tier: string;
  category: string;
}

export function AdminSettings() {
  const [payments, setPayments] = useState<PendingPayment[] | null>(null);
  const [health, setHealth] = useState<{ configured: boolean; missing: string[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const [pRes, hRes] = await Promise.all([
        fetch("/api/admin/payments", { cache: "no-store" }),
        fetch("/api/health", { cache: "no-store" }),
      ]);
      if (!pRes.ok || !hRes.ok) throw new Error();
      const pBody = (await pRes.json()) as { ok: boolean; data?: { items: PendingPayment[] } };
      const hBody = (await hRes.json()) as { ok: boolean; data?: { configured: boolean; missing: string[] } };
      if (!pBody.ok || !pBody.data || !hBody.ok || !hBody.data) throw new Error();
      setPayments(pBody.data.items);
      setHealth(hBody.data);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function decide(paymentId: string, decision: "verified" | "failed") {
    try {
      const res = await fetch("/api/admin/payments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId, decision }),
      });
      const body = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !body.ok) {
        setError(body.error ?? "We couldn't process this payment. Please try again.");
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
        <PageHeader title="Settings" />
        <LoadError onRetry={load} />
      </>
    );
  }
  if (!payments || !health) {
    return (
      <>
        <PageHeader title="Settings" />
        <SkeletonList rows={3} />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Settings" description="Payment verification and system configuration." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={`Pending payments (${payments.length})`}>
          {payments.length === 0 ? (
            <EmptyState icon="credit-card" title="Nothing pending" message="New subscription payments appear here for verification." />
          ) : (
            <ul className="flex flex-col gap-2">
              {payments.map((p) => (
                <li key={p.id} className="rounded-md border border-neutral-200 p-3 text-sm">
                  <p className="font-medium">
                    {p.userName} <span className="font-mono text-xs text-neutral-500">({p.userEmail})</span>
                  </p>
                  <p className="mt-0.5">
                    {p.category} {p.tier} ·{" "}
                    <span className="font-mono font-semibold">{formatMoney(p.amountMinor, p.currency)}</span>
                  </p>
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" icon="check" onClick={() => decide(p.id, "verified")}>
                      Verify & activate
                    </Button>
                    <Button size="sm" variant="secondary" icon="xmark" onClick={() => decide(p.id, "failed")}>
                      Mark failed
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Configuration">
          <p className="text-sm">
            Status:{" "}
            <span className={`font-medium ${health.configured ? "text-green-700" : "text-amber-700"}`}>
              {health.configured ? "Complete" : "Missing values"}
            </span>
          </p>
          {health.missing.length > 0 ? (
            <ul className="mt-2 flex flex-col gap-1">
              {health.missing.map((m) => (
                <li key={m} className="font-mono text-xs text-amber-700">
                  {m}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-neutral-600">All required server settings are present.</p>
          )}
          <p className="mt-3 text-xs text-neutral-600">
            Secrets live in environment variables. Optional integrations (SMTP, AI, Redis, storage,
            realtime) degrade gracefully and are labeled pending where they surface.
          </p>
        </Card>
      </div>
      {error ? <ErrorDialog message={error} onClose={() => setError(null)} /> : null}
    </>
  );
}
