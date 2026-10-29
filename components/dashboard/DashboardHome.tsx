"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ROUTES } from "@/lib/routes";
import { formatDateTime, formatMoney } from "@/lib/currency";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/Card";
import { Card } from "@/components/ui/Card";
import { EmptyState, LoadError, SkeletonList } from "@/components/ui/Feedback";
import { Icon } from "@/components/ui/Icon";
import { TourButton } from "@/components/tour/TourButton";
import { useSocket } from "@/components/realtime/SocketProvider";

interface Summary {
  profileCompletion: number;
  shortId: string;
  unreadChat: number;
  unreadNotifications: number;
  pendingConnections: number;
  matchingOpportunities: number;
  groupCount: number;
  groups: Array<{ id: string; name: string }>;
  wallets: Array<{ currency: string; balanceMinor: number }>;
  approvedCreditsMinor: number;
  recentMessages: Array<{
    id: string;
    preview: string;
    senderName: string;
    createdAt: string;
    conversationId: string;
  }>;
  recentProjects: Array<{ id: string; title: string; stage: string; updatedAt: string }>;
  pendingApprovals: number;
  openFunding: number;
  upcomingActions: Array<{
    id: string;
    title: string;
    kind: string;
    scheduledFor: string;
    timezone: string;
  }>;
  recentNotifications: Array<{
    id: string;
    type: string;
    title: string;
    createdAt: string;
    readAt: string | null;
  }>;
}

function StatCard({ label, value, href, icon }: { label: string; value: number; href: string; icon: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-white p-4 transition-colors hover:border-black"
    >
      <span className="text-xl" aria-hidden="true">
        <Icon name={icon} />
      </span>
      <span>
        <span className="block font-mono text-2xl font-semibold text-black">{value}</span>
        <span className="block text-sm text-neutral-600">{label}</span>
      </span>
    </Link>
  );
}

export function DashboardHome() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [failed, setFailed] = useState(false);
  const { onEvent } = useSocket();

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const res = await fetch("/api/dashboard/summary", { cache: "no-store" });
      if (!res.ok) throw new Error("bad status");
      const body = (await res.json()) as { ok: boolean; data?: Summary };
      if (!body.ok || !body.data) throw new Error("bad body");
      setSummary(body.data);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const offs = [
      onEvent("notification:new", () => load()),
      onEvent("message:new", () => load()),
      onEvent("connection:updated", () => load()),
      onEvent("wallet:updated", () => load()),
    ];
    return () => offs.forEach((off) => off());
  }, [onEvent, load]);

  if (failed) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <LoadError onRetry={load} />
      </>
    );
  }

  if (!summary) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <SkeletonList rows={4} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={
          summary.shortId ? (
            <>
              Your identifier is <span className="font-mono font-semibold">{summary.shortId}</span>. Share
              it so collaborators can find you.
            </>
          ) : undefined
        }
        actions={<TourButton />}
      />

      <div id="dash-stats" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Unread messages" value={summary.unreadChat} href={ROUTES.chat} icon="message" />
        <StatCard
          label="Pending requests"
          value={summary.pendingConnections}
          href={ROUTES.conneckt}
          icon="user-plus"
        />
        <StatCard
          label="Matching opportunities"
          value={summary.matchingOpportunities}
          href={ROUTES.matching}
          icon="wand-magic-sparkles"
        />
        <StatCard
          label="Unread notifications"
          value={summary.unreadNotifications}
          href={ROUTES.notifications}
          icon="bell"
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card
          title="Profile"
          actions={
            <Link href={ROUTES.profile} className="text-sm font-medium text-brand-700 hover:underline">
              Edit profile
            </Link>
          }
        >
          <div id="dash-profile">
            <div className="flex items-center justify-between text-sm">
              <span className="text-black">Completion</span>
              <span className="font-mono font-semibold">{summary.profileCompletion}%</span>
            </div>
            <div
              className="mt-2 h-2 rounded-full bg-neutral-200"
              role="progressbar"
              aria-valuenow={summary.profileCompletion}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-2 rounded-full bg-brand-600"
                style={{ width: `${summary.profileCompletion}%` }}
              />
            </div>
            <p className="mt-3 text-sm text-neutral-600">
              {summary.groupCount === 0
                ? "You are not in any group yet."
                : `Member of ${summary.groupCount} group${summary.groupCount === 1 ? "" : "s"}: ${summary.groups.map((g) => g.name).join(", ")}`}
            </p>
          </div>
        </Card>

        <Card
          title="Wallet"
          actions={
            <Link href={ROUTES.wallet} className="text-sm font-medium text-brand-700 hover:underline">
              Open wallet
            </Link>
          }
        >
          {summary.wallets.length === 0 ? (
            <EmptyState
              icon="wallet"
              title="No wallet yet"
              message="Your personal wallet is created when you record your first funding."
              action={
                <Link href={ROUTES.wallet} className="font-medium text-brand-700 hover:underline">
                  Go to Wallet
                </Link>
              }
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {summary.wallets.map((w) => (
                <li key={w.currency} className="flex items-center justify-between text-sm">
                  <span className="font-mono text-neutral-600">{w.currency}</span>
                  <span className="font-mono font-semibold text-black">
                    {formatMoney(w.balanceMinor, w.currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="Recent messages"
          actions={
            <Link href={ROUTES.chat} className="text-sm font-medium text-brand-700 hover:underline">
              Open chat
            </Link>
          }
        >
          {summary.recentMessages.length === 0 ? (
            <p className="text-sm text-neutral-600">No messages yet. Connect with someone to start chatting.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {summary.recentMessages.map((m) => (
                <li key={m.id}>
                  <Link
                    href={ROUTES.chatThread(m.conversationId)}
                    className="block rounded-md border border-neutral-200 p-2.5 hover:border-black"
                  >
                    <span className="block text-sm font-medium text-black">{m.senderName}</span>
                    <span className="block truncate text-sm text-neutral-600">{m.preview}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="Projects & funding"
          actions={
            <Link href={ROUTES.projects} className="text-sm font-medium text-brand-700 hover:underline">
              Open projects
            </Link>
          }
        >
          <div className="mb-3 flex flex-wrap gap-2">
            <Badge tone="info">Pending approvals: {summary.pendingApprovals}</Badge>
            <Badge tone="info">Open funding requests: {summary.openFunding}</Badge>
          </div>
          {summary.recentProjects.length === 0 ? (
            <p className="text-sm text-neutral-600">No projects yet. Submit your first idea to get started.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {summary.recentProjects.map((p) => (
                <li key={p.id}>
                  <Link
                    href={ROUTES.projectById(p.id)}
                    className="flex items-center justify-between gap-2 rounded-md border border-neutral-200 p-2.5 hover:border-black"
                  >
                    <span className="truncate text-sm font-medium text-black">{p.title}</span>
                    <Badge>{p.stage}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div id="dash-actions" className="lg:col-span-2">
          <Card
            title="Upcoming scheduled actions"
            actions={
              <Link href={ROUTES.actions} className="text-sm font-medium text-brand-700 hover:underline">
                Open actions
              </Link>
            }
          >
            {summary.upcomingActions.length === 0 ? (
              <p className="text-sm text-neutral-600">No scheduled actions. Automate a message, reminder, or update.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {summary.upcomingActions.map((a) => (
                  <li
                    key={a.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-neutral-200 p-2.5 text-sm"
                  >
                    <span className="font-medium text-black">{a.title}</span>
                    <span className="font-mono text-xs text-neutral-600">
                      {formatDateTime(a.scheduledFor, a.timezone)} ({a.timezone})
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
