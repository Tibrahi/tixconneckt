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
import { useAbly } from "@/components/realtime/AblyProvider";

interface Summary {
  profileCompletion: number;
  shortId: string;
  actor?: { role: string; category: string; providerKind: string | null };
  providerQueue?: number;
  supportQueue?: number;
  organizations?: Array<{ id: string; name: string; kind: string | null; verificationStatus: string; role: string }>;
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

function ProjectList({ summary, title, emptyTitle, emptyMessage }: {
  summary: Summary;
  title: string;
  emptyTitle: string;
  emptyMessage: string;
}) {
  return (
    <Card title={title} actions={<Link href={ROUTES.projects} className="text-sm font-medium text-brand-700 hover:underline">Open portfolio</Link>}>
      {summary.recentProjects.length === 0 ? (
        <EmptyState icon="diagram-project" title={emptyTitle} message={emptyMessage} action={<Link href={ROUTES.projects} className="font-medium text-brand-700 hover:underline">Create a workspace</Link>} />
      ) : (
        <ul className="flex flex-col gap-2">{summary.recentProjects.map((project) => <li key={project.id}><Link href={ROUTES.projectById(project.id)} className="flex items-center justify-between gap-2 rounded-md border border-neutral-200 p-3 hover:border-brand-300"><span className="truncate text-sm font-medium">{project.title}</span><Badge>{project.stage}</Badge></Link></li>)}</ul>
      )}
    </Card>
  );
}

function RoleDashboardActions({ refreshing }: { refreshing: boolean }) {
  return (
    <div className="flex items-center gap-3">
      {refreshing ? <span className="text-xs text-neutral-500" role="status">Updating…</span> : null}
      <Link href={ROUTES.profile} className="text-sm font-medium text-brand-700 hover:underline">My profile</Link>
    </div>
  );
}

function UniversityDashboard({ summary, refreshing }: { summary: Summary; refreshing: boolean }) {
  return (
    <>
      <PageHeader title="University research workspace" description="Coordinate research projects you own or have been added to, organize academic teams, and manage support cases assigned to your institution." actions={<RoleDashboardActions refreshing={refreshing} />} />
      <div className="grid gap-5 xl:grid-cols-[1.6fr_0.9fr]">
        <ProjectList summary={summary} title="Research projects you own or joined" emptyTitle="No research projects yet" emptyMessage="Create a research workspace from your account or join a project when its owner invites you." />
        <div className="flex flex-col gap-5">
          <Card title="Academic teams" actions={<Link href={ROUTES.groups} className="text-sm font-medium text-brand-700 hover:underline">Open research groups</Link>}>
            <p className="text-3xl font-semibold tabular-nums">{summary.groupCount}</p>
            <p className="mt-1 text-sm text-neutral-600">Active groups connected to your account.</p>
            <p className="mt-3 text-sm font-medium">{summary.pendingApprovals} group approval{summary.pendingApprovals === 1 ? "" : "s"} awaiting action</p>
          </Card>
          <Card title="Research support">
            <p className="text-sm text-neutral-600">{summary.openFunding} open funding request{summary.openFunding === 1 ? "" : "s"} attached to your projects.</p>
            <p className="mt-2 text-sm text-neutral-600">{summary.supportQueue ?? 0} active non-financial support case{summary.supportQueue === 1 ? "" : "s"} for you or your institution.</p>
            <div className="mt-3 flex flex-wrap gap-3"><Link href={ROUTES.requests} className="text-sm font-medium text-brand-700 hover:underline">Review funding →</Link><Link href={ROUTES.support} className="text-sm font-medium text-brand-700 hover:underline">Open support cases →</Link></div>
          </Card>
          <Card title="Institution profile" actions={<Link href={ROUTES.organizations} className="text-sm font-medium text-brand-700 hover:underline">Manage profile</Link>}>
            <OrganizationVerification summary={summary} category="university" />
          </Card>
        </div>
      </div>
      <Card title="Academic collaboration" className="mt-5">
        <p className="text-sm text-neutral-600">Find partners for a research initiative, manage approved connections, and continue the work in shared conversations.</p>
        <div className="mt-3 flex flex-wrap gap-3"><Link href={ROUTES.conneckt} className="text-sm font-medium text-brand-700 hover:underline">Find research partners →</Link><Link href={ROUTES.chat} className="text-sm font-medium text-brand-700 hover:underline">Continue collaboration →</Link></div>
      </Card>
    </>
  );
}

function GovernmentDashboard({ summary, refreshing }: { summary: Summary; refreshing: boolean }) {
  return (
    <>
      <PageHeader title="Government program coordination" description="Coordinate projects created by you or your groups, track funding requests, and manage assistance cases assigned to your agency." actions={<RoleDashboardActions refreshing={refreshing} />} />
      <section aria-label="Program coordination actions" className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-2xl bg-brand-900 p-6 text-white sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-brand-100">Program coordination</p>
          <h2 className="mt-3 max-w-xl text-2xl font-semibold">Keep initiatives, teams, and support in one accountable workflow.</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-brand-100">Use your project and group workspaces to coordinate collaborators, documents, and requests with people assigned to the work.</p>
          <Link href={ROUTES.projects} className="mt-5 inline-flex rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-brand-900 hover:bg-brand-50">Open public programs</Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <Link href={ROUTES.groups} className="rounded-xl border border-neutral-200 bg-white p-5 shadow-card hover:border-brand-300">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">Inter-agency coordination</p>
            <h2 className="mt-2 text-2xl font-semibold tabular-nums">{summary.groupCount}</h2>
            <p className="text-sm text-neutral-600">Active coordination groups · {summary.pendingApprovals} approvals pending</p>
            <span className="mt-3 inline-block text-sm font-medium text-brand-700">Manage group participation →</span>
          </Link>
          <Link href={ROUTES.requests} className="rounded-xl border border-neutral-200 bg-white p-5 shadow-card hover:border-brand-300">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">Program funding</p>
            <h2 className="mt-2 text-2xl font-semibold tabular-nums">{summary.openFunding}</h2>
            <p className="text-sm text-neutral-600">Open requests from programs you own</p>
            <span className="mt-3 inline-block text-sm font-medium text-brand-700">Review program requests →</span>
          </Link>
          <Link href={ROUTES.support} className="rounded-xl border border-neutral-200 bg-white p-5 shadow-card hover:border-brand-300">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">Assistance cases</p>
            <h2 className="mt-2 text-2xl font-semibold tabular-nums">{summary.supportQueue ?? 0}</h2>
            <p className="text-sm text-neutral-600">Active non-financial cases for your agency</p>
            <span className="mt-3 inline-block text-sm font-medium text-brand-700">Review assigned cases →</span>
          </Link>
        </div>
      </section>
      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <ProjectList summary={summary} title="Projects you own or joined" emptyTitle="No projects in this workspace" emptyMessage="Create a project from your account or join an existing project when its owner invites you." />
        <div className="flex flex-col gap-5">
          <Card title="Agency identity" actions={<Link href={ROUTES.organizations} className="text-sm font-medium text-brand-700 hover:underline">Manage agency profile</Link>}>
            <OrganizationVerification summary={summary} category="government" />
          </Card>
          <Card title="External coordination" actions={<Link href={ROUTES.conneckt} className="text-sm font-medium text-brand-700 hover:underline">Open partner network</Link>}>
            <p className="text-sm text-neutral-600">Review partner connections and continue approved program conversations in chat.</p>
            <Link href={ROUTES.chat} className="mt-3 inline-block text-sm font-medium text-brand-700 hover:underline">Open partner communications →</Link>
          </Card>
        </div>
      </div>
    </>
  );
}

function ProviderDashboard({ summary, providerKind, refreshing }: { summary: Summary; providerKind: string | null; refreshing: boolean }) {
  const focus = providerKind === "loan" ? "funding requests" : providerKind === "support" ? "support requests" : "assigned requests";
  const queueHref = providerKind === "support" ? ROUTES.support : ROUTES.requests;
  const queueCount = providerKind === "support" ? summary.supportQueue ?? 0 : summary.providerQueue ?? 0;
  return (
    <>
      <PageHeader title={providerKind === "loan" ? "Funding provider workspace" : providerKind === "support" ? "Support provider workspace" : "Provider workspace"} description={`Review ${focus}, respond to eligible projects, and manage the provider connections assigned to your account.`} actions={<RoleDashboardActions refreshing={refreshing} />} />
      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-2xl bg-brand-900 p-6 text-white sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-brand-100">Assigned work queue</p>
          <h2 className="mt-3 text-3xl font-semibold tabular-nums">{queueCount}</h2>
          <p className="mt-2 max-w-lg text-sm leading-6 text-brand-100">{focus} and provider connection requests assigned to your account are managed in the review workspace.</p>
          <Link href={queueHref} className="mt-5 inline-flex rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-brand-900 hover:bg-brand-50">Review assigned work</Link>
        </div>
        <div className="flex flex-col gap-5">
          <Card title="Provider organization" actions={<Link href={ROUTES.organizations} className="text-sm font-medium text-brand-700 hover:underline">Manage profile</Link>}>
            <OrganizationVerification summary={summary} category="provider" />
          </Card>
          <Card title="Response conversations" actions={<Link href={ROUTES.chat} className="text-sm font-medium text-brand-700 hover:underline">Open provider chat</Link>}>
            {summary.recentMessages.length === 0 ? <p className="text-sm text-neutral-600">Messages for approved provider connections appear here.</p> : <ul className="flex flex-col gap-2">{summary.recentMessages.slice(0, 3).map((message) => <li key={message.id}><Link href={ROUTES.chatThread(message.conversationId)} className="block rounded-md border border-neutral-200 p-3 hover:border-brand-300"><span className="block text-sm font-medium">{message.senderName}</span><span className="block truncate text-sm text-neutral-600">{message.preview}</span></Link></li>)}</ul>}
          </Card>
        </div>
      </div>
      <Card title="Scoped project information" className="mt-5">
        <p className="text-sm text-neutral-600">Project details and files are available through the specific request that shares them. A funding decision or support response does not grant access to unrelated project records.</p>
      </Card>
      <Card title="How provider work proceeds" className="mt-5">
        <ol className="grid gap-4 md:grid-cols-3">
          <li><span className="font-mono text-xs font-semibold text-brand-700">01 · RECEIVE</span><p className="mt-1 text-sm text-neutral-600">Open requests and connection invitations assigned to your provider account.</p></li>
          <li><span className="font-mono text-xs font-semibold text-brand-700">02 · RESPOND</span><p className="mt-1 text-sm text-neutral-600">{providerKind === "support" ? "Agree service goals, assign a specialist, and record milestones in the case." : "Prepare a documented offer and agreement in the funding request workspace."}</p></li>
          <li><span className="font-mono text-xs font-semibold text-brand-700">03 · FOLLOW THROUGH</span><p className="mt-1 text-sm text-neutral-600">Keep communications and recorded decisions with the request they belong to.</p></li>
        </ol>
      </Card>
    </>
  );
}

function OrganizationVerification({ summary, category }: { summary: Summary; category: "university" | "government" | "provider" }) {
  const organization = summary.organizations?.find((item) => item.kind === category);
  if (!organization) return <p className="text-sm text-neutral-600">No organization profile is linked to this account yet. Create one or request access to an existing profile.</p>;
  const label = organization.verificationStatus === "verified" ? "Verified" : organization.verificationStatus === "pending" ? "Verification pending" : "Unverified";
  return <div><p className="font-medium">{organization.name}</p><p className="mt-1 text-sm text-neutral-600">{label} · {organization.role}</p>{organization.verificationStatus !== "verified" ? <p className="mt-2 text-xs text-neutral-600">{category === "provider" ? "New provider work waits until the provider service profile is verified." : "Institutional authority is not enabled until verification is approved."}</p> : null}</div>;
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

  if (isProvider) {
    return <ProviderDashboard summary={summary} providerKind={providerKind} refreshing={refreshing} />;
  }
  if (actorRole === "user" && actorCategory === "university") {
    return <UniversityDashboard summary={summary} refreshing={refreshing} />;
  }
  if (actorRole === "user" && actorCategory === "government") {
    return <GovernmentDashboard summary={summary} refreshing={refreshing} />;
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
          </>
        }
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
        <StatCard label="Support cases" value={summary.supportQueue ?? 0} href={ROUTES.support} icon="handshake" />
      </div>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-2">
        <Card
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
