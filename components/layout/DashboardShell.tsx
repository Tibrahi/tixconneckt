"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ADMIN_NAV, DASHBOARD_NAV, ROUTES, type NavItem } from "@/lib/routes";
import { Icon } from "@/components/ui/Icon";

function NavList({
  items,
  counts,
  collapsed,
  onNavigate,
}: {
  items: NavItem[];
  counts: Record<string, number>;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  return (
    <ul className="flex flex-col gap-1">
      {items.map((item) => {
        const active =
          item.href === ROUTES.dashboard || item.href === ROUTES.admin
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
        const count = item.countKey ? counts[item.countKey] ?? 0 : 0;
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              data-tour-nav={item.href}
              title={collapsed ? item.label : undefined}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "bg-brand-50 font-semibold text-brand-700 shadow-sm"
                  : "text-black hover:bg-neutral-100"
              } ${collapsed ? "justify-center px-2" : ""}`}
            >
              <span className={`text-base ${active ? "text-brand-600" : ""}`} aria-hidden="true">
                <Icon name={item.icon} />
              </span>
              {!collapsed ? <span className="flex-1 truncate">{item.label}</span> : null}
              {!collapsed && count > 0 ? (
                <span
                  aria-label={`${count} unread`}
                  className="rounded-full bg-brand-600 px-2 py-0.5 font-mono text-xs text-white"
                >
                  {count > 99 ? "99+" : count}
                </span>
              ) : null}
              {collapsed && count > 0 ? (
                <span
                  aria-label={`${count} unread`}
                  className="absolute ml-8 -mt-5 rounded-full bg-brand-600 px-1.5 py-0.5 font-mono text-[10px] text-white"
                >
                  {count > 99 ? "99+" : count}
                </span>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Authenticated two-region layout: left navigation + right content area.
 * No global dashboard header or footer. Page titles live in page content.
 */
export function DashboardShell({
  children,
  isAdmin,
  accountRole,
  category,
}: {
  children: ReactNode;
  isAdmin: boolean;
  accountRole: string;
  category: string;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [countsError, setCountsError] = useState(false);
  const router = useRouter();
  const countsAbortRef = useRef<AbortController | null>(null);
  const countsFailuresRef = useRef(0);

  const loadCounts = useCallback(async () => {
    // Cancel any in-flight poll so slow responses never overlap or pile up.
    countsAbortRef.current?.abort();
    const controller = new AbortController();
    countsAbortRef.current = controller;
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const res = await fetch("/api/dashboard/counts", { cache: "no-store", signal: controller.signal });
      if (res.ok) {
        const body = (await res.json()) as { ok: boolean; data?: Record<string, number> };
        if (body.ok && body.data) {
          setCounts(body.data);
          setCountsError(false);
          countsFailuresRef.current = 0;
        } else {
          setCountsError(true);
        }
      } else {
        setCountsError(true);
        countsFailuresRef.current += 1;
      }
    } catch (error) {
      // Aborts from a newer poll or unmount are not errors.
      if (error instanceof DOMException && error.name === "AbortError") return;
      setCountsError(true);
      countsFailuresRef.current += 1;
    } finally {
      clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    loadCounts();
    // Jittered interval with backoff: when the backend is struggling, polls
    // back off instead of stampeding it; jitter desynchronizes open tabs.
    let delay = 30000 + Math.floor(Math.random() * 10000);
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(async () => {
        await loadCounts();
        const backoff = Math.min(120000, delay * (countsFailuresRef.current > 0 ? 2 : 1));
        delay = countsFailuresRef.current > 0 ? backoff : 30000 + Math.floor(Math.random() * 10000);
        schedule();
      }, delay);
    };
    schedule();
    const onUpdate = () => loadCounts();
    window.addEventListener("tix:counts", onUpdate);
    return () => {
      clearTimeout(timer);
      countsAbortRef.current?.abort();
      window.removeEventListener("tix:counts", onUpdate);
    };
  }, [loadCounts]);

  async function logout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      /* still redirect to login below */
    }
    router.push(ROUTES.login);
    router.refresh();
  }

  const sidebarWidth = collapsed ? "lg:w-16" : "lg:w-60";
  // Navigation reflects the work each account is assigned. The APIs remain
  // responsible for their resource ownership and permission checks.
  const roleNav = isAdmin ? DASHBOARD_NAV : accountRole === "provider"
    ? DASHBOARD_NAV.filter((item) => [ROUTES.dashboard, ROUTES.profile, ROUTES.chat, ROUTES.requests, ROUTES.organizations, ROUTES.notifications, ROUTES.plans, ROUTES.settings].includes(item.href as never))
    : category === "university" || category === "government"
      ? DASHBOARD_NAV.filter((item) => ![ROUTES.wallet, ROUTES.plans].includes(item.href as never))
      : DASHBOARD_NAV;

  return (
    <div className="min-h-screen bg-neutral-50 text-black">
      {/* Mobile top bar with drawer trigger (page-level, not a global header) */}
      <div className="sticky top-0 z-30 flex items-center gap-2 border-b border-neutral-200 bg-white px-4 py-2.5 lg:hidden">
        <button
          type="button"
          aria-label="Open navigation"
          onClick={() => setDrawerOpen(true)}
          className="rounded-md p-2 hover:bg-neutral-100"
        >
          <Icon name="bars" />
        </button>
        <span className="text-sm font-semibold">TIXCONNECKT</span>
      </div>

      <div className="flex min-h-screen lg:min-h-0">
        {/* Desktop / tablet sidebar */}
        <aside
          className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-neutral-200 bg-white p-3 transition-all motion-reduce:transition-none lg:flex ${sidebarWidth}`}
          aria-label="Main navigation"
        >
          <div className={`flex items-center gap-2 px-1 pb-3 ${collapsed ? "justify-center" : "justify-between"}`}>
            {!collapsed ? <span className="text-sm font-bold tracking-tight">TIXCONNECKT</span> : null}
            <button
              type="button"
              aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
              onClick={() => setCollapsed((c) => !c)}
              className="rounded-md p-2 hover:bg-neutral-100"
            >
              <Icon name={collapsed ? "chevron-right" : "chevron-left"} />
            </button>
          </div>
          <nav id="tour-sidebar" className="flex-1 overflow-y-auto" aria-label="Dashboard sections">
            <NavList items={roleNav} counts={counts} collapsed={collapsed} />
            {isAdmin ? (
              <>
                {!collapsed ? (
                  <p className="px-3 pb-1 pt-4 text-xs font-semibold uppercase text-neutral-500">
                    Administration
                  </p>
                ) : (
                  <hr className="mx-2 my-3 border-neutral-200" />
                )}
                <NavList items={ADMIN_NAV} counts={counts} collapsed={collapsed} />
              </>
            ) : null}
          </nav>
          <button
            type="button"
            onClick={logout}
            title={collapsed ? "Log out" : undefined}
            className={`mt-3 flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-black hover:bg-neutral-100 ${
              collapsed ? "justify-center px-2" : ""
            }`}
          >
            <Icon name="logout" />
            {!collapsed ? <span>Log out</span> : null}
          </button>
        </aside>

        {/* Mobile drawer */}
        {drawerOpen ? (
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
            <div
              className="absolute inset-0 bg-black/40"
              onClick={() => setDrawerOpen(false)}
              aria-hidden="true"
            />
            <aside className="absolute left-0 top-0 flex h-full w-72 flex-col bg-white p-3 shadow-xl">
              <div className="flex items-center justify-between px-1 pb-3">
                <span className="text-sm font-bold">TIXCONNECKT</span>
                <button
                  type="button"
                  aria-label="Close navigation"
                  onClick={() => setDrawerOpen(false)}
                  className="rounded-md p-2 hover:bg-neutral-100"
                >
                  <Icon name="xmark" />
                </button>
              </div>
              <nav className="flex-1 overflow-y-auto" aria-label="Dashboard sections">
                <NavList
                  items={roleNav}
                  counts={counts}
                  collapsed={false}
                  onNavigate={() => setDrawerOpen(false)}
                />
                {isAdmin ? (
                  <>
                    <p className="px-3 pb-1 pt-4 text-xs font-semibold uppercase text-neutral-500">
                      Administration
                    </p>
                    <NavList
                      items={ADMIN_NAV}
                      counts={counts}
                      collapsed={false}
                      onNavigate={() => setDrawerOpen(false)}
                    />
                  </>
                ) : null}
              </nav>
              <button
                type="button"
                onClick={logout}
                className="mt-3 flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium hover:bg-neutral-100"
              >
                <Icon name="logout" />
                <span>Log out</span>
              </button>
            </aside>
          </div>
        ) : null}

        {/* Right content area */}
        <main id="tour-main" className="min-w-0 flex-1 px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
          {countsError ? (
            <div className="mx-auto mb-4 flex max-w-6xl items-center justify-between gap-3 rounded-md border border-blue-300 bg-blue-50 px-4 py-3 text-sm text-blue-950" role="status">
              <span>Some dashboard counts could not load. Please retry.</span>
              <button type="button" onClick={loadCounts} className="shrink-0 font-semibold underline">Retry</button>
            </div>
          ) : null}
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
