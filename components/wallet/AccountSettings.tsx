"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/currency";
import { Button } from "@/components/ui/Button";
import { Card, StatusBadge } from "@/components/ui/Card";
import { SelectField, TextField } from "@/components/ui/Fields";
import { Modal } from "@/components/ui/Modal";
import { readApi, type MemberAccountRow } from "./types";

function toMajor(minor: number | null): string {
  return minor === null ? "" : String(minor / 100);
}

function toMinor(major: string): number | null {
  if (major.trim() === "") return null;
  const minor = Math.round(Number(major) * 100);
  return Number.isInteger(minor) && minor > 0 ? minor : null;
}

function toDateInput(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

function toIsoDate(input: string): string | null {
  return input ? new Date(`${input}T00:00:00.000Z`).toISOString() : null;
}

/**
 * Savings target progress (wallet.md §1 concept): available balance toward
 * the member's own target, with target date.
 */
export function SavingsProgress({
  account,
  availableMinor,
}: {
  account: MemberAccountRow;
  availableMinor: number;
}) {
  if (account.savingsTargetMinor === null) {
    return (
      <Card title="My savings target">
        <p className="text-sm text-neutral-600">
          No target set yet. Open account settings to set your savings goal.
        </p>
      </Card>
    );
  }
  const pct = Math.min(100, Math.round((availableMinor / account.savingsTargetMinor) * 100));
  return (
    <Card title="My savings target">
      <p className="text-sm text-black">
        {formatMoney(Math.max(0, availableMinor), account.currency)} of{" "}
        {formatMoney(account.savingsTargetMinor, account.currency)}
      </p>
      <div
        className="mt-2 h-2.5 w-full rounded-full bg-neutral-200"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Savings progress"
      >
        <div className="h-2.5 rounded-full bg-brand-600" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-sm font-semibold text-black">{pct}%</p>
      {account.targetDate ? (
        <p className="mt-1 text-xs text-neutral-600">
          Target date: {new Date(account.targetDate).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" })}
        </p>
      ) : null}
    </Card>
  );
}

/**
 * Per-member savings account configuration (wallet.md FR-06): targets,
 * contribution limits, withdrawal minimum, period, notifications, privacy.
 */
export function AccountSettings({
  account,
  onChanged,
  onError,
}: {
  account: MemberAccountRow;
  onChanged: (account: MemberAccountRow) => void;
  onError: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState(toMajor(account.savingsTargetMinor));
  const [minContrib, setMinContrib] = useState(toMajor(account.minContributionMinor));
  const [maxContrib, setMaxContrib] = useState(toMajor(account.maxContributionMinor));
  const [minWithdraw, setMinWithdraw] = useState(toMajor(account.minWithdrawalMinor));
  const [startDate, setStartDate] = useState(toDateInput(account.startDate));
  const [targetDate, setTargetDate] = useState(toDateInput(account.targetDate));
  const [frequency, setFrequency] = useState(account.frequency);
  const [cooldownDays, setCooldownDays] = useState(
    account.withdrawalRules.cooldownDays !== undefined ? String(account.withdrawalRules.cooldownDays) : "",
  );
  const [notifyEmail, setNotifyEmail] = useState(account.notifyEmail);
  const [notifyInApp, setNotifyInApp] = useState(account.notifyInApp);
  const [visibility, setVisibility] = useState(account.visibility);

  function reopen() {
    setTarget(toMajor(account.savingsTargetMinor));
    setMinContrib(toMajor(account.minContributionMinor));
    setMaxContrib(toMajor(account.maxContributionMinor));
    setMinWithdraw(toMajor(account.minWithdrawalMinor));
    setStartDate(toDateInput(account.startDate));
    setTargetDate(toDateInput(account.targetDate));
    setFrequency(account.frequency);
    setCooldownDays(account.withdrawalRules.cooldownDays !== undefined ? String(account.withdrawalRules.cooldownDays) : "");
    setNotifyEmail(account.notifyEmail);
    setNotifyInApp(account.notifyInApp);
    setVisibility(account.visibility);
    setOpen(true);
  }

  async function save() {
    const minC = toMinor(minContrib);
    const maxC = toMinor(maxContrib);
    if (minContrib.trim() !== "" && minC === null) {
      onError("Minimum contribution must be a positive amount.");
      return;
    }
    if (maxContrib.trim() !== "" && maxC === null) {
      onError("Maximum contribution must be a positive amount.");
      return;
    }
    if (minC !== null && maxC !== null && minC > maxC) {
      onError("Minimum contribution cannot exceed maximum contribution.");
      return;
    }
    const cooldown = cooldownDays.trim() === "" ? undefined : Number(cooldownDays);
    if (cooldown !== undefined && (!Number.isInteger(cooldown) || cooldown < 0 || cooldown > 365)) {
      onError("Cooldown must be between 0 and 365 days.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/wallet/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          savingsTargetMinor: target.trim() === "" ? null : toMinor(target),
          minContributionMinor: minC,
          maxContributionMinor: maxC,
          minWithdrawalMinor: minWithdraw.trim() === "" ? null : toMinor(minWithdraw),
          startDate: toIsoDate(startDate),
          targetDate: toIsoDate(targetDate),
          frequency,
          withdrawalRules: { cooldownDays: cooldown },
          notifyEmail,
          notifyInApp,
          visibility,
        }),
      });
      const data = await readApi<{ account: MemberAccountRow }>(res);
      onChanged(data.account);
      setOpen(false);
    } catch (error) {
      onError(error instanceof Error ? error.message : "We couldn't save your settings. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Card
        title="Account settings"
        subtitle="Goals, contribution limits, period, notifications, and privacy."
        actions={
          <Button size="sm" variant="secondary" icon="gear" onClick={reopen}>
            Edit settings
          </Button>
        }
      >
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div className="flex justify-between gap-2">
            <dt className="text-neutral-600">Status</dt>
            <dd><StatusBadge status={account.status} /></dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-neutral-600">Currency</dt>
            <dd className="font-mono">{account.currency}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-neutral-600">Savings target</dt>
            <dd className="font-mono">
              {account.savingsTargetMinor !== null ? formatMoney(account.savingsTargetMinor, account.currency) : "—"}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-neutral-600">Contribution range</dt>
            <dd className="font-mono">
              {account.minContributionMinor !== null || account.maxContributionMinor !== null
                ? `${account.minContributionMinor !== null ? formatMoney(account.minContributionMinor, account.currency) : "no min"} – ${account.maxContributionMinor !== null ? formatMoney(account.maxContributionMinor, account.currency) : "no max"}`
                : "—"}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-neutral-600">Minimum withdrawal</dt>
            <dd className="font-mono">
              {account.minWithdrawalMinor !== null ? formatMoney(account.minWithdrawalMinor, account.currency) : "—"}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-neutral-600">Frequency</dt>
            <dd className="capitalize">{account.frequency}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-neutral-600">Notifications</dt>
            <dd>{[account.notifyEmail ? "Email" : null, account.notifyInApp ? "In-app" : null].filter(Boolean).join(" · ") || "Off"}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-neutral-600">Privacy</dt>
            <dd>{account.visibility === "group_totals" ? "Included in group totals" : "Private"}</dd>
          </div>
        </dl>
      </Card>

      {open ? (
        <Modal title="Account settings" onClose={() => setOpen(false)}>
          <div className="flex flex-col gap-3">
            <TextField label={`Savings target (${account.currency})`} inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="e.g. 500000" />
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label="Minimum contribution" inputMode="decimal" value={minContrib} onChange={(e) => setMinContrib(e.target.value)} placeholder="Optional" />
              <TextField label="Maximum contribution" inputMode="decimal" value={maxContrib} onChange={(e) => setMaxContrib(e.target.value)} placeholder="Optional" />
            </div>
            <TextField label="Minimum withdrawal" inputMode="decimal" value={minWithdraw} onChange={(e) => setMinWithdraw(e.target.value)} placeholder="Optional" hint="Separate from contribution limits and the savings target." />
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label="Start date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              <TextField label="Target date" type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <SelectField
                label="Contribution frequency"
                value={frequency}
                onChange={(e) => setFrequency(e.target.value)}
                options={[
                  { value: "weekly", label: "Weekly" },
                  { value: "biweekly", label: "Every two weeks" },
                  { value: "monthly", label: "Monthly" },
                  { value: "quarterly", label: "Quarterly" },
                  { value: "once", label: "Once" },
                ]}
              />
              <TextField label="Withdrawal cooldown (days)" inputMode="numeric" value={cooldownDays} onChange={(e) => setCooldownDays(e.target.value)} placeholder="0" />
            </div>
            <SelectField
              label="Privacy"
              value={visibility}
              onChange={(e) => setVisibility(e.target.value)}
              options={[
                { value: "private", label: "Private — only you and reviewers" },
                { value: "group_totals", label: "Include my savings in group totals" },
              ]}
            />
            <div className="flex flex-col gap-2 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={notifyEmail} onChange={(e) => setNotifyEmail(e.target.checked)} />
                Email notifications
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={notifyInApp} onChange={(e) => setNotifyInApp(e.target.checked)} />
                In-app notifications
              </label>
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button loading={busy} onClick={save}>Save settings</Button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
