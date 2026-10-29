"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ROUTES } from "@/lib/routes";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge, Card, StatusBadge } from "@/components/ui/Card";
import { LoadError, SkeletonList } from "@/components/ui/Feedback";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Fields";
import { ErrorDialog, Modal } from "@/components/ui/Modal";

interface GroupDetail {
  group: { id: string; name: string; description: string | null; objective: string | null };
  myRole: string;
  members: Array<{ userId: string; role: string; name: string; shortId: string }>;
  approvals: Array<{
    id: string;
    kind: string;
    status: string;
    note: string | null;
    createdAt: string;
    requesterName: string;
    requesterShortId: string;
  }>;
  providerLinks: Array<{ id: string; status: string; providerName: string; providerShortId: string }>;
}

export function GroupDetailPage({ groupId }: { groupId: string }) {
  const router = useRouter();
  const [detail, setDetail] = useState<GroupDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [shortId, setShortId] = useState("");
  const [startingChat, setStartingChat] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const res = await fetch(`/api/groups/${encodeURIComponent(groupId)}`, { cache: "no-store" });
      if (!res.ok) throw new Error();
      const body = (await res.json()) as { ok: boolean; data?: GroupDetail };
      if (!body.ok || !body.data) throw new Error();
      setDetail(body.data);
    } catch {
      setFailed(true);
    }
  }, [groupId]);

  useEffect(() => {
    load();
  }, [load]);

  async function addMember() {
    try {
      const res = await fetch(`/api/groups/${encodeURIComponent(groupId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shortId: shortId.trim().toUpperCase() }),
      });
      const body = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !body.ok) {
        setError(body.error ?? "We couldn't add this member. Please try again.");
        return;
      }
      setAddOpen(false);
      setShortId("");
      load();
    } catch {
      setError("Your connection was interrupted. Please try again.");
    }
  }

  async function openGroupChat() {
    setStartingChat(true);
    setError(null);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "group", groupId }),
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { conversationId: string };
        error?: string;
      };
      if (!res.ok || !body.ok || !body.data) {
        setError(body.error ?? "We couldn't open the group conversation. Please try again.");
        return;
      }
      router.push(ROUTES.chatThread(body.data.conversationId));
    } catch {
      setError("Your connection was interrupted. Please try again.");
    } finally {
      setStartingChat(false);
    }
  }

  async function decide(approvalId: string, decision: "approved" | "rejected") {
    try {
      const res = await fetch(`/api/groups/${encodeURIComponent(groupId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approvalId, decision }),
      });
      const body = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !body.ok) {
        setError(body.error ?? "We couldn't record your decision. Please try again.");
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
        <PageHeader title="Group" />
        <LoadError message="We couldn't open this group. You may not be a member." onRetry={load} />
      </>
    );
  }
  if (!detail) {
    return (
      <>
        <PageHeader title="Group" />
        <SkeletonList rows={3} />
      </>
    );
  }

  const isAdmin = detail.myRole === "admin";

  return (
    <>
      <PageHeader
        title={detail.group.name}
        description={detail.group.objective ?? detail.group.description ?? undefined}
        actions={
          <>
            <Badge tone={isAdmin ? "info" : "neutral"}>{detail.myRole}</Badge>
            <Button size="sm" variant="secondary" icon="message" loading={startingChat} onClick={openGroupChat}>
              Open group chat
            </Button>
            {isAdmin ? (
              <Button size="sm" icon="user-plus" onClick={() => setAddOpen(true)}>
                Add member
              </Button>
            ) : null}
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={`Members (${detail.members.length})`}>
          <ul className="flex flex-col gap-2">
            {detail.members.map((m) => (
              <li key={m.userId} className="flex items-center justify-between gap-2 rounded-md border border-neutral-200 p-2.5 text-sm">
                <Link href={ROUTES.profileById(m.shortId)} className="font-medium text-brand-700 hover:underline">
                  {m.name} <span className="font-mono text-xs">({m.shortId})</span>
                </Link>
                <Badge tone={m.role === "admin" ? "info" : "neutral"}>{m.role}</Badge>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Approvals">
          {detail.approvals.length === 0 ? (
            <p className="text-sm text-neutral-600">No approval requests. Member requests for provider connections and funding appear here.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {detail.approvals.map((a) => (
                <li key={a.id} className="rounded-md border border-neutral-200 p-2.5 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      <span className="font-medium">{a.requesterName}</span>{" "}
                      <span className="font-mono text-xs">({a.requesterShortId})</span> · {a.kind.replace(/_/g, " ")}
                    </span>
                    <StatusBadge status={a.status} />
                  </div>
                  {a.note ? <p className="mt-1 text-neutral-600">{a.note}</p> : null}
                  {isAdmin && a.status === "pending" ? (
                    <div className="mt-2 flex gap-2">
                      <Button size="sm" icon="check" onClick={() => decide(a.id, "approved")}>
                        Approve
                      </Button>
                      <Button size="sm" variant="secondary" icon="xmark" onClick={() => decide(a.id, "rejected")}>
                        Reject
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Provider connections" className="lg:col-span-2">
          {detail.providerLinks.length === 0 ? (
            <p className="text-sm text-neutral-600">
              No provider connections. Request one from{" "}
              <Link href={ROUTES.conneckt} className="font-medium text-brand-700 hover:underline">
                Conneckt
              </Link>{" "}
              and it will appear here after internal approval.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {detail.providerLinks.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-2 rounded-md border border-neutral-200 p-2.5 text-sm">
                  <Link href={ROUTES.profileById(l.providerShortId)} className="font-medium text-brand-700 hover:underline">
                    {l.providerName}
                  </Link>
                  <StatusBadge status={l.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {addOpen ? (
        <Modal title="Add member" onClose={() => setAddOpen(false)}>
          <TextField
            label="Identifier"
            value={shortId}
            onChange={(e) => setShortId(e.target.value.toUpperCase())}
            placeholder="A2WD"
            maxLength={4}
          />
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button disabled={!/^[A-Z0-9]{4}$/.test(shortId.trim())} onClick={addMember}>
              Add
            </Button>
          </div>
        </Modal>
      ) : null}
      {error ? <ErrorDialog message={error} onClose={() => setError(null)} /> : null}
    </>
  );
}
