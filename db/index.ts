import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { resolveRuntimeDatabaseUrl } from "./neon-url.mjs";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;

type DatabaseGlobal = typeof globalThis & {
  __tixconnecktDatabase?: Database;
  __tixconnecktPool?: Pool;
  __tixconnecktDatabaseUrl?: string;
};

const databaseGlobal = globalThis as DatabaseGlobal;
const DATABASE_NETWORK_ERROR_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "ENOTFOUND",
  "57P01",
  "57P02",
  "57P03",
  "53300",
]);

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Backoff delay for a read retry: exponential growth capped at 2s, plus
 * random jitter so concurrent readers do not retry in lockstep.
 * Pure and exported for unit tests.
 */
export function computeReadRetryDelayMs(attempt: number, baseMs = 150): number {
  const grown = Math.min(2000, baseMs * 2 ** Math.max(0, attempt));
  return Math.round(grown / 2 + Math.random() * (grown / 2));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Lazy database client. Throws only when actually used without DATABASE_URL,
 * so the app can render degraded states instead of crashing at import time.
 */
export function getDb(): Database {
  const connectionString = resolveRuntimeDatabaseUrl();
  if (
    databaseGlobal.__tixconnecktDatabase &&
    databaseGlobal.__tixconnecktDatabaseUrl === connectionString
  ) {
    return databaseGlobal.__tixconnecktDatabase;
  }

  // Next dev can reload .env without restarting the process. Replace stale
  // pools when the connection target changes so requests use the new URL.
  if (databaseGlobal.__tixconnecktPool) {
    void databaseGlobal.__tixconnecktPool.end().catch(() => {});
  }

  // Pool sizing rationale: dashboard reads fan out into several queries, so a
  // max of 5 with a 2s acquire timeout turned normal bursts into 503s. A max
  // of 10 with a 10s acquire timeout absorbs bursts by queueing briefly
  // instead of failing; statement timeout still bounds slow queries.
  const pool = new Pool({
    connectionString,
    max: positiveInteger(process.env.DB_POOL_MAX, 10),
    idleTimeoutMillis: positiveInteger(process.env.DB_IDLE_TIMEOUT_MS, 30_000),
    connectionTimeoutMillis: positiveInteger(process.env.DB_CONNECT_TIMEOUT_MS, 10_000),
    statement_timeout: positiveInteger(process.env.DB_STATEMENT_TIMEOUT_MS, 30_000),
  });
  pool.on("error", (error: Error & { code?: string }) => {
    console.error(
      `[db:pool] idle connection error (${error.code ?? error.name}): ${error.message.split("\n")[0]}`,
    );
  });

  databaseGlobal.__tixconnecktPool = pool;
  databaseGlobal.__tixconnecktDatabaseUrl = connectionString;
  databaseGlobal.__tixconnecktDatabase = drizzle(pool, { schema });
  return databaseGlobal.__tixconnecktDatabase;
}

export function dbAvailable(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/** Detect connection-level PostgreSQL failures without masking query errors. */
export function isDatabaseUnavailable(error: unknown): boolean {
  const pending: unknown[] = [error];
  const visited = new Set<object>();
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current || typeof current !== "object" || visited.has(current)) continue;
    visited.add(current);

    const candidate = current as {
      cause?: unknown;
      code?: unknown;
      message?: unknown;
      name?: unknown;
      sourceError?: unknown;
      errors?: unknown[];
    };
    const code = typeof candidate.code === "string" ? candidate.code : "";

    if (DATABASE_NETWORK_ERROR_CODES.has(code) || code.startsWith("08")) {
      return true;
    }

    const message = typeof candidate.message === "string" ? candidate.message.toLowerCase() : "";
    if (message.includes("timeout exceeded when trying to connect") ||
        message.includes("connection terminated due to connection timeout") ||
        message.includes("connection timeout")) return true;

    pending.push(candidate.cause, candidate.sourceError, ...(candidate.errors ?? []));
  }

  return false;
}

/**
 * First Postgres/driver error code found walking the cause chain, or
 * "unknown". Gives every 503 log line a failure category (improve.md asks
 * for endpoint + category on each 503) without duplicating the traversal.
 */
export function dbFailureCode(error: unknown): string {
  const pending: unknown[] = [error];
  const visited = new Set<object>();
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current || typeof current !== "object" || visited.has(current)) continue;
    visited.add(current);
    const candidate = current as { cause?: unknown; code?: unknown };
    if (typeof candidate.code === "string" && candidate.code) return candidate.code;
    pending.push(candidate.cause);
  }
  return "unknown";
}

/**
 * Run an idempotent READ with one automatic retry on connection-level
 * failures (pool saturation, reset connections, failover). Uses exponential
 * backoff with jitter and never retries query errors or writes, so it
 * cannot duplicate side effects. Recovery that still fails throws, and the
 * caller maps it to a 503 with Retry-After.
 */
export async function withDbRead<T>(fn: () => Promise<T>, maxRetries = 1): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= maxRetries || !isDatabaseUnavailable(error)) throw error;
      const delay = computeReadRetryDelayMs(attempt);
      console.warn(`[db:retry] connection-level failure, retrying read in ${delay}ms (attempt ${attempt + 1})`);
      await sleep(delay);
      attempt += 1;
    }
  }
}
