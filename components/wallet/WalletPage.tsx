"use client";

import { useCallback, useEffect, useState } from "react";
import { formatMoney } from "@/lib/currency";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, StatusBadge } from "@/components/ui/Card";
import { EmptyState, LoadError, PendingIntegration, SkeletonList } from "@/components/ui/Feedback";
import { Button } from "@/components/ui/Button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/Fields";
import { FileUpload } from "@/components/ui/FileUpload";
import { ErrorDialog, Modal } from "@/components/ui/Modal";
import { Tabs } from "@/components/ui/Tabs";

interface WalletRow {
  id: string;
  ownerType: string;
  ownerId: string;
  currency: string;
  balanceMinor: number;
}
interface EntryRow {
  id: string;
  direction: string;
  amountMinor: number;
  currency: string;
  reference: string;
  status: string;
  kind: string;
  createdAt: string;
}

function EntryList({
  entries,
  onDecide,
  canDecide,
}: {
  entries: EntryRow[];
  onDecide?: (id: string, decision: "approved" | "rejected") => void;
  canDecide?: (e: EntryRow) => boolean;
}) {
  if (entries.length === 0) {
    return <p className="text-sm text-neutral-600">No transactions yet.</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {entries.map((e) => (
        <li key={e.id} className="rounded-md border border-neutral-200 p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-mono text-xs text-neutral-600">{e.reference}</span>
            <StatusBadge status={e.status} />
          </div>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
            <span className="capitalize">
              {e.kind.replace(/_/g, " ")} · {e.direction}
            </span>
            <span className={`font-mono font-semibold ${e.direction === "credit" ? "text-green-700" : "text-black"}`}>
              {e.direction === "credit" ? "+" : "−"}
              {formatMoney(e.amountMinor, e.currency)}
            </span>
          </div>
          {onDecide && canDecide?.(e) && e.status === "pending" ? (
            <div className="mt-2 flex gap-2">
              <Button size="sm" icon="check" onClick={() => onDecide(e.id, "approved")}>
                Confirm
              </Button>
              <Button size="sm" variant="secondary" icon="xmark" onClick={() => onDecide(e.id, "rejected")}>
                Reject
              </Button>
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function WalletPage() {
  const [individual, setIndividual] = useState<{ wallets: WalletRow[]; entries: EntryRow[] } | null>(null);
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

  // Self-funding form
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [description, setDescription] = useState("");
  const [pasted, setPasted] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [proposed, setProposed] = useState<{ amountMinor: number; currency: string; direction: string; description?: string } | null>(null);
  const [aiPending, setAiPending] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Group forms
  const [contribAmount, setContribAmount] = useState("");
  const [contribGoal, setContribGoal] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [goalOpen, setGoalOpen] = useState(false);
  const [goalName, setGoalName] = useState("");
  const [goalTarget, setGoalTarget] = useState("");

  const loadIndividual = useCallback(async () => {
    const res = await fetch("/api/wallet?scope=individual", { cache: "no-store" });
    if (!res.ok) throw new Error();
    const body = (await res.json()) as { ok: boolean; data?: { wallets: WalletRow[]; entries: EntryRow[] } };
    if (!body.ok || !body.data) throw new Error();
    setIndividual(body.data);
  }, []);

  const loadGroup = useCallback(
    async (gid: string) => {
      if (!gid) {
        const res = await fetch("/api/wallet?scope=group", { cache: "no-store" });
        if (!res.ok) throw new Error();
        const body = (await res.json()) as { ok: boolean; data?: typeof groupData };
        if (!body.ok || !body.data) throw new Error();
        setGroupData(body.data);
        if (body.data.groups.length > 0) setGroupId(body.data.groups[0].groupId);
        return;
      }
      const res = await fetch(`/api/wallet?scope=group&groupId=${encodeURIComponent(gid)}`, { cache: "no-store" });
      if (!res.ok) throw new Error();
      const body = (await res.json()) as { ok: boolean; data?: typeof groupData };
      if (!body.ok || !body.data) throw new Error();
      setGroupData(body.data);
    },
    [],
  );

  const loadProvider = useCallback(async () => {
    const res = await fetch("/api/wallet?scope=provider", { cache: "no-store" });
    if (!res.ok) throw new Error();
    const body = (await res.json()) as { ok: boolean; data?: { entries: EntryRow[] } };
    if (!body.ok || !body.data) throw new Error();
    setProvider(body.data);
  }, []);

  const loadAll = useCallback(async () => {
    setFailed(false);
    try {
      await Promise.all([loadIndividual(), loadGroup(groupId), loadProvider()]);
    } catch {
      setFailed(true);
    }
  }, [loadIndividual, loadGroup, loadProvider, groupId]);

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (groupId) loadGroup(groupId).catch(() => {});
  }, [groupId, loadGroup]);

  async function uploadProof(file: File) {
    setBusy(true);
    setAiPending(null);
    setProposed(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("module", "wallet");
      const res = await fetch("/api/documents", { method: "POST", body: form });
      const body = (await res.json()) as { ok: boolean; data?: { documentId: string; jobId: string }; error?: string };
      if (!res.ok || !body.ok || !body.data) {
        setError(body.error ?? "We couldn't store your file. Please try again.");
        return;
      }
      setDocumentId(body.data.documentId);
      setJobId(body.data.jobId);
      await runExtraction(body.data.jobId);
    } catch {
      setError("Your connection was interrupted. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function submitPasted() {
    if (!pasted.trim()) return;
    setBusy(true);
    setAiPending(null);
    setProposed(null);
    try {
      const res = await fetch("/api/documents", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: pasted.trim(), module: "wallet" }),
      });
      const body = (await res.json()) as { ok: boolean; data?: { jobId: string }; error?: string };
      if (!res.ok || !body.ok || !body.data) {
        setError(body.error ?? "We couldn't submit the text. Please try again.");
        return;
      }
      setJobId(body.data.jobId);
      await runExtraction(body.data.jobId);
    } catch {
      setError("Your connection was interrupted. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function runExtraction(id: string) {
    const res = await fetch(`/api/documents/jobs/${encodeURIComponent(id)}`, { method: "POST" });
    const body = (await res.json()) as {
      ok: boolean;
      data?: { pending?: boolean; pendingReason?: string; proposed?: { amountMinor: number; currency: string; direction: string; description?: string } };
      error?: string;
    };
    if (!res.ok || !body.ok) {
      setError(body.error ?? "Extraction failed. Enter the values manually.");
      return;
    }
    if (body.data?.pending) {
      setAiPending(body.data.pendingReason ?? "AI parsing is not configured");
      return;
    }
    if (body.data?.proposed) {
      setProposed(body.data.proposed);
      setAmount(String(body.data.proposed.amountMinor / 100));
      setCurrency(body.data.proposed.currency);
      setDescription(body.data.proposed.description ?? "");
    }
  }

  async function submitSelfFunding() {
    const minor = Math.round(Number(amount) * 100);
    if (!Number.isInteger(minor) || minor <= 0) {
      setError("Enter a valid positive amount.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/wallet/self-funding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currency: currency.toUpperCase(),
          transaction: {
            amountMinor: minor,
            currency: currency.toUpperCase(),
            direction: "credit",
            description: description || undefined,
          },
          documentId: documentId ?? undefined,
          parsingJobId: jobId ?? undefined,
        }),
      });
      const body = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !body.ok) {
        setError(body.error ?? "We couldn't record this funding. Please try again.");
        return;
      }
      setAmount("");
      setDescription("");
      setPasted("");
      setJobId(null);
      setDocumentId(null);
      setProposed(null);
      loadIndividual();
    } catch {
      setError("Your connection was interrupted. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function decideSelf(entryId: string, decision: "approved" | "rejected") {
    try {
      const res = await fetch("/api/wallet/self-funding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryId, decision }),
      });
      const body = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !body.ok) {
        setError(body.error ?? "We couldn't process this transaction. Please try again.");
        return;
      }
      loadIndividual();
    } catch {
      setError("Your connection was interrupted. Please try again.");
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
      const body = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !body.ok) {
        setError(body.error ?? "We couldn't record your contribution. Please try again.");
        return;
      }
      setContribAmount("");
      setContribGoal("");
      loadGroup(groupId);
    } catch {
      setError("Your connection was interrupted. Please try again.");
    }
  }

  async function decideContribution(id: string, decision: "approved" | "rejected") {
    try {
      const res = await fetch("/api/wallet/group", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contributionId: id, decision }),
      });
      const body = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !body.ok) {
        setError(body.error ?? "We couldn't process this contribution. Please try again.");
        return;
      }
      loadGroup(groupId);
    } catch {
      setError("Your connection was interrupted. Please try again.");
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
      const body = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !body.ok) {
        setError(body.error ?? "We couldn't request this withdrawal. Please try again.");
        return;
      }
      setWithdrawAmount("");
      loadGroup(groupId);
    } catch {
      setError("Your connection was interrupted. Please try again.");
    }
  }

  async function decideWithdrawal(id: string, decision: "approved" | "rejected") {
    try {
      const res = await fetch("/api/wallet/withdrawals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ withdrawalId: id, decision }),
      });
      const body = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !body.ok) {
        setError(body.error ?? "We couldn't process this withdrawal. Please try again.");
        return;
      }
      loadGroup(groupId);
    } catch {
      setError("Your connection was interrupted. Please try again.");
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
      const body = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !body.ok) {
        setError(body.error ?? "We couldn't create this goal. Please try again.");
        return;
      }
      setGoalOpen(false);
      setGoalName("");
      setGoalTarget("");
      loadGroup(groupId);
    } catch {
      setError("Your connection was interrupted. Please try again.");
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
  if (!individual) {
    return (
      <>
        <PageHeader title="Wallet" />
        <SkeletonList rows={4} />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Wallet" description="Auditable balances. Nothing moves without verification and approval." />
      <Tabs
        tabs={[
          {
            id: "individual",
            label: "Individual Funding",
            icon: "user",
            content: (
              <div className="flex flex-col gap-4">
                <Card title="Balances">
                  {individual.wallets.length === 0 ? (
                    <p className="text-sm text-neutral-600">No wallet yet — record your first self-funding below.</p>
                  ) : (
                    <ul className="flex flex-col gap-1">
                      {individual.wallets.map((w) => (
                        <li key={w.id} className="flex justify-between text-sm">
                          <span className="font-mono">{w.currency}</span>
                          <span className="font-mono font-semibold">{formatMoney(w.balanceMinor, w.currency)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>

                <Card title="Record self-funding" subtitle="Upload proof or paste a transaction message, review the extracted values, then confirm.">
                  <div className="flex flex-col gap-3">
                    <FileUpload label="Supporting document" onSelect={uploadProof} />
                    <TextAreaField
                      label="Or paste a transaction message"
                      value={pasted}
                      onChange={(e) => setPasted(e.target.value)}
                      placeholder="Received 50,000 RWF from …"
                    />
                    <div>
                      <Button variant="secondary" size="sm" loading={busy} disabled={!pasted.trim()} onClick={submitPasted}>
                        Extract from text
                      </Button>
                    </div>
                    {aiPending ? <PendingIntegration name="AI document parsing" detail={aiPending} /> : null}
                    {proposed ? (
                      <p className="rounded-md border border-brand-200 bg-brand-50 p-3 text-sm">
                        Proposed by document parsing — review before confirming:{" "}
                        <span className="font-mono font-semibold">
                          {formatMoney(proposed.amountMinor, proposed.currency)}
                        </span>
                      </p>
                    ) : null}
                    <div className="grid gap-3 sm:grid-cols-3">
                      <TextField label="Amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="50.00" />
                      <TextField label="Currency" value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={3} />
                      <TextField label="Description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Salary savings" />
                    </div>
                    <div>
                      <Button loading={busy} onClick={submitSelfFunding}>
                        Record for review
                      </Button>
                    </div>
                  </div>
                </Card>

                <Card title="Transaction history">
                  <EntryList entries={individual.entries} onDecide={decideSelf} canDecide={(e) => e.kind === "self_funding"} />
                </Card>
              </div>
            ),
          },
          {
            id: "group",
            label: "Group Funding",
            icon: "user-group",
            content: groupData === null ? (
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
                <Card title="Pending contributions">
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
            content: provider === null ? (
              <SkeletonList rows={2} />
            ) : provider.entries.length === 0 ? (
              <EmptyState icon="funding" title="No provider funding" message="Approved provider funding for you or your groups appears here with full references." />
            ) : (
              <Card title="Provider funding received">
                <EntryList entries={provider.entries} />
              </Card>
            ),
          },
        ]}
      />
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
