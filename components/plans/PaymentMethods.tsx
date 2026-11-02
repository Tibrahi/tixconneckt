"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  METHOD_OPTIONS,
  buildDisplayLabel,
  defaultOptionForType,
  maskAddress,
  maskPhone,
  methodOption,
  validateMethodDetails,
  type MethodOptionKey,
} from "@/lib/payment-method-fields";
import { PAYMENT_METHOD_LABELS, paymentMethodStatusCopy, type PaymentMethodType } from "@/lib/payment-methods";
import { Card, StatusBadge } from "@/components/ui/Card";
import { EmptyState, SkeletonList } from "@/components/ui/Feedback";
import { SelectField, TextField } from "@/components/ui/Fields";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";

interface BoundMethod {
  id: string;
  type: string;
  methodOption: string | null;
  details: Record<string, string> | null;
  displayLabel: string;
  providerRef: string | null;
  status: string;
}

const MONTHS = Array.from({ length: 12 }, (_, i) => ({
  value: String(i + 1),
  label: String(i + 1).padStart(2, "0"),
}));

function yearOptions(): Array<{ value: string; label: string }> {
  const current = new Date().getFullYear();
  return Array.from({ length: 13 }, (_, i) => ({ value: String(current + i), label: String(current + i) }));
}

/**
 * Payment-method readiness (role-aware §D2). Users pick a concrete rail —
 * Visa, Mastercard, MTN MoMo, Airtel Money, crypto, or bank — and each rail
 * asks only for its own public, non-sensitive details. Everything saves to
 * the database and stays pending: processing is under construction, and a
 * notification says exactly that on every save.
 */
export function PaymentMethods({ onError }: { onError: (m: string) => void }) {
  const [methods, setMethods] = useState<BoundMethod[] | null>(null);
  const [optionKey, setOptionKey] = useState<MethodOptionKey>("visa");
  const [values, setValues] = useState<Record<string, string>>({ brand: "Visa" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [legacyLabel, setLegacyLabel] = useState("");
  const [legacyRef, setLegacyRef] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const option = useMemo(() => methodOption(optionKey) ?? METHOD_OPTIONS[0], [optionKey]);
  const years = useMemo(() => yearOptions(), []);

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

  function selectOption(key: MethodOptionKey) {
    setOptionKey(key);
    setValues(
      key === "visa"
        ? { brand: "Visa" }
        : key === "mastercard"
          ? { brand: "Mastercard" }
          : key === "mtn"
            ? { provider: "MTN" }
            : key === "airtel"
              ? { provider: "Airtel" }
              : {},
    );
  }

  function resetForm() {
    setEditingId(null);
    setLegacyLabel("");
    setLegacyRef("");
    selectOption("visa");
  }

  function startEdit(m: BoundMethod) {
    setNotice(null);
    setEditingId(m.id);
    const opt = m.methodOption && methodOption(m.methodOption) ? (m.methodOption as MethodOptionKey) : null;
    if (opt && m.details) {
      setOptionKey(opt);
      setValues({ ...(m.details as Record<string, string>) });
      setLegacyLabel("");
      setLegacyRef("");
    } else {
      // Legacy label-only row: keep the old shape editable as-is.
      setOptionKey(defaultOptionForType(m.type));
      setValues({});
      setLegacyLabel(m.displayLabel);
      setLegacyRef(m.providerRef ?? "");
    }
  }

  async function bind() {
    setBusy(true);
    setNotice(null);
    try {
      const legacy = editingId !== null && legacyLabel !== "";
      let payload: Record<string, unknown>;
      if (legacy) {
        const row = methods?.find((m) => m.id === editingId);
        payload = {
          type: (row?.type ?? "card") as PaymentMethodType,
          displayLabel: legacyLabel.trim(),
          providerRef: legacyRef.trim() || undefined,
        };
      } else {
        const checked = validateMethodDetails(optionKey, values);
        if (!checked.ok) throw new Error(checked.errors[0] ?? "Invalid payment details.");
        payload = {
          type: option.type,
          displayLabel: buildDisplayLabel(optionKey, checked.normalized),
          option: optionKey,
          details: checked.normalized,
        };
      }
      const res = await fetch(
        editingId ? `/api/payment-methods/${encodeURIComponent(editingId)}` : "/api/payment-methods",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const body = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !body.ok) throw new Error(body.error ?? "Could not save this payment method.");
      resetForm();
      setNotice(
        "Saved. Payment processing is under construction — these details are stored and will be used to proceed to the next step. A notification was sent to your inbox.",
      );
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

  function detailLine(m: BoundMethod): string | null {
    if (!m.details) return null;
    if ((m.methodOption === "mtn" || m.methodOption === "airtel") && m.details.phone) {
      return `${maskPhone(m.details.phone)}${m.details.accountName ? ` · ${m.details.accountName}` : ""}`;
    }
    if (m.methodOption === "crypto" && m.details.address) {
      return `${m.details.coin} · ${maskAddress(m.details.address)}${m.details.network ? ` · ${m.details.network}` : ""}`;
    }
    return null;
  }

  function rowIcon(m: BoundMethod): string {
    const opt = m.methodOption ? methodOption(m.methodOption) : undefined;
    if (opt) return opt.icon;
    return m.type === "mobile_money" ? "mobile-screen" : m.type === "crypto" ? "coins" : m.type === "bank" ? "landmark" : "credit-card";
  }

  return (
    <Card title="Payment methods">
      <p className="mb-3 text-sm text-neutral-600">
        Pick a method and register its public details. Each rail asks only for what its own documentation
        requires — card brand with last 4 and expiry, mobile-money country with phone and account name, or a
        public wallet address. Never enter full card numbers, CVVs, PINs, passwords, or private keys. Methods
        stay pending until processing opens.
      </p>

      {notice ? (
        <p role="status" className="mb-3 rounded-md border border-blue-300 bg-blue-50 p-3 text-sm text-blue-900">
          {notice}
        </p>
      ) : null}

      {!methods ? (
        <SkeletonList rows={2} />
      ) : methods.length === 0 ? (
        <EmptyState
          icon="credit-card"
          title="No methods bound"
          message="Choose a method below and register its details. Secrets are never requested."
        />
      ) : (
        <ul className="mb-4 flex flex-col gap-2">
          {methods.map((m) => (
            <li key={m.id} className="rounded-md border border-neutral-200 p-3 text-sm">
              <span className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2 font-medium text-black">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-sm text-white" aria-hidden="true">
                    <Icon name={rowIcon(m)} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate">
                      {(m.methodOption && methodOption(m.methodOption)?.label) ||
                        PAYMENT_METHOD_LABELS[m.type as PaymentMethodType] ||
                        m.type}
                    </span>
                    <span className="block truncate font-mono text-xs font-normal text-neutral-600">{m.displayLabel}</span>
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <StatusBadge status={m.status} />
                  <Button size="sm" variant="ghost" onClick={() => startEdit(m)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(m.id)}>
                    Delete
                  </Button>
                </span>
              </span>
              {detailLine(m) ? (
                <span className="mt-1 block truncate font-mono text-xs text-neutral-600">{detailLine(m)}</span>
              ) : null}
              <span className="mt-1 block text-xs text-neutral-600">{paymentMethodStatusCopy(m.status)}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-3 border-t border-neutral-200 pt-3">
        <div role="group" aria-label="Payment method">
          <p className="mb-1.5 text-sm font-medium text-black">
            {editingId ? "Method" : "Choose a method"}
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {METHOD_OPTIONS.map((o) => {
              const selected = o.key === optionKey;
              return (
                <button
                  key={o.key}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    setEditingId(null);
                    setLegacyLabel("");
                    setLegacyRef("");
                    selectOption(o.key);
                  }}
                  className={`flex items-center gap-2 rounded-md border p-2.5 text-left text-sm transition-colors ${
                    selected ? "border-black bg-neutral-900 text-white" : "border-neutral-300 bg-white text-black hover:border-black"
                  }`}
                >
                  <Icon name={o.icon} />
                  <span>
                    <span className="block font-medium">{o.label}</span>
                    <span className={`block text-[11px] leading-tight ${selected ? "text-neutral-300" : "text-neutral-500"}`}>
                      {o.blurb}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {editingId !== null && legacyLabel !== "" ? (
          <>
            <TextField
              label="Masked label"
              value={legacyLabel}
              onChange={(e) => setLegacyLabel(e.target.value)}
              hint="Legacy binding — labels only, never secrets."
              maxLength={60}
            />
            <TextField
              label="Provider reference (optional)"
              value={legacyRef}
              onChange={(e) => setLegacyRef(e.target.value)}
              maxLength={120}
            />
          </>
        ) : (
          <>
            <p className="text-sm text-neutral-600">
              <strong className="text-black">{option.label}</strong> — {option.blurb}
            </p>
            {option.fields.map((field) => {
              if (field.kind === "select" || field.kind === "month" || field.kind === "year") {
                const opts =
                  field.kind === "month" ? MONTHS : field.kind === "year" ? years : (field.options ?? []);
                return (
                  <SelectField
                    key={field.key}
                    label={field.label}
                    value={values[field.key] ?? ""}
                    required={field.required}
                    hint={field.hint}
                    onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                    options={[{ value: "", label: "Select…" }, ...opts]}
                  />
                );
              }
              return (
                <TextField
                  key={field.key}
                  label={field.label}
                  value={values[field.key] ?? ""}
                  required={field.required}
                  hint={field.hint}
                  placeholder={field.placeholder}
                  maxLength={field.maxLength}
                  inputMode={field.kind === "tel" || field.kind === "digits4" ? "numeric" : undefined}
                  type={field.kind === "tel" ? "tel" : "text"}
                  onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                />
              );
            })}
          </>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" loading={busy} onClick={bind}>
            {editingId ? "Update method" : "Save method"}
          </Button>
          {editingId ? (
            <Button size="sm" variant="ghost" onClick={resetForm}>
              Cancel
            </Button>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
