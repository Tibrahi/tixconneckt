import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { resolveRuntimeDatabaseUrl } from "./neon-url.mjs";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;

type DatabaseGlobal = typeof globalThis & {
  __tixconnecktDatabase?: Database;
  __tixconnecktPool?: Pool;
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
 * Lazy database client. Throws only when actually used without DATABASE_URL,
 * so the app can render degraded states instead of crashing at import time.
 */
export function getDb(): Database {
  if (databaseGlobal.__tixconnecktDatabase) {
    return databaseGlobal.__tixconnecktDatabase;
  }

  const pool = new Pool({
    connectionString: resolveRuntimeDatabaseUrl(),
    max: positiveInteger(process.env.DB_POOL_MAX, 5),
    idleTimeoutMillis: positiveInteger(process.env.DB_IDLE_TIMEOUT_MS, 30_000),
    connectionTimeoutMillis: positiveInteger(process.env.DB_CONNECT_TIMEOUT_MS, 5_000),
    statement_timeout: positiveInteger(process.env.DB_STATEMENT_TIMEOUT_MS, 30_000),
  });
  pool.on("error", (error: Error & { code?: string }) => {
    console.error(`[db:pool] idle connection error (${error.code ?? error.name})`);
  });

  databaseGlobal.__tixconnecktPool = pool;
  databaseGlobal.__tixconnecktDatabase = drizzle(pool, { schema });
  return databaseGlobal.__tixconnecktDatabase;
}

export function dbAvailable(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/** Return a safe PostgreSQL/network error code for structured server logs. */
export function dbFailureCode(error: unknown): string {
  const pending: unknown[] = [error];
  const visited = new Set<object>();
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current || typeof current !== "object" || visited.has(current)) continue;
    visited.add(current);
    const candidate = current as { cause?: unknown; code?: unknown; sourceError?: unknown };
    if (typeof candidate.code === "string" && /^[A-Z0-9]{2,10}$/.test(candidate.code)) {
      return candidate.code;
    }
    pending.push(candidate.cause, candidate.sourceError);
  }
  return "unknown";
}

/** Exponential retry delay with half-to-full jitter, capped at two seconds. */
export function computeReadRetryDelayMs(attempt: number): number {
  const safeAttempt = Number.isFinite(attempt) ? Math.max(0, Math.floor(attempt)) : 0;
  const ceiling = Math.min(2_000, 150 * 2 ** Math.min(safeAttempt, 20));
  return Math.floor(ceiling / 2 + Math.random() * (ceiling / 2));
}

/** Retry reads after transient connection failures; query errors pass through unchanged. */
export async function withDbRead<T>(read: () => T | PromiseLike<T>, retries = 1): Promise<T> {
  const retryLimit = Number.isSafeInteger(retries) ? Math.min(5, Math.max(0, retries)) : 1;
  for (let attempt = 0; ; attempt++) {
    try {
      return await read();
    } catch (error) {
      if (!isDatabaseUnavailable(error) || attempt >= retryLimit) throw error;
      await new Promise((resolve) => setTimeout(resolve, computeReadRetryDelayMs(attempt)));
    }
  }
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
    };
    const code = typeof candidate.code === "string" ? candidate.code : "";

    if (DATABASE_NETWORK_ERROR_CODES.has(code) || code.startsWith("08")) {
      return true;
    }

    pending.push(candidate.cause, candidate.sourceError);
  }

  return false;
}
