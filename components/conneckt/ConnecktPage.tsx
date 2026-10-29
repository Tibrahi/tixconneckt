"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ROUTES } from "@/lib/routes";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge, Card } from "@/components/ui/Card";
import { EmptyState, LoadError, SkeletonList } from "@/components/ui/Feedback";
import { Button } from "@/components/ui/Button";
import { SearchInput } from "@/components/ui/Pagination";
import { SelectField } from "@/components/ui/Fields";
import { ErrorDialog, Modal } from "@/components/ui/Modal";
import { Tabs } from "@/components/ui/Tabs";

interface Connection {
  id: string;
  status: string;
  createdAt: string;
  direction: "incoming" | "outgoing";
  other: { id: string; name: string; shortId: string };
}

interface Provider {
  id: string;
  name: string;
  shortId: string;
  country: string | null;
}

interface ProviderLink {
  id: string;
  status: string;
  providerId: string;
  individualId: string | null;
  groupId: string | null;
  createdAt: string;
}

function ConnectionRow({
  item,
  onDecide,
}: {
  item: Connection;
  onDecide?: (id: string, decision: "accepted" | "rejected") => void;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-neutral-200 p-3">
      <Link
        href={ROUTES.profileById(item.other.shortId)}
        className="font-medium text-brand-700 hover:underline"
      >
        {item.other.name} <span className="font-mono text-xs">({item.other.shortId})</span>
      </Link>
      {onDecide ? (
        <div className="flex gap-2">
          <Button size="sm" icon="check" onClick={() => onDecide(item.id, "accepted")}>
            Accept
          </Button>
          <Button size="sm" variant="secondary" icon="xmark" onClick={() => onDecide(item.id, "rejected")}>
            Reject
          </Button>
        </div>
      ) : (
        <Badge tone={item.status === "accepted" ? "success" : "info"}>{item.status}</Badge>
      )}
    </li>
  );
}

export function ConnecktPage() {
  const [connections, setConnections] = useState<{ incoming: Connection[]; outgoing: Connection[]; accepted: Connection[] } | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [myLinks, setMyLinks] = useState<ProviderLink[]>([]);
  const [groupLinks, setGroupLinks] = useState<ProviderLink[]>([]);
  const [myGroupIds, setMyGroupIds] = useState<string[]>([]);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sending, setSending] = useState(false);
  const [linkModal, setLinkModal] = useState<Provider | null>(null);
  const [linkGroupId, setLinkGroupId] = useState("");

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const [cRes, pRes] = await Promise.all([
        fetch("/api/connections", { cache: "no-store" }),
        fetch("/api/providers", { cache: "no-store" }),
      ]);
      if (!cRes.ok || !pRes.ok) throw new Error();
      const cBody = (await cRes.json()) as { ok: boolean; data?: { incoming: Connection[]; outgoing: Connection[]; accepted: Connection[] } };
      const pBody = (await pRes.json()) as {
        ok: boolean;
        data?: { providers: Provider[]; myLinks: ProviderLink[]; groupLinks: ProviderLink[]; myGroupIds: string[] };
      };
      if (!cBody.ok || !cBody.data || !pBody.ok || !pBody.data) throw new Error();
      setConnections(cBody.data);
      setProviders(pBody.data.providers);
      setMyLinks(pBody.data.myLinks);
      setGroupLinks(pBody.data.groupLinks);
      setMyGroupIds(pBody.data.myGroupIds);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function sendRequest() {
    const id = search.trim().toUpperCase();
    if (!/^[A-Z0-9]{4}$/.test(id)) {
      setError("Enter a valid 4-character identifier, e.g. A2WD.");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shortId: id }),
      });
      const body = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !body.ok) {
        setError(body.error ?? "We couldn't send the request. Please try again.");
        return;
      }
      setSearch("");
      load();
    } catch {
      setError("Your connection was interrupted. Please try again.");
    } finally {
      setSending(false);
    }
  }

  async function decide(id: string, decision: "accepted" | "rejected") {
    try {
      const res = await fetch("/api/connections", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId: id, decision }),
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

  async function requestProviderLink() {
    if (!linkModal) return;
    try {
      const res = await fetch("/api/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerShortId: linkModal.shortId,
          groupId: linkGroupId || undefined,
        }),
      });
      const body = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !body.ok) {
        setError(body.error ?? "We couldn't send the request. Please try again.");
        return;
      }
      setLinkModal(null);
      setLinkGroupId("");
      load();
    } catch {
      setError("Your connection was interrupted. Please try again.");
    }
  }

  if (failed) {
    return (
      <>
        <PageHeader title="Conneckt" />
        <LoadError onRetry={load} />
      </>
    );
  }
  if (!connections) {
    return (
      <>
        <PageHeader title="Conneckt" />
        <SkeletonList rows={4} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Conneckt"
        description="Find collaborators by identifier, manage requests, and connect with funding providers."
      />
      <Tabs
        tabs={[
          {
            id: "individual",
            label: "Individual",
            icon: "user",
            content: (
              <div className="flex flex-col gap-4">
                <Card title="Find someone">
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <div className="flex-1">
                      <SearchInput
                        value={search}
                        onChange={(v) => setSearch(v.toUpperCase())}
                        placeholder="Search by identifier, e.g. A2WD"
                        label="Search by identifier"
                      />
                    </div>
                    <Button icon="user-plus" loading={sending} onClick={sendRequest}>
                      Send request
                    </Button>
                  </div>
                  {/^[A-Z0-9]{4}$/.test(search.trim()) ? (
                    <p className="mt-2 text-sm">
                      <Link href={ROUTES.profileById(search.trim())} className="font-medium text-brand-700 hover:underline">
                        View profile {search.trim()}
                      </Link>
                    </p>
                  ) : null}
                </Card>

                <Card title={`Incoming requests (${connections.incoming.length})`}>
                  {connections.incoming.length === 0 ? (
                    <p className="text-sm text-neutral-600">No incoming requests.</p>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {connections.incoming.map((c) => (
                        <ConnectionRow key={c.id} item={c} onDecide={decide} />
                      ))}
                    </ul>
                  )}
                </Card>

                <Card title={`Sent requests (${connections.outgoing.length})`}>
                  {connections.outgoing.length === 0 ? (
                    <p className="text-sm text-neutral-600">No sent requests.</p>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {connections.outgoing.map((c) => (
                        <ConnectionRow key={c.id} item={c} />
                      ))}
                    </ul>
                  )}
                </Card>

                <Card title={`My connections (${connections.accepted.length})`}>
                  {connections.accepted.length === 0 ? (
                    <EmptyState icon="users" title="No connections yet" message="Search by identifier above or accept suggestions from Matching." />
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {connections.accepted.map((c) => (
                        <ConnectionRow key={c.id} item={c} />
                      ))}
                    </ul>
                  )}
                </Card>

                <Card title="Loan & support providers">
                  {providers.length === 0 ? (
                    <EmptyState icon="landmark" title="No providers yet" message="Providers appear here once registered and verified." />
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {providers.map((p) => (
                        <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-neutral-200 p-3">
                          <div>
                            <Link href={ROUTES.profileById(p.shortId)} className="font-medium text-brand-700 hover:underline">
                              {p.name} <span className="font-mono text-xs">({p.shortId})</span>
                            </Link>
                            <p className="text-sm text-neutral-600">{p.country ?? "Provider"}</p>
                          </div>
                          <Button size="sm" variant="secondary" onClick={() => setLinkModal(p)}>
                            Request connection
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </div>
            ),
          },
          {
            id: "group",
            label: "Group",
            icon: "user-group",
            content: (
              <div className="flex flex-col gap-4">
                <Card title="Group provider connections">
                  <p className="mb-3 text-sm text-neutral-600">
                    Group requests need internal approval from a group admin before the provider is
                    contacted. Decisions are recorded with who approved them.
                  </p>
                  {groupLinks.length === 0 ? (
                    <EmptyState icon="file-signature" title="No group provider links" message="Open a group to request a provider connection with approval." />
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {groupLinks.map((l) => (
                        <li key={l.id} className="flex items-center justify-between gap-2 rounded-md border border-neutral-200 p-3 text-sm">
                          <span className="font-mono">{l.id.slice(0, 8)}</span>
                          <Badge tone={l.status === "approved" ? "success" : l.status === "pending" ? "info" : "neutral"}>
                            {l.status}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
                <Card title="My provider requests">
                  {myLinks.length === 0 ? (
                    <p className="text-sm text-neutral-600">No provider requests yet.</p>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {myLinks.map((l) => (
                        <li key={l.id} className="flex items-center justify-between gap-2 rounded-md border border-neutral-200 p-3 text-sm">
                          <span>
                            {l.groupId ? "Group request" : "Individual request"} ·{" "}
                            <span className="font-mono">{new Date(l.createdAt).toLocaleDateString()}</span>
                          </span>
                          <Badge tone={l.status === "approved" ? "success" : l.status === "pending" ? "info" : "neutral"}>
                            {l.status}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </div>
            ),
          },
        ]}
      />

      {linkModal ? (
        <Modal title={`Connect with ${linkModal.name}`} onClose={() => setLinkModal(null)}>
          <p className="mb-3 text-sm text-neutral-600">
            Request as yourself, or on behalf of one of your groups (needs group admin approval).
          </p>
          <SelectField
            label="Requesting as"
            value={linkGroupId}
            onChange={(e) => setLinkGroupId(e.target.value)}
            options={[
              { value: "", label: "Myself (individual)" },
              ...myGroupIds.map((id) => ({ value: id, label: `Group ${id.slice(0, 8)}` })),
            ]}
          />
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setLinkModal(null)}>
              Cancel
            </Button>
            <Button onClick={requestProviderLink}>Send request</Button>
          </div>
        </Modal>
      ) : null}
      {error ? <ErrorDialog message={error} onClose={() => setError(null)} /> : null}
    </>
  );
}
