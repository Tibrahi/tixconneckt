"use client";

import { useCallback, useEffect, useState } from "react";
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHOD_TYPES,
  paymentMethodStatusCopy,
  type PaymentMethodType,
} from "@/lib/payment-methods";
import { Card, StatusBadge } from "@/components/ui/Card";
import { EmptyState, SkeletonList } from "@/components/ui/Feedback";
import { SelectField, TextField } from "@/components/ui/Fields";
import { Button } from "@/components/ui/Button";

interface BoundMethod {
  id: string;
  type: string;
  displayLabel: string;
  providerRef: string | null;
  status: string;
}

/**
 * Payment-method readiness (role-aware §D2). Users register masked labels
 * for later verification; bindings stay pending until a verified provider
 * integration confirms them. Raw credentials are never collected here.
 */
export function PaymentMethods({ onError }: { onError: (m: string) => void }) {
  const [methods, setMethods] = useState<BoundMethod[] | null>(null);
  const [type, setType] = useState<PaymentMethodType>("card");
  const [label, setLabel] = useState("");
  const [reference, setReference] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/payment-methods", { cache: "no-store" });
      const body = (await res.json()) as { ok: boolean; data?: { methods: BoundMethod[] }; error?: string };
      if (!res.ok || !body.ok || !body.data) throw new Error(body.error ?? "Could not load payment methods.");
      setMethods(body.data.methods);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not load payment methods.");
    }
  }, [onError]);

  useEffect(() => {
    load();
  }, [load]);

  async function bind() {
    setBusy(true);
    try {
      const res = await fetch(editingId ? `/api/payment-methods/${encodeURIComponent(editingId)}` : "/api/payment-methods", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, displayLabel: label.trim(), providerRef: reference.trim() || undefined }),
      });
      const body = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !body.ok) throw new Error(body.error ?? "Could not save this payment method.");
      setLabel("");
      setReference("");
      setEditingId(null);
      load();
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not save this payment method.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    try {
      const res = await fetch(`/api/payment-methods/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      load();
    } catch {
      onError("We couldn't remove this payment method. Please try again.");
    }
  }

  return (
    <Card title="Payment methods">
      <p className="mb-3 text-sm text-neutral-600">
        Register how you intend to pay. Methods stay pending until a verified provider integration confirms
        them — card, mobile-money, crypto, and bank rails are not connected yet, so subscriptions continue to
        activate through administrator verification.
      </p>
      {!methods ? (
        <SkeletonList rows={2} />
      ) : methods.length === 0 ? (
        <EmptyState icon="credit-card" title="No methods bound" message="Add a masked label below. Never enter full card numbers, CVVs, PINs, or private keys." />
      ) : (
        <ul className="mb-4 flex flex-col gap-2">
          {methods.map((m) => (
            <li key={m.id} className="rounded-md border border-neutral-200 p-3 text-sm">
              <span className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-black">
                  {PAYMENT_METHOD_LABELS[m.type as PaymentMethodType] ?? m.type} ·{" "}
                  <span className="font-mono">{m.displayLabel}</span>
                </span>
                <span className="flex items-center gap-2">
                  <StatusBadge status={m.status} />
                  <Button size="sm" variant="ghost" onClick={() => { setEditingId(m.id); setType(m.type as PaymentMethodType); setLabel(m.displayLabel); setReference(m.providerRef ?? ""); }}>
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(m.id)}>
                    Delete
                  </Button>
                </span>
              </span>
              <span className="mt-1 block text-xs text-neutral-600">{paymentMethodStatusCopy(m.status)}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-col gap-3 border-t border-neutral-200 pt-3">
        <SelectField
          label="Method type"
          value={type}
          onChange={(e) => setType(e.target.value as PaymentMethodType)}
          options={PAYMENT_METHOD_TYPES.map((t) => ({ value: t, label: PAYMENT_METHOD_LABELS[t] }))}
        />
        <TextField
          label="Masked label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={type === "mobile_money" ? "MTN •• 123" : type === "crypto" ? "Wallet nickname" : type === "bank" ? "Bank account •• 1234" : "Visa •• 4242"}
          hint={type === "mobile_money" ? "Provider and masked number only; never enter your PIN." : type === "crypto" ? "Wallet nickname only; never enter a private key." : type === "bank" ? "Bank name and masked account only." : "Card brand and last digits only; never enter a full card number or CVV."}
          maxLength={60}
        />
        <TextField
          label={type === "mobile_money" ? "Provider token/reference (optional)" : type === "crypto" ? "Public wallet reference (optional)" : type === "bank" ? "Provider reference (optional)" : "Processor token/reference (optional)"}
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="Non-sensitive reference issued by your provider"
          maxLength={120}
        />
        <div>
          <Button size="sm" loading={busy} disabled={label.trim().length < 2} onClick={bind}>
            {editingId ? "Update method" : "Save method"}
          </Button>
          {editingId ? <Button size="sm" variant="ghost" onClick={() => { setEditingId(null); setLabel(""); setReference(""); }}>Cancel</Button> : null}
        </div>
      </div>
    </Card>
  );
}
