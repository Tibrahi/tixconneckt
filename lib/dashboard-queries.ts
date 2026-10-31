import { sql } from "drizzle-orm";
import { getDb, withDbRead, type Database } from "@/db";

export interface DashboardCounts {
  chat: number;
  notifications: number;
  conneckt: number;
}

/**
 * All three nav-badge counts in ONE database round trip (one pool checkout)
 * instead of three parallel queries. Scalar subselects keep each count
 * independent while sharing a single connection.
 */
export async function getDashboardCounts(
  db: Database,
  userId: string,
): Promise<DashboardCounts> {
  const rows = await withDbRead(() => db.execute(sql`
    SELECT
      (SELECT COUNT(*)::int FROM "messages"
        WHERE "conversation_id" IN (SELECT "conversation_id" FROM "conversation_members" WHERE "user_id" = ${userId})
          AND "sender_id" <> ${userId}
          AND "id" NOT IN (SELECT "message_id" FROM "message_reads" WHERE "user_id" = ${userId})
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

  return { get, invalidate };
}

/** Badge counts cached 10s per user; polling tabs share one DB round trip. */
export const countsCache = createTtlCache<DashboardCounts>(10_000);

export function getCachedDashboardCounts(userId: string): Promise<DashboardCounts> {
  return countsCache.get(userId, () => getDashboardCounts(getDb(), userId));
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
