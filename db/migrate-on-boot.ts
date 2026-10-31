import { Client, Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { resolveDrizzleKitDatabaseUrl } from "./neon-url.mjs";

/**
 * Fixed key for the migration advisory lock. Only one server instance
 * applies pending migrations; the rest skip once the lock is taken.
 */
const MIGRATION_ADVISORY_LOCK_KEY = 727073610;

/**
 * Whether the server should apply pending migrations automatically. Pure and
 * unit-tested. Skipped explicitly via SKIP_AUTO_MIGRATE=1 (deployments that
 * manage migrations externally with `npm run db:migrate`) or when no
 * database URL is configured — the app then boots degraded, as before.
 */
export function shouldAutoMigrate(env: Record<string, string | undefined> = process.env): boolean {
  if (env.SKIP_AUTO_MIGRATE === "1") return false;
  return Boolean(env.DATABASE_URL?.trim());
}

/**
 * Apply pending migrations from ./db/migrations exactly once per database.
 * Uses the direct (non-pooled) host like `npm run db:migrate`, because DDL
 * cannot reliably run over Neon's transaction-pooled host. Idempotent
 * (drizzle tracks applied migrations) and race-safe across concurrent
 * callers via a session advisory lock. Never throws and never blocks the
 * caller: any failure is logged and the caller continues, so reads of
 * already-migrated tables keep working.
 */
export async function migrateOnBoot(): Promise<void> {
  if (!shouldAutoMigrate()) return;
  let url: string;
  try {
    url = resolveDrizzleKitDatabaseUrl();
  } catch {
    return;
  }
  const lockClient = new Client({ connectionString: url, connectionTimeoutMillis: 10_000 });
  try {
    await lockClient.connect();
  } catch {
    return;
  }
  try {
    const held = await lockClient
      .query("SELECT pg_try_advisory_lock($1) AS locked", [MIGRATION_ADVISORY_LOCK_KEY])
      .then((r) => r.rows[0]?.locked === true)
      .catch(() => false);
    if (!held) return;
    const pool = new Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 10_000 });
    try {
      await migrate(drizzle(pool), { migrationsFolder: "./db/migrations" });
      console.log("[db] migrations are up to date");
    } catch (error) {
      console.error(
        `[db] automatic migration failed (${error instanceof Error ? error.message.split("\n")[0] : String(error)}). ` +
          "Run `npm run db:migrate` once the database is reachable.",
      );
    } finally {
      await pool.end().catch(() => undefined);
    }
  } finally {
    // Ending the session releases the advisory lock.
    await lockClient.end().catch(() => undefined);
  }
}

/** True when the error (or anything in its cause chain) is Postgres 42703. */
export function isMissingColumnError(error: unknown): boolean {
  const pending: unknown[] = [error];
  const visited = new Set<object>();
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current || typeof current !== "object" || visited.has(current)) continue;
    visited.add(current);
    const candidate = current as { cause?: unknown; code?: unknown };
    if (candidate.code === "42703") return true;
    pending.push(candidate.cause);
  }
  return false;
}

/**
 * Run a storage query, self-healing once when the schema is behind the code:
 * on Postgres 42703 (undefined column) it applies pending migrations and
 * retries a single time. Every other error — and a retry that still fails —
 * propagates untouched. The migrate step is injectable so tests never touch
 * a database.
 */
export async function withMigrationRetry<T>(
  fn: () => Promise<T>,
  migrate: () => Promise<void> = migrateOnBoot,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (!isMissingColumnError(error)) throw error;
    console.log("[db] schema is behind the code (42703); applying migrations and retrying once");
    await migrate();
    return await fn();
  }
}
