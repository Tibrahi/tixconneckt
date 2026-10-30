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

  const pool = new Pool({
    connectionString,
    max: positiveInteger(process.env.DB_POOL_MAX, 5),
    idleTimeoutMillis: positiveInteger(process.env.DB_IDLE_TIMEOUT_MS, 30_000),
    connectionTimeoutMillis: positiveInteger(process.env.DB_CONNECT_TIMEOUT_MS, 2_000),
    statement_timeout: positiveInteger(process.env.DB_STATEMENT_TIMEOUT_MS, 30_000),
  });
  pool.on("error", (error: Error & { code?: string }) => {
    console.error(`[db:pool] idle connection error (${error.code ?? error.name})`);
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
