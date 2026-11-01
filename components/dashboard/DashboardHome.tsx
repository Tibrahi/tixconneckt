"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ROUTES } from "@/lib/routes";
import { formatDateTime, formatMoney } from "@/lib/currency";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/Card";
import { Card } from "@/components/ui/Card";
import { EmptyState, LoadError, SkeletonList } from "@/components/ui/Feedback";
import { Icon } from "@/components/ui/Icon";
import { TourButton } from "@/components/tour/TourButton";
import { useAbly } from "@/components/realtime/AblyProvider";

interface Summary {
  profileCompletion: number;
  shortId: string;
  actor?: { role: string; category: string; providerKind: string | null };
  providerQueue?: number;
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
      className="group flex min-h-24 items-center gap-4 rounded-xl border border-neutral-200/90 bg-white p-4 shadow-card transition duration-150 motion-safe:hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-700 text-lg text-white shadow-sm" aria-hidden="true">
        <Icon name={icon} />
      </span>
      <span>
        <span className="block text-2xl font-semibold leading-tight tracking-tight text-black tabular-nums">{value}</span>
        <span className="mt-1 block text-sm text-neutral-600">{label}</span>
      </span>
    </Link>
  );
}

function EducationDashboard({ summary, category, refreshing }: {
  summary: Summary;
  category: "university" | "government";
  refreshing: boolean;
}) {
  const university = category === "university";
  const projectsHeading = university ? "Campus project portfolio" : "Public program portfolio";
  return (
    <>
      <PageHeader
        title={university ? "University workspace" : "Government coordination workspace"}
        description={university
          ? "Coordinate institutional projects, research groups, funding requests, and external partnerships."
          : "Coordinate public initiatives, funding requests, partner organizations, and inter-agency groups."}
        actions={<span className="flex items-center gap-3">{refreshing ? <span className="text-xs text-neutral-500" role="status">Updating…</span> : null}<TourButton /></span>}
      />
      <div className="grid gap-3 md:grid-cols-3">
        <Link href={ROUTES.projects} className="rounded-xl border border-neutral-200 bg-white p-5 shadow-card hover:border-brand-300">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">{university ? "Research & campus" : "Public initiatives"}</p>
          <h2 className="mt-2 text-lg font-semibold">{projectsHeading}</h2>
          <p className="mt-1 text-sm text-neutral-600">Review project workspaces, stages, and shared contributions.</p>
          <span className="mt-4 inline-block text-sm font-medium text-brand-700">Open projects →</span>
        </Link>
        <Link href={ROUTES.groups} className="rounded-xl border border-neutral-200 bg-white p-5 shadow-card hover:border-brand-300">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">{university ? "Academic collaboration" : "Inter-agency coordination"}</p>
          <h2 className="mt-2 text-lg font-semibold">{university ? "Research groups" : "Coordination groups"}</h2>
          <p className="mt-1 text-sm text-neutral-600">{summary.groupCount} active group{summary.groupCount === 1 ? "" : "s"} · {summary.pendingApprovals} pending group approval{summary.pendingApprovals === 1 ? "" : "s"}</p>
          <span className="mt-4 inline-block text-sm font-medium text-brand-700">Manage groups →</span>
        </Link>
        <Link href={ROUTES.requests} className="rounded-xl border border-neutral-200 bg-white p-5 shadow-card hover:border-brand-300">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">Funding workflow</p>
          <h2 className="mt-2 text-lg font-semibold">{summary.openFunding} open request{summary.openFunding === 1 ? "" : "s"}</h2>
          <p className="mt-1 text-sm text-neutral-600">Track funding requests attached to projects you own or manage.</p>
          <span className="mt-4 inline-block text-sm font-medium text-brand-700">Review requests →</span>
        </Link>
      </div>
      <div className={`mt-5 grid items-start gap-5 ${university ? "lg:grid-cols-[1.5fr_1fr]" : "lg:grid-cols-[1fr_1.5fr]"}`}>
        <Card title={projectsHeading} actions={<Link href={ROUTES.projects} className="text-sm font-medium text-brand-700 hover:underline">View all</Link>}>
          {summary.recentProjects.length === 0 ? (
            <EmptyState icon="diagram-project" title={university ? "No campus projects yet" : "No public initiatives yet"} message="Projects created by your account or its groups will appear here." action={<Link href={ROUTES.projects} className="font-medium text-brand-700 hover:underline">Create a project</Link>} />
          ) : (
            <ul className="flex flex-col gap-2">{summary.recentProjects.map((project) => <li key={project.id}><Link href={ROUTES.projectById(project.id)} className="flex items-center justify-between gap-2 rounded-md border border-neutral-200 p-3 hover:border-brand-300"><span className="truncate text-sm font-medium">{project.title}</span><Badge>{project.stage}</Badge></Link></li>)}</ul>
          )}
        </Card>
        <div className="flex flex-col gap-5">
          <Card title={university ? "Institution identity" : "Agency identity"} actions={<Link href={ROUTES.organizations} className="text-sm font-medium text-brand-700 hover:underline">Manage profile</Link>}>
            <p className="text-sm text-neutral-600">Maintain the organization profile, visibility, and verification materials associated with your account.</p>
          </Card>
          <Card title={university ? "Partnership workspace" : "Partner coordination"} actions={<Link href={ROUTES.conneckt} className="text-sm font-medium text-brand-700 hover:underline">Open partners</Link>}>
            <p className="text-sm text-neutral-600">Coordinate provider and member connections, then continue approved conversations in chat.</p>
            <Link href={ROUTES.chat} className="mt-3 inline-block text-sm font-medium text-brand-700 hover:underline">Open collaboration chat</Link>
          </Card>
        </div>
      </div>
    </>
  );
}

export function DashboardHome() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { onEvent } = useAbly();
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async (options: { background?: boolean } = {}) => {
    const background = options.background === true;
    if (!background) setFailed(false);
    else setRefreshing(true);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const timer = setTimeout(() => controller.abort(), 25000);
    try {
      const res = await fetch("/api/dashboard/summary", { cache: "no-store", signal: controller.signal });
      if (!res.ok) throw new Error("bad status");
      const body = (await res.json()) as { ok: boolean; data?: Summary };
      if (!body.ok || !body.data) throw new Error("bad body");
      setSummary(body.data);
      if (!background) setFailed(false);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      // Background refreshes never replace the page with an error state.
      if (!background) setFailed(true);
    } finally {
      clearTimeout(timer);
      if (!background) setRefreshing(false);
      else setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    return () => abortRef.current?.abort();
  }, [load]);

  useEffect(() => {
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => void load({ background: true }), 300);
    };
    // Personal-channel events only: the dashboard never joins conversation
    // or group channels, so list/count refreshes arrive via these.
    const offs = [
      onEvent("notification:new", refresh),
      onEvent("conversation:update", refresh),
      onEvent("connection:updated", refresh),
      onEvent("wallet:updated", refresh),
    ];
    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      offs.forEach((off) => off());
    };
  }, [onEvent, load]);

  if (failed) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <LoadError onRetry={() => load()} />
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

  const actorRole = summary.actor?.role ?? "user";
  const actorCategory = summary.actor?.category ?? "individual";
  const providerKind = summary.actor?.providerKind ?? null;
  const isProvider = actorRole === "provider";
  const isEducation = actorRole === "user" && (actorCategory === "university" || actorCategory === "government");
  const roleLabel = actorRole === "admin"
    ? "Administrator"
    : isProvider
      ? `Provider${providerKind ? ` (${providerKind})` : ""}`
      : isEducation
        ? "Organization"
        : "Member";

  if (isEducation && (actorCategory === "university" || actorCategory === "government")) {
    return <EducationDashboard summary={summary} category={actorCategory} refreshing={refreshing} />;
  }

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={
          summary.shortId ? (
            <>
              Your identifier is <span className="font-mono font-semibold">{summary.shortId}</span> · signed
              in as <span className="font-medium">{roleLabel}</span>.
            </>
          ) : undefined
        }
        actions={
          <>
            {refreshing ? (
              <span className="text-xs text-neutral-500" role="status">
                Updating…
              </span>
            ) : null}
            <TourButton />
          </>
        }
      />

      {isProvider ? (
        <div className="mb-3">
          <Card
            title="Provider review queue"
            actions={
              <Link href={ROUTES.requests} className="text-sm font-medium text-brand-700 hover:underline">
                Review requests
              </Link>
            }
          >
            <p className="text-sm text-neutral-600">
              <span className="font-mono text-lg font-semibold text-black">{summary.providerQueue ?? 0}</span>{" "}
              request{(summary.providerQueue ?? 0) === 1 ? "" : "s"} waiting for your response. Responses you
              author stay separate from requester-owned project documents.
            </p>
          </Card>
        </div>
      ) : null}

      {isEducation ? (
        <div className="mb-3">
          <Card
            title="Organization workspace"
            actions={
              <Link href={ROUTES.organizations} className="text-sm font-medium text-brand-700 hover:underline">
                Open organizations
              </Link>
            }
          >
            <p className="text-sm text-neutral-600">
              Discover projects and collaborate through your institution profile. Funding controls appear only
              for provider accounts.
            </p>
          </Card>
        </div>
      ) : null}

      {!isProvider ? <div id="dash-stats" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
      </div> : null}

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-2">
        {!isProvider ? <Card
          title={isEducation ? "Institution profile" : "Profile"}
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
        </Card> : null}

        {!isProvider && !isEducation ? <Card
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
        </Card> : null}

        <Card
          title={isProvider ? "Provider conversations" : "Recent messages"}
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

        {!isProvider ? <Card
          title={isProvider ? "Requests and project activity" : isEducation ? "Institution project activity" : "Projects & funding"}
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
        </Card> : null}

        {!isProvider ? <div id="dash-actions" className="lg:col-span-2">
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
        </div> : null}
      </div>
    </>
  );
}
