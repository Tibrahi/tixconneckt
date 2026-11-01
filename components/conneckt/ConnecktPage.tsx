"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { ROUTES } from "@/lib/routes";
import { apiFetch } from "@/lib/api-client";
import { useOperation } from "@/hooks/useOperation";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge, Card } from "@/components/ui/Card";
import { EmptyState, LoadError, SkeletonList } from "@/components/ui/Feedback";
import { Button } from "@/components/ui/Button";
import { Pagination, SearchInput } from "@/components/ui/Pagination";
import { SelectField } from "@/components/ui/Fields";
import { Modal } from "@/components/ui/Modal";
import { Tabs } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import { useSocket } from "@/components/realtime/SocketProvider";

interface Preview {
  shortId: string;
  name: string;
  headline: string | null;
  skills: string[];
  fields?: string[];
  country: string | null;
  role: string;
  providerKind?: string | null;
  reasons?: string[];
}

interface Connection {
  id: string;
  status: string;
  createdAt: string;
  direction: "incoming" | "outgoing";
  other: { id: string; name: string; shortId: string };
}

interface ProviderLink {
  id: string;
  status: string;
  providerId: string;
  individualId: string | null;
  groupId: string | null;
  createdAt: string;
}

function refreshBadges() {
  window.dispatchEvent(new Event("tix:counts"));
}

function Avatar({ shortId, name }: { shortId: string; name: string }) {
  return (
    <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-neutral-100">
      <Image
        src={`/api/profile/media?shortId=${encodeURIComponent(shortId)}&kind=avatar`}
        alt=""
        fill
        unoptimized
        className="object-cover"
        onError={(event) => {
          event.currentTarget.style.display = "none";
        }}
      />
      <span className="flex h-full w-full items-center justify-center text-xs text-neutral-500">
        {name.slice(0, 1)}
      </span>
    </span>
  );
}

function PreviewRow({
  item,
  action,
}: {
  item: Preview;
  action: React.ReactNode;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-neutral-200 p-3">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar shortId={item.shortId} name={item.name} />
        <div className="min-w-0">
          <Link
            href={ROUTES.profileById(item.shortId)}
            className="font-medium text-brand-700 hover:underline"
          >
            {item.name} <span className="font-mono text-xs">({item.shortId})</span>
          </Link>
          <p className="truncate text-sm text-neutral-600">
            {[item.headline, item.country].filter(Boolean).join(" · ") || "Member"}
          </p>
          {item.skills.length > 0 ? (
            <p className="truncate text-xs text-neutral-500">{item.skills.join(", ")}</p>
          ) : null}
          {item.reasons && item.reasons.length > 0 ? (
            <p className="mt-0.5 text-xs text-brand-700">Why: {item.reasons.join(" · ")}</p>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">{action}</div>
    </li>
  );
}

/**
 * Paged server-driven list: initial skeleton, background refresh keeps data,
 * abort on unmount/page change, socket-driven updates where relevant.
 */
function usePagedList<T>(fetcher: (page: number, signal: AbortSignal) => Promise<{ items: T[]; total: number }>) {
  const [items, setItems] = useState<T[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  const load = useCallback(
    async (targetPage: number, background = false) => {
      if (!background) setFailed(false);
      else setRefreshing(true);
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const result = await fetcherRef.current(targetPage, controller.signal);
        setItems(result.items);
        setTotal(result.total);
        setPage(targetPage);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (!background) setFailed(true);
      } finally {
        setRefreshing(false);
      }
    },
    [],
  );

  useEffect(() => {
    load(1);
    return () => abortRef.current?.abort();
  }, [load]);

  return { items, total, page, failed, refreshing, reload: () => load(page, true), goto: (p: number) => load(p, items !== null), retry: () => load(page) };
}

function ConnectedSection({ signal }: { signal: number }) {
  const list = usePagedList<{ id: string; other: Preview }>(async (page, signal) => {
    const data = await apiFetch<{ items: Array<{ id: string; other: Preview }>; total: number }>(
      `/api/connections?view=connected&page=${page}&pageSize=10`,
      { signal },
    );
    return data;
  });
  const { onEvent } = useSocket();

  useEffect(() => {
    return onEvent("connection:updated", () => list.reload());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onEvent]);

  const seenSignal = useRef(signal);
  useEffect(() => {
    if (seenSignal.current !== signal) {
      seenSignal.current = signal;
      list.reload();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signal]);

  if (list.failed) {
    return <LoadError message="We couldn't load your connections." onRetry={list.retry} />;
  }
  if (!list.items) return <SkeletonList rows={4} />;
  if (list.items.length === 0) {
    return (
      <EmptyState
        icon="users"
        title="No connections yet"
        message="Browse public users or recommendations to send your first connection request."
      />
    );
  }
  return (
    <div>
      {list.refreshing ? (
        <p className="mb-2 text-xs text-neutral-500" role="status">
          Updating…
        </p>
      ) : null}
      <ul className="flex flex-col gap-2">
        {list.items.map((c) => (
          <PreviewRow
            key={c.id}
            item={c.other}
            action={
              <Link href={ROUTES.profileById(c.other.shortId)}>
                <Button size="sm" variant="secondary">
                  View profile
                </Button>
              </Link>
            }
          />
        ))}
      </ul>
      <Pagination page={list.page} pageSize={10} total={list.total} onPage={list.goto} />
    </div>
  );
}

function RequestsSection({ onSent }: { onSent: () => void }) {
  const [data, setData] = useState<{ incoming: Connection[]; outgoing: Connection[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const [search, setSearch] = useState("");
  const [actingId, setActingId] = useState<string | null>(null);
  const sendOp = useOperation();
  const { success, error } = useToast();
  const { onEvent } = useSocket();
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async (background = false) => {
    if (!background) setFailed(false);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const body = await apiFetch<{ incoming: Connection[]; outgoing: Connection[] }>("/api/connections", {
        signal: controller.signal,
      });
      setData({ incoming: body.incoming, outgoing: body.outgoing });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (!background) setFailed(true);
    }
  }, []);

  useEffect(() => {
    load();
    const off = onEvent("connection:updated", () => load(true));
    return () => {
      abortRef.current?.abort();
      off();
    };
  }, [load, onEvent]);

  async function sendRequest() {
    const id = search.trim().toUpperCase();
    if (!/^[A-Z0-9]{4}$/.test(id)) {
      error("Enter a valid 4-character identifier, e.g. A2WD.");
      return;
    }
    const result = await sendOp.run(() =>
      apiFetch<{ sent: boolean }>("/api/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shortId: id }),
      }),
    );
    if (result.ok) {
      success("Connection request sent.");
      setSearch("");
      refreshBadges();
      onSent();
      load(true);
    } else if (!result.duplicate) {
      error(result.error);
    }
  }

  async function decide(id: string, decision: "accepted" | "rejected") {
    if (actingId) return;
    setActingId(id);
    try {
      await apiFetch("/api/connections", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId: id, decision }),
      });
      success(decision === "accepted" ? "Connection accepted." : "Request declined.");
      refreshBadges();
      onSent();
      load(true);
    } catch (err) {
      error(err instanceof Error ? err.message : "We couldn't record your decision.");
    } finally {
      setActingId(null);
    }
  }

  if (failed) return <LoadError onRetry={() => load()} />;
  if (!data) return <SkeletonList rows={4} />;

  return (
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
          <Button icon="user-plus" loading={sendOp.loading} onClick={sendRequest}>
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

      <Card title={`Incoming requests (${data.incoming.length})`}>
        {data.incoming.length === 0 ? (
          <p className="text-sm text-neutral-600">No incoming requests.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.incoming.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-neutral-200 p-3">
                <Link
                  href={ROUTES.profileById(c.other.shortId)}
                  className="flex min-w-0 items-center gap-2 font-medium text-brand-700 hover:underline"
                >
                  <Avatar shortId={c.other.shortId} name={c.other.name} />
                  <span className="truncate">
                    {c.other.name} <span className="font-mono text-xs">({c.other.shortId})</span>
                  </span>
                </Link>
                <div className="flex gap-2">
                  <Button size="sm" icon="check" loading={actingId === c.id} onClick={() => decide(c.id, "accepted")}>
                    Accept
                  </Button>
                  <Button size="sm" variant="secondary" icon="xmark" disabled={actingId === c.id} onClick={() => decide(c.id, "rejected")}>
                    Reject
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={`Sent requests (${data.outgoing.length})`}>
        {data.outgoing.length === 0 ? (
          <p className="text-sm text-neutral-600">No sent requests.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.outgoing.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-neutral-200 p-3">
                <Link
                  href={ROUTES.profileById(c.other.shortId)}
                  className="flex min-w-0 items-center gap-2 font-medium text-brand-700 hover:underline"
                >
                  <Avatar shortId={c.other.shortId} name={c.other.name} />
                  <span className="truncate">
                    {c.other.name} <span className="font-mono text-xs">({c.other.shortId})</span>
                  </span>
                </Link>
                <Badge tone="info">{c.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

type DiscoveryType = "users" | "providers" | "recommended" | "recommended-providers";

function DiscoverySection({
  type,
  emptyTitle,
  emptyMessage,
  signal,
  onConnectUser,
  onConnectProvider,
}: {
  type: DiscoveryType;
  emptyTitle: string;
  emptyMessage: string;
  signal: number;
  onConnectUser: (item: Preview) => Promise<void>;
  onConnectProvider: (item: Preview) => void;
}) {
  const pageSize = type === "users" || type === "providers" ? 5 : 10;
  const list = usePagedList<Preview>(async (page, signal) => {
    const data = await apiFetch<{ items: Preview[]; total: number }>(
      `/api/discovery?type=${type}&page=${page}&pageSize=${pageSize}`,
      { signal },
    );
    return data;
  });
  const [pendingShortId, setPendingShortId] = useState<string | null>(null);

  const seenSignal = useRef(signal);
  useEffect(() => {
    if (seenSignal.current !== signal) {
      seenSignal.current = signal;
      list.reload();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signal]);

  if (list.failed) return <LoadError message="We couldn't load this section." onRetry={list.retry} />;
  if (!list.items) return <SkeletonList rows={type === "users" || type === "providers" ? 5 : 4} />;
  if (list.items.length === 0) {
    return <EmptyState icon="users" title={emptyTitle} message={emptyMessage} />;
  }
  return (
    <div>
      {list.refreshing ? (
        <p className="mb-2 text-xs text-neutral-500" role="status">
          Updating…
        </p>
      ) : null}
      <ul className="flex flex-col gap-2">
        {list.items.map((item) => (
          <PreviewRow
            key={item.shortId}
            item={item}
            action={
              <>
                <Link href={ROUTES.profileById(item.shortId)}>
                  <Button size="sm" variant="secondary">
                    View
                  </Button>
                </Link>
                <Button
                  size="sm"
                  loading={pendingShortId === item.shortId}
                  onClick={async () => {
                    if (item.role === "provider") {
                      onConnectProvider(item);
                      return;
                    }
                    setPendingShortId(item.shortId);
                    try {
                      await onConnectUser(item);
                    } finally {
                      setPendingShortId(null);
                    }
                  }}
                >
                  Connect
                </Button>
              </>
            }
          />
        ))}
      </ul>
      <Pagination page={list.page} pageSize={pageSize} total={list.total} onPage={list.goto} />
    </div>
  );
}

function GroupLinksSection() {
  const [links, setLinks] = useState<ProviderLink[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const data = await apiFetch<{ groupLinks: ProviderLink[] }>("/api/providers?pageSize=1");
      setLinks(data.groupLinks);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (failed) return <LoadError onRetry={load} />;
  if (!links) return <SkeletonList rows={3} />;
  return (
    <Card title="Group provider connections">
      <p className="mb-3 text-sm text-neutral-600">
        Group requests need internal approval from a group admin before the provider is contacted.
        Decisions are recorded with who approved them.
      </p>
      {links.length === 0 ? (
        <EmptyState
          icon="file-signature"
          title="No group provider links"
          message="Open a group to request a provider connection with approval."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {links.map((l) => (
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
  );
}

export function ConnecktPage() {
  const { success, error } = useToast();
  const [linkModal, setLinkModal] = useState<Preview | null>(null);
  const [myGroupIds, setMyGroupIds] = useState<string[]>([]);
  const [linkGroupId, setLinkGroupId] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const linkOp = useOperation();

  useEffect(() => {
    apiFetch<{ myGroupIds: string[] }>("/api/providers?pageSize=1")
      .then((d) => setMyGroupIds(d.myGroupIds))
      .catch(() => setMyGroupIds([]));
  }, []);

  const bump = useCallback(() => setRefreshKey((k) => k + 1), []);

  async function connectUser(item: Preview) {
    const result = await linkOp.run(() =>
      apiFetch("/api/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shortId: item.shortId }),
      }),
    );
    if (result.ok) {
      success(`Request sent to ${item.name}.`);
      refreshBadges();
      bump();
    } else if (!result.duplicate) {
      error(result.error);
    }
  }

  async function requestProviderLink() {
    if (!linkModal) return;
    const result = await linkOp.run(() =>
      apiFetch("/api/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerShortId: linkModal.shortId,
          groupId: linkGroupId || undefined,
        }),
      }),
    );
    if (result.ok) {
      success(
        linkGroupId
          ? "Group approval requested. An admin will review it first."
          : `Request sent to ${linkModal.name}.`,
      );
      setLinkModal(null);
      setLinkGroupId("");
      refreshBadges();
      bump();
    } else if (!result.duplicate) {
      error(result.error);
    }
  }

  return (
    <>
      <PageHeader
        title="Conneckt"
        description="Your connections, public members, providers, and recommendations — each kept separate."
      />
      <Tabs
        tabs={[
          {
            id: "connected",
            label: "Connected",
            icon: "users",
            content: <ConnectedSection signal={refreshKey} />,
          },
          {
            id: "requests",
            label: "Requests",
            icon: "user-plus",
            content: <RequestsSection onSent={bump} />,
          },
          {
            id: "users",
            label: "Public Users",
            icon: "user",
            content: (
              <DiscoverySection
                type="users"
                emptyTitle="No public users yet"
                emptyMessage="New public members will appear here as they join."
                signal={refreshKey}
                onConnectUser={connectUser}
                onConnectProvider={(p) => setLinkModal(p)}
              />
            ),
          },
          {
            id: "providers",
            label: "Providers",
            icon: "landmark",
            content: (
              <DiscoverySection
                type="providers"
                emptyTitle="No public providers yet"
                emptyMessage="Providers who choose public visibility will appear here."
                signal={refreshKey}
                onConnectUser={connectUser}
                onConnectProvider={(p) => setLinkModal(p)}
              />
            ),
          },
          {
            id: "recommended",
            label: "Recommended",
            icon: "wand-magic-sparkles",
            content: (
              <DiscoverySection
                type="recommended"
                emptyTitle="No recommendations yet"
                emptyMessage="Complete your profile and matching answers so we can suggest relevant people."
                signal={refreshKey}
                onConnectUser={connectUser}
                onConnectProvider={(p) => setLinkModal(p)}
              />
            ),
          },
          {
            id: "recommended-providers",
            label: "Rec. Providers",
            icon: "building",
            content: (
              <DiscoverySection
                type="recommended-providers"
                emptyTitle="No provider recommendations yet"
                emptyMessage="Complete your profile so we can suggest relevant public providers."
                signal={refreshKey}
                onConnectUser={connectUser}
                onConnectProvider={(p) => setLinkModal(p)}
              />
            ),
          },
          {
            id: "groups",
            label: "Groups",
            icon: "user-group",
            content: <GroupLinksSection />,
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
            <Button loading={linkOp.loading} onClick={requestProviderLink}>
              Send request
            </Button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
