"use client";

import { useCallback, useEffect, useState } from "react";
import { formatMoney } from "@/lib/currency";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, StatusBadge } from "@/components/ui/Card";
import { EmptyState, LoadError, SkeletonList } from "@/components/ui/Feedback";
import { Button } from "@/components/ui/Button";
import { SelectField, TextField } from "@/components/ui/Fields";
import { ErrorDialog, Modal } from "@/components/ui/Modal";
import { Tabs } from "@/components/ui/Tabs";
import { AccountSettings, SavingsProgress } from "./AccountSettings";
import { DepositIntake } from "./DepositIntake";
import { ReviewQueue } from "./ReviewQueue";
import { WithdrawPanel } from "./WithdrawPanel";
import {
  readApi,
  type AvailabilityRow,
  type EntryRow,
  type MemberAccountRow,
  type WalletRow,
  type WithdrawalRow,
} from "./types";

function EntryList({
  entries,
  onOwnerAction,
}: {
  entries: EntryRow[];
  onOwnerAction?: (id: string, action: "cancel" | "resubmit") => void;
}) {
  if (entries.length === 0) {
    return <p className="text-sm text-neutral-600">No transactions yet.</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {entries.map((e) => (
        <li key={e.id} className="rounded-md border border-neutral-200 p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-mono text-xs text-neutral-600">
              {e.reference} · {new Date(e.createdAt).toLocaleDateString("en-US")}
            </span>
            <StatusBadge status={e.status} />
          </div>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
            <span className="capitalize">{e.kind.replace(/_/g, " ")}</span>
            <span className={`font-mono font-semibold ${e.direction === "credit" ? "text-green-700" : "text-black"}`}>
              {e.direction === "credit" ? "+" : "−"}
              {formatMoney(e.amountMinor, e.currency)}
            </span>
          </div>
          {e.reason && (e.status === "rejected" || e.status === "needs_evidence") ? (
            <p className="mt-1 text-xs text-neutral-600">
              <span className="font-medium text-black">
                {e.status === "rejected" ? "Rejection reason: " : "Evidence needed: "}
              </span>
              {e.reason}
            </p>
          ) : null}
          {onOwnerAction && (e.status === "pending" || e.status === "needs_evidence") ? (
            <div className="mt-2 flex gap-2">
              {e.status === "needs_evidence" ? (
                <Button size="sm" icon="check" onClick={() => onOwnerAction(e.id, "resubmit")}>
                  Resubmit
                </Button>
              ) : null}
              <Button size="sm" variant="secondary" icon="xmark" onClick={() => onOwnerAction(e.id, "cancel")}>
                Cancel
              </Button>
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

interface IndividualData {
  wallets: WalletRow[];
  entries: EntryRow[];
  withdrawals: WithdrawalRow[];
  availability: AvailabilityRow[];
  pendingCreditMinor: number;
  isReviewer: boolean;
}

export function WalletPage() {
  const [individual, setIndividual] = useState<IndividualData | null>(null);
  const [account, setAccount] = useState<MemberAccountRow | null>(null);
  const [groupData, setGroupData] = useState<{
    groups: Array<{ groupId: string; role: string }>;
    wallets: WalletRow[];
    entries: EntryRow[];
    goals: Array<{ id: string; name: string; kind: string; targetMinor: number | null; currency: string }>;
    contributions: Array<{ id: string; amountMinor: number; currency: string; status: string; goalId: string | null; createdAt: string }>;
    withdrawals: Array<{ id: string; amountMinor: number; currency: string; status: string; createdAt: string }>;
    isAdmin: boolean;
  } | null>(null);
  const [provider, setProvider] = useState<{ entries: EntryRow[] } | null>(null);
  const [groupId, setGroupId] = useState("");
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<"deposit" | "withdraw" | null>(null);

  // Group forms
  const [contribAmount, setContribAmount] = useState("");
  const [contribGoal, setContribGoal] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [goalOpen, setGoalOpen] = useState(false);
  const [goalName, setGoalName] = useState("");
  const [goalTarget, setGoalTarget] = useState("");

  const loadIndividual = useCallback(async () => {
    const res = await fetch("/api/wallet?scope=individual", { cache: "no-store" });
    setIndividual(await readApi<IndividualData>(res));
  }, []);

  const loadAccount = useCallback(async () => {
    const res = await fetch("/api/wallet/account", { cache: "no-store" });
    const data = await readApi<{ account: MemberAccountRow }>(res);
    setAccount(data.account);
  }, []);

  const loadGroup = useCallback(async (gid: string) => {
    if (!gid) {
      const res = await fetch("/api/wallet?scope=group", { cache: "no-store" });
      const data = await readApi<typeof groupData>(res);
      setGroupData(data);
      if (data && data.groups.length > 0) setGroupId(data.groups[0].groupId);
      return;
    }
    const res = await fetch(`/api/wallet?scope=group&groupId=${encodeURIComponent(gid)}`, { cache: "no-store" });
    setGroupData(await readApi(res));
  }, []);

  const loadProvider = useCallback(async () => {
    const res = await fetch("/api/wallet?scope=provider", { cache: "no-store" });
    setProvider(await readApi(res));
  }, []);

  const loadAll = useCallback(async () => {
    setFailed(false);
    try {
      await Promise.all([loadIndividual(), loadAccount(), loadGroup(groupId), loadProvider()]);
    } catch {
      setFailed(true);
    }
  }, [loadIndividual, loadAccount, loadGroup, loadProvider, groupId]);

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (groupId) loadGroup(groupId).catch(() => {});
  }, [groupId, loadGroup]);

  async function ownerAction(entryId: string, ownerAct: "cancel" | "resubmit") {
    try {
      const res = await fetch("/api/wallet/self-funding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryId, action: ownerAct }),
      });
      await readApi(res);
      loadIndividual();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Your connection was interrupted. Please try again.");
    }
  }

  async function contribute() {
    const minor = Math.round(Number(contribAmount) * 100);
    if (!groupId || !Number.isInteger(minor) || minor <= 0) {
      setError("Enter a valid positive amount.");
      return;
    }
    try {
      const res = await fetch("/api/wallet/group", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId, goalId: contribGoal || undefined, amountMinor: minor, currency: "USD" }),
      });
      await readApi(res);
      setContribAmount("");
      setContribGoal("");
      loadGroup(groupId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't record your contribution. Please try again.");
    }
  }

  async function decideContribution(id: string, decision: "approved" | "rejected") {
    const reason = decision === "rejected" ? window.prompt("Rejection reason (required):") : undefined;
    if (decision === "rejected" && !reason?.trim()) return;
    try {
      const res = await fetch("/api/wallet/group", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contributionId: id, decision, reason: reason?.trim() }),
      });
      await readApi(res);
      loadGroup(groupId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't process this contribution. Please try again.");
    }
  }

  async function requestWithdrawal() {
    const minor = Math.round(Number(withdrawAmount) * 100);
    if (!groupId || !Number.isInteger(minor) || minor <= 0) {
      setError("Enter a valid positive amount.");
      return;
    }
    try {
      const res = await fetch("/api/wallet/group", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId, amountMinor: minor, currency: "USD" }),
      });
      await readApi(res);
      setWithdrawAmount("");
      loadGroup(groupId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't request this withdrawal. Please try again.");
    }
  }

  async function decideWithdrawal(id: string, decision: "approved" | "rejected") {
    const reason = decision === "rejected" ? window.prompt("Rejection reason (required):") : undefined;
    if (decision === "rejected" && !reason?.trim()) return;
    try {
      const res = await fetch("/api/wallet/withdrawals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ withdrawalId: id, decision, reason: reason?.trim() }),
      });
      await readApi(res);
      loadGroup(groupId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't process this withdrawal. Please try again.");
    }
  }

  async function createGoal() {
    const target = goalTarget ? Math.round(Number(goalTarget) * 100) : undefined;
    try {
      const res = await fetch("/api/wallet/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId, name: goalName.trim(), kind: "targeted", targetMinor: target, currency: "USD" }),
      });
      await readApi(res);
      setGoalOpen(false);
      setGoalName("");
      setGoalTarget("");
      loadGroup(groupId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't create this goal. Please try again.");
    }
  }

  if (failed) {
    return (
      <>
        <PageHeader title="Wallet" />
        <LoadError onRetry={loadAll} />
      </>
    );
  }
  if (!individual || !account) {
    return (
      <>
        <PageHeader title="Wallet" />
        <SkeletonList rows={4} />
      </>
    );
  }

  const primaryWallet =
    individual.wallets.find((w) => w.currency === account.currency) ?? individual.wallets[0];
  const primaryAvail = individual.availability.find((a) => a.walletId === primaryWallet?.id);
  const primaryAvailable = primaryAvail?.availableMinor ?? 0;

  const tabs = [
    {
      id: "account",
      label: "My Account",
      icon: "wallet",
      content: (
        <div className="flex flex-col gap-4">
          <Card title="My available balance">
            {primaryWallet ? (
              <>
                <p className="text-3xl font-bold tracking-tight text-black">
                  {formatMoney(primaryAvailable, primaryWallet.currency)}
                </p>
                <p className="mt-1 text-sm text-neutral-600">
                  Pending approval: {formatMoney(individual.pendingCreditMinor, primaryWallet.currency)}
                  {primaryAvail && primaryAvail.reservedMinor > 0
                    ? ` · Reserved: ${formatMoney(primaryAvail.reservedMinor, primaryWallet.currency)}`
                    : ""}
                </p>
                {individual.wallets.length > 1 ? (
                  <ul className="mt-3 flex flex-col gap-1 border-t border-neutral-100 pt-3">
                    {individual.wallets
                      .filter((w) => w.id !== primaryWallet.id)
                      .map((w) => {
                        const a = individual.availability.find((x) => x.walletId === w.id);
                        return (
                          <li key={w.id} className="flex justify-between text-sm">
                            <span className="font-mono">{w.currency}</span>
                            <span className="font-mono font-semibold">
                              {formatMoney(a?.availableMinor ?? w.balanceMinor, w.currency)}
                            </span>
                          </li>
                        );
                      })}
                  </ul>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-neutral-600">
                No wallet yet — make your first deposit below. Balances update only after a reviewer approves.
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button icon="plus" onClick={() => setAction(action === "deposit" ? null : "deposit")}>
                Deposit
              </Button>
              <Button
                variant="secondary"
                icon="transfer"
                onClick={() => setAction(action === "withdraw" ? null : "withdraw")}
              >
                Withdraw
              </Button>
            </div>
          </Card>

          {action === "deposit" ? (
            <DepositIntake onSubmitted={loadIndividual} onError={setError} />
          ) : null}
          {action === "withdraw" ? (
            <WithdrawPanel
              wallets={individual.wallets}
              availability={individual.availability}
              withdrawals={individual.withdrawals}
              minWithdrawalMinor={account.minWithdrawalMinor}
              accountStatus={account.status}
              onChanged={loadIndividual}
              onError={setError}
            />
          ) : null}

          <SavingsProgress account={account} availableMinor={primaryAvailable} />

          <Card title="Recent transactions">
            <EntryList entries={individual.entries} onOwnerAction={ownerAction} />
          </Card>

          <AccountSettings account={account} onChanged={setAccount} onError={setError} />
        </div>
      ),
    },
    {
      id: "group",
      label: "Group Funding",
      icon: "user-group",
      content:
        groupData === null ? (
          <SkeletonList rows={2} />
        ) : groupData.groups.length === 0 ? (
          <EmptyState icon="user-group" title="No groups" message="Join or create a group to use shared wallets." />
        ) : (
          <div className="flex flex-col gap-4">
            <SelectField
              label="Group wallet"
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              options={groupData.groups.map((g) => ({ value: g.groupId, label: `Group ${g.groupId.slice(0, 8)} (${g.role})` }))}
            />
            <Card title="Balances">
              {groupData.wallets.length === 0 ? (
                <p className="text-sm text-neutral-600">No group wallet yet — contribute below to open one.</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {groupData.wallets.map((w) => (
                    <li key={w.id} className="flex justify-between text-sm">
                      <span className="font-mono">{w.currency}</span>
                      <span className="font-mono font-semibold">{formatMoney(w.balanceMinor, w.currency)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title="Contribute">
              <div className="grid gap-3 sm:grid-cols-3">
                <TextField label="Amount" inputMode="decimal" value={contribAmount} onChange={(e) => setContribAmount(e.target.value)} />
                <SelectField
                  label="Savings goal (optional)"
                  value={contribGoal}
                  onChange={(e) => setContribGoal(e.target.value)}
                  options={[{ value: "", label: "General savings" }, ...groupData.goals.map((g) => ({ value: g.id, label: g.name }))]}
                />
                <div className="flex items-end">
                  <Button onClick={contribute}>Contribute</Button>
                </div>
              </div>
              <p className="mt-2 text-xs text-neutral-600">Contributions need admin approval before the balance changes.</p>
            </Card>
            <Card
              title="Savings goals"
              actions={
                groupData.isAdmin ? (
                  <Button size="sm" variant="secondary" onClick={() => setGoalOpen(true)}>
                    New goal
                  </Button>
                ) : undefined
              }
            >
              {groupData.goals.length === 0 ? (
                <p className="text-sm text-neutral-600">No savings goals yet.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {groupData.goals.map((g) => (
                    <li key={g.id} className="rounded-md border border-neutral-200 p-2.5 text-sm">
                      <span className="font-medium">{g.name}</span>{" "}
                      <span className="text-neutral-600">
                        ({g.kind}
                        {g.targetMinor ? ` · target ${formatMoney(g.targetMinor, g.currency)}` : ""})
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title={groupData.isAdmin ? "Pending contributions" : "My pending contributions"}>
              {groupData.contributions.filter((c) => c.status === "pending").length === 0 ? (
                <p className="text-sm text-neutral-600">Nothing awaiting approval.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {groupData.contributions.filter((c) => c.status === "pending").map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-neutral-200 p-2.5 text-sm">
                      <span className="font-mono font-semibold">{formatMoney(c.amountMinor, c.currency)}</span>
                      {groupData.isAdmin ? (
                        <div className="flex gap-2">
                          <Button size="sm" icon="check" onClick={() => decideContribution(c.id, "approved")}>Approve</Button>
                          <Button size="sm" variant="secondary" icon="xmark" onClick={() => decideContribution(c.id, "rejected")}>Reject</Button>
                        </div>
                      ) : (
                        <StatusBadge status={c.status} />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title="Withdrawals">
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <TextField label="Request amount" inputMode="decimal" value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} />
                </div>
                <Button variant="secondary" onClick={requestWithdrawal}>
                  Request withdrawal
                </Button>
              </div>
              <p className="mb-2 text-xs text-neutral-600">Withdrawals debit the group wallet only — never another member&apos;s personal funds.</p>
              {groupData.withdrawals.length === 0 ? (
                <p className="text-sm text-neutral-600">No withdrawals yet.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {groupData.withdrawals.map((w) => (
                    <li key={w.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-neutral-200 p-2.5 text-sm">
                      <span className="font-mono font-semibold">{formatMoney(w.amountMinor, w.currency)}</span>
                      {groupData.isAdmin && w.status === "pending" ? (
                        <div className="flex gap-2">
                          <Button size="sm" icon="check" onClick={() => decideWithdrawal(w.id, "approved")}>Approve</Button>
                          <Button size="sm" variant="secondary" icon="xmark" onClick={() => decideWithdrawal(w.id, "rejected")}>Reject</Button>
                        </div>
                      ) : (
                        <StatusBadge status={w.status} />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title="Ledger">
              <EntryList entries={groupData.entries} />
            </Card>
          </div>
        ),
    },
    {
      id: "provider",
      label: "Provider Funding",
      icon: "landmark",
      content:
        provider === null ? (
          <SkeletonList rows={2} />
        ) : provider.entries.length === 0 ? (
          <EmptyState icon="funding" title="No provider funding" message="Approved provider funding for you or your groups appears here with full references." />
        ) : (
          <Card title="Provider funding received">
            <EntryList entries={provider.entries} />
          </Card>
        ),
    },
  ];

  if (individual.isReviewer) {
    tabs.splice(1, 0, {
      id: "reviews",
      label: "Review Queue",
      icon: "shield",
      content: <ReviewQueue onError={setError} />,
    });
  }

  return (
    <>
      <PageHeader title="Wallet" description="Auditable balances. Nothing moves without verification and approval." />
      <Tabs tabs={tabs} />
      {goalOpen ? (
        <Modal title="New savings goal" onClose={() => setGoalOpen(false)}>
          <div className="flex flex-col gap-3">
            <TextField label="Goal name" value={goalName} onChange={(e) => setGoalName(e.target.value)} />
            <TextField label="Target amount (optional)" inputMode="decimal" value={goalTarget} onChange={(e) => setGoalTarget(e.target.value)} />
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setGoalOpen(false)}>Cancel</Button>
            <Button disabled={goalName.trim().length < 3} onClick={createGoal}>Create goal</Button>
          </div>
        </Modal>
      ) : null}
      {error ? <ErrorDialog message={error} onClose={() => setError(null)} /> : null}
    </>
  );
}
