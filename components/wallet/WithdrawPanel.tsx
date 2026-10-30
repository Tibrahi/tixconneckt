"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/currency";
import { Button } from "@/components/ui/Button";
import { Card, StatusBadge } from "@/components/ui/Card";
import { SelectField, TextField } from "@/components/ui/Fields";
import { readApi, type AvailabilityRow, type WalletRow, type WithdrawalRow } from "./types";

/**
 * Individual withdrawals (wallet.md FR-08 §5): members withdraw only their
 * own eligible funds. Requests reserve funds until the payout provider
 * confirms; failures release the reservation.
 */
export function WithdrawPanel({
  wallets,
  availability,
  withdrawals,
  minWithdrawalMinor,
  accountStatus,
  onChanged,
  onError,
}: {
  wallets: WalletRow[];
  availability: AvailabilityRow[];
  withdrawals: WithdrawalRow[];
  minWithdrawalMinor: number | null;
  accountStatus: string;
  onChanged: () => void;
  onError: (message: string) => void;
}) {
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(wallets[0]?.currency ?? "RWF");
  const [busy, setBusy] = useState(false);

  const selected = wallets.find((w) => w.currency === currency);
  const avail = availability.find((a) => a.walletId === selected?.id);

  async function requestWithdrawal() {
    const minor = Math.round(Number(amount) * 100);
    if (!Number.isInteger(minor) || minor <= 0) {
      onError("Enter a valid positive amount.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/wallet/withdrawals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountMinor: minor,
          currency,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      await readApi<{ withdrawalId: string }>(res);
      setAmount("");
      onChanged();
    } catch (error) {
      onError(error instanceof Error ? error.message : "We couldn't request this withdrawal. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const blocked = accountStatus === "locked" || accountStatus === "closed";

  return (
    <Card title="Withdraw" subtitle="Only your own available funds. Requests reserve funds until the payout provider confirms.">
      <div className="flex flex-col gap-3">
        {blocked ? (
          <p role="alert" className="text-sm font-medium text-red-700">
            Withdrawals are disabled while your account is {accountStatus}. Contact support for help.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            <TextField label="Amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="50.00" />
            <SelectField
              label="Currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              options={(wallets.length > 0 ? wallets.map((w) => w.currency) : ["RWF", "USD"]).map((c) => ({ value: c, label: c }))}
            />
            <div className="flex items-end">
              <Button loading={busy} onClick={requestWithdrawal}>
                Request withdrawal
              </Button>
            </div>
          </div>
        )}
        <p className="text-xs text-neutral-600">
          {avail ? `Available: ${formatMoney(avail.availableMinor, currency)}` : "No balance in this currency yet."}
          {minWithdrawalMinor !== null ? ` · Minimum withdrawal: ${formatMoney(minWithdrawalMinor, currency)}` : ""}
        </p>

        {withdrawals.length === 0 ? (
          <p className="text-sm text-neutral-600">No withdrawals yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {withdrawals.map((w) => (
              <li key={w.id} className="rounded-md border border-neutral-200 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono font-semibold">
                    −{formatMoney(w.amountMinor, w.currency)}
                  </span>
                  <StatusBadge status={w.status} />
                </div>
                <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-600">
                  <span>{new Date(w.createdAt).toLocaleString("en-US")}</span>
                  {w.providerStatus && w.providerStatus !== "awaiting_review" ? (
                    <span>Provider: {w.providerStatus.replace(/_/g, " ")}</span>
                  ) : null}
                </div>
                {w.status === "pending" || w.status === "approved" ? (
                  <p className="mt-1 text-xs text-neutral-600">
                    Funds are reserved and excluded from your available balance until payout settles.
                  </p>
                ) : null}
                {w.failureReason ? (
                  <p className="mt-1 text-xs font-medium text-red-700">{w.failureReason}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
