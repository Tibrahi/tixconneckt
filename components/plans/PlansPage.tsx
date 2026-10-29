"use client";

import { useCallback, useEffect, useState } from "react";
import { formatMoney } from "@/lib/currency";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge, Card, StatusBadge } from "@/components/ui/Card";
import { EmptyState, LoadError, SkeletonList } from "@/components/ui/Feedback";
import { Button } from "@/components/ui/Button";
import { ErrorDialog, ConfirmDialog } from "@/components/ui/Modal";

interface Plan {
  id: string;
  category: string;
  tier: string;
  priceMinor: number;
  currency: string;
  benefits: string[];
}
interface Subscription {
  id: string;
  planId: string;
  status: string;
  currentPeriodEnd: string | null;
  tier: string;
  priceMinor: number;
  currency: string;
  benefits: string[];
}

export function PlansPage() {
  const [data, setData] = useState<{
    category: string;
    catalog: Plan[];
    subscriptions: Subscription[];
    payments: Array<{ id: string; amountMinor: number; currency: string; status: string; createdAt: string }>;
  } | null>(null);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmPlan, setConfirmPlan] = useState<Plan | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const res = await fetch("/api/plans", { cache: "no-store" });
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
  }, [load]);

  async function subscribe(planId: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });
      const body = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !body.ok) {
        setError(body.error ?? "We couldn't start your subscription. Please try again.");
        return;
      }
      setConfirmPlan(null);
      load();
    } catch {
      setError("Your connection was interrupted. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function cancel(subscriptionId: string) {
    try {
      const res = await fetch("/api/plans", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionId }),
      });
      if (!res.ok) throw new Error();
      load();
    } catch {
      setError("We couldn't cancel this subscription. Please try again.");
    }
  }

  if (failed) {
    return (
      <>
        <PageHeader title="Plan" />
        <LoadError onRetry={load} />
      </>
    );
  }
  if (!data) {
    return (
      <>
        <PageHeader title="Plan" />
        <SkeletonList rows={3} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Plan"
        description={`Plans for ${data.category} accounts. Prices are proposed and configurable — access activates only after verified payment.`}
      />
      <div className="grid gap-4 md:grid-cols-2">
        {data.catalog.map((plan) => (
          <Card
            key={plan.id}
            title={`${plan.category} ${plan.tier}`}
            actions={<Badge tone={plan.tier === "super" ? "info" : "neutral"}>{plan.tier}</Badge>}
          >
            <p className="font-mono text-2xl font-semibold">{formatMoney(plan.priceMinor, plan.currency)}</p>
            <ul className="mt-3 flex flex-col gap-1 text-sm">
              {plan.benefits.map((b) => (
                <li key={b} className="flex gap-2">
                  <span aria-hidden="true">•</span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4">
              <Button size="sm" onClick={() => setConfirmPlan(plan)}>
                Choose {plan.tier}
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="My subscriptions">
          {data.subscriptions.length === 0 ? (
            <EmptyState icon="credit-card" title="No subscriptions" message="Choose a plan above to get started." />
          ) : (
            <ul className="flex flex-col gap-2">
              {data.subscriptions.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-neutral-200 p-3 text-sm">
                  <span>
                    <span className="font-medium capitalize">{s.tier}</span> ·{" "}
                    <span className="font-mono">{formatMoney(s.priceMinor, s.currency)}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <StatusBadge status={s.status} />
                    {s.status === "pending" || s.status === "active" ? (
                      <Button size="sm" variant="secondary" onClick={() => cancel(s.id)}>
                        Cancel
                      </Button>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Payment history">
          {data.payments.length === 0 ? (
            <p className="text-sm text-neutral-600">No payments yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {data.payments.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 rounded-md border border-neutral-200 p-2.5 text-sm">
                  <span className="font-mono">{formatMoney(p.amountMinor, p.currency)}</span>
                  <StatusBadge status={p.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {confirmPlan ? (
        <ConfirmDialog
          title={`Choose ${confirmPlan.tier}?`}
          message={`This starts a ${confirmPlan.category} ${confirmPlan.tier} subscription (${formatMoney(confirmPlan.priceMinor, confirmPlan.currency)}). Access activates only after your payment is verified.`}
          confirmLabel={busy ? "Starting…" : "Start subscription"}
          onConfirm={() => subscribe(confirmPlan.id)}
          onCancel={() => setConfirmPlan(null)}
        />
      ) : null}
      {error ? <ErrorDialog message={error} onClose={() => setError(null)} /> : null}
    </>
  );
}
