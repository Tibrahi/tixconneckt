import { sql } from "drizzle-orm";
import { getDb, isDatabaseUnavailable, withDbRead, type Database } from "@/db";

export interface DashboardCounts {
  chat: number;
  notifications: number;
  conneckt: number;
  /** Present only when serving last-known counts during a database outage. */
  stale?: boolean;
}

/**
 * All three nav-badge counts in ONE database round trip (one pool checkout)
 * instead of three parallel queries. Scalar subselects keep each count
 * independent while sharing a single connection. NOT EXISTS (equivalent to
 * NOT IN here — both id columns are NOT NULL) lets Postgres probe the
 * message_reads index per message instead of materializing the read list.
 */
export async function getDashboardCounts(
  db: Database,
  userId: string,
): Promise<DashboardCounts> {
  const rows = await withDbRead(() => db.execute(sql`
    SELECT
      (SELECT COUNT(*)::int FROM "messages" AS "m"
        WHERE "m"."conversation_id" IN (SELECT "conversation_id" FROM "conversation_members" WHERE "user_id" = ${userId})
          AND "m"."sender_id" <> ${userId}
          AND NOT EXISTS (SELECT 1 FROM "message_reads" AS "r" WHERE "r"."message_id" = "m"."id" AND "r"."user_id" = ${userId})
      ) AS "chat",
      (SELECT COUNT(*)::int FROM "notifications" WHERE "user_id" = ${userId} AND "read_at" IS NULL) AS "notifications",
      (SELECT COUNT(*)::int FROM "connections" WHERE "addressee_id" = ${userId} AND "status" = 'pending') AS "conneckt"
  `));
  const row = (rows.rows[0] ?? {}) as Partial<DashboardCounts>;
  return {
    chat: row.chat ?? 0,
    notifications: row.notifications ?? 0,
    conneckt: row.conneckt ?? 0,
  };
}

interface CacheEntry<T> {
  expires: number;
  data: T;
}

/**
 * Tiny per-process TTL cache with in-flight deduplication: concurrent
 * callers for the same key share one execution instead of stampeding the
 * database. Used for hot polling endpoints (badge counts, summary).
 */
export function createTtlCache<T>(ttlMs: number) {
  const cached = new Map<string, CacheEntry<T>>();
  const inflight = new Map<string, Promise<T>>();

  function get(key: string, fn: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const hit = cached.get(key);
    if (hit && hit.expires > now) return Promise.resolve(hit.data);
    const running = inflight.get(key);
    if (running) return running;
    const task = fn().then(
      (data) => {
        cached.set(key, { expires: Date.now() + ttlMs, data });
        inflight.delete(key);
        return data;
      },
      (error: unknown) => {
        inflight.delete(key);
        throw error;
      },
    );
    inflight.set(key, task);
    // Opportunistically drop expired entries so the map cannot grow forever.
    if (cached.size > 5000) {
      for (const [k, v] of cached) {
        if (v.expires <= now) cached.delete(k);
      }
    }
    return task;
  }

  function invalidate(key: string): void {
    cached.delete(key);
  }

  /** Last-known data regardless of expiry; null when never cached. */
  function stale(key: string): T | null {
    return cached.get(key)?.data ?? null;
  }

  return { get, invalidate, stale };
}

/** Badge counts cached 10s per user; polling tabs share one DB round trip. */
export const countsCache = createTtlCache<DashboardCounts>(10_000);

/**
 * Cached read with graceful degradation: background overview data the UI
 * already treats as seconds-stale serves the last-known value (flagged
 * `stale`) with 200 during a transient outage instead of 503ing. Only a
 * cold cache plus a down database still throws (genuinely unavailable).
 */
export function getCachedWithStale<T extends object>(
  cache: Pick<ReturnType<typeof createTtlCache<T>>, "get" | "stale">,
  key: string,
  fn: () => Promise<T>,
  label: string,
): Promise<T> {
  return cache.get(key, fn).catch((error: unknown) => {
    if (!isDatabaseUnavailable(error)) throw error;
    const last = cache.stale(key);
    if (!last) throw error;
    console.warn(`[${label}] serving stale data while the database is unavailable`);
    return { ...last, stale: true };
  });
}

/**
 * Badge counts with graceful degradation.
 * The fetch parameter exists so tests can simulate the database honestly.
 */
export function getCachedDashboardCounts(
  userId: string,
  fetchCounts: (id: string) => Promise<DashboardCounts> = (id) => getDashboardCounts(getDb(), id),
): Promise<DashboardCounts> {
  return getCachedWithStale(countsCache, userId, () => fetchCounts(userId), "dashboard:counts");
}

/** Drop cached counts/summary after a mutation so refetches read fresh data. */
export function invalidateDashboardCaches(
  caches: Array<{ invalidate: (key: string) => void }>,
  userIds: Array<string | null | undefined>,
): void {
  for (const userId of userIds) {
    if (!userId) continue;
    for (const cache of caches) cache.invalidate(userId);
  }
}

export function invalidateCounts(...userIds: Array<string | null | undefined>): void {
  invalidateDashboardCaches([countsCache], userIds);
}

/** Dashboard summary payload cache (20s TTL); invalidated on mutations. */
export const summaryCache = createTtlCache<Record<string, unknown>>(20_000);

export function invalidateDashboard(...userIds: Array<string | null | undefined>): void {
  invalidateDashboardCaches([countsCache, summaryCache], userIds);
}

/** Standard 503 for genuine database unavailability: retryable, short wait. */
export function unavailableHeaders(): Record<string, string> {
  return { "Retry-After": "5", "Cache-Control": "no-store" };
}
