"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ROUTES } from "@/lib/routes";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge, Card } from "@/components/ui/Card";
import { EmptyState, LoadError, SkeletonList } from "@/components/ui/Feedback";
import { Button } from "@/components/ui/Button";
import { Pagination } from "@/components/ui/Pagination";
import { ErrorDialog } from "@/components/ui/Modal";
import { useSocket } from "@/components/realtime/SocketProvider";

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string | null;
  resourceType: string | null;
  resourceId: string | null;
  readAt: string | null;
  createdAt: string;
}

function resourceHref(n: NotificationItem): string | null {
  switch (n.resourceType) {
    case "conversation":
      return n.resourceId ? ROUTES.chatThread(n.resourceId) : ROUTES.chat;
    case "connection":
    case "provider_link":
      return ROUTES.conneckt;
    case "group":
      return n.resourceId ? ROUTES.groupById(n.resourceId) : ROUTES.groups;
    case "group_approval":
      return ROUTES.groups;
    case "project":
      return n.resourceId ? ROUTES.projectById(n.resourceId) : ROUTES.projects;
    case "request":
    case "agreement":
      return n.resourceId ? ROUTES.requestById(n.resourceId) : ROUTES.requests;
    case "action":
      return ROUTES.actions;
    case "wallet":
      return ROUTES.wallet;
    case "matching":
      return ROUTES.matching;
    case "subscription":
      return ROUTES.plans;
    case "user":
      return ROUTES.profile;
    default:
      return null;
  }
}

export function NotificationsPage() {
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { onEvent } = useSocket();

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const res = await fetch(
        `/api/notifications?page=${page}&pageSize=20${unreadOnly ? "&unread=1" : ""}`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error();
      const body = (await res.json()) as { ok: boolean; data?: { items: NotificationItem[]; total: number } };
      if (!body.ok || !body.data) throw new Error();
      setItems(body.data.items);
      setTotal(body.data.total);
    } catch {
      setFailed(true);
    }
  }, [page, unreadOnly]);

  useEffect(() => {
    load();
    const off = onEvent("notification:new", () => {
      load();
      window.dispatchEvent(new Event("tix:counts"));
    });
    return () => off();
  }, [load, onEvent]);

  async function mark(id?: string, all = false) {
    try {
      const res = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, all }),
      });
      if (!res.ok) throw new Error();
      load();
      window.dispatchEvent(new Event("tix:counts"));
    } catch {
      setError("We couldn't update notifications. Please try again.");
    }
  }

  if (failed) {
    return (
      <>
        <PageHeader title="Notifications" />
        <LoadError onRetry={load} />
      </>
    );
  }
  if (!items) {
    return (
      <>
        <PageHeader title="Notifications" />
        <SkeletonList rows={4} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Notifications"
        actions={
          <>
            <Button
              size="sm"
              variant={unreadOnly ? "primary" : "secondary"}
              onClick={() => {
                setUnreadOnly(!unreadOnly);
                setPage(1);
              }}
            >
              {unreadOnly ? "Showing unread" : "Show unread only"}
            </Button>
            <Button size="sm" variant="secondary" icon="check-double" onClick={() => mark(undefined, true)}>
              Mark all read
            </Button>
          </>
        }
      />
      <Card title="">
        {items.length === 0 ? (
          <EmptyState
            icon="bell"
            title="No notifications"
            message={unreadOnly ? "Everything is read. New events appear here." : "System events — messages, requests, funding, and reminders — appear here."}
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((n) => {
              const href = resourceHref(n);
              return (
                <li
                  key={n.id}
                  className={`flex flex-wrap items-start justify-between gap-2 rounded-md border p-3 ${
                    n.readAt ? "border-neutral-200 bg-white" : "border-brand-200 bg-brand-50"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={n.readAt ? "neutral" : "info"}>{n.type}</Badge>
                      <span className="font-mono text-xs text-neutral-500">
                        {new Date(n.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="mt-1 font-medium text-black">{n.title}</p>
                    {n.body ? <p className="mt-0.5 text-sm text-neutral-600">{n.body}</p> : null}
                    {href ? (
                      <Link href={href} className="mt-1 inline-block text-sm font-medium text-brand-700 hover:underline">
                        Open related item
                      </Link>
                    ) : null}
                  </div>
                  {!n.readAt ? (
                    <Button size="sm" variant="secondary" onClick={() => mark(n.id)}>
                      Mark read
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        <Pagination page={page} pageSize={20} total={total} onPage={setPage} />
      </Card>
      {error ? <ErrorDialog message={error} onClose={() => setError(null)} /> : null}
    </>
  );
}
