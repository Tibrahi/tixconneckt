import { access } from "node:fs/promises";
import { join } from "node:path";
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
  } catch (error) {
    console.error(
      `[db] automatic migration could not connect (${error instanceof Error ? error.message.split("\n")[0] || "connection failed" : String(error)}). ` +
        "Check DATABASE_URL and database network access; pending schema changes remain unapplied.",
    );
    return;
  }
  try {
    const held = await lockClient
      .query("SELECT pg_try_advisory_lock($1) AS locked", [MIGRATION_ADVISORY_LOCK_KEY])
      .then((r) => r.rows[0]?.locked === true)
      .catch(() => false);
    if (!held) return;
    const folder = join(process.cwd(), "db", "migrations");
    try {
      await access(join(folder, "meta", "_journal.json"));
    } catch {
      // Missing journal (pruned deploy output, wrong working directory):
      // say exactly where we looked instead of a cryptic migrator error.
      console.error(
        `[db] automatic migration skipped (no migration journal at ${folder}). ` +
          "Run `npm run db:migrate` from the project root once the database is reachable.",
      );
      return;
    }
    const pool = new Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 10_000 });
    try {
      await migrate(drizzle(pool), { migrationsFolder: folder });
      const schema = await pool.query<{
        call_interpretations: string | null;
        payment_method_columns: string[];
      }>(`
        SELECT
          (SELECT to_regclass('public.call_interpretations')::text) AS call_interpretations,
          COALESCE(array_agg(column_name) FILTER (WHERE column_name IS NOT NULL), ARRAY[]::text[]) AS payment_method_columns
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'payment_methods'
          AND column_name IN ('method_option', 'details')
      `);
      const currentSchema = schema.rows[0];
      const missing = [
        ...(!currentSchema?.call_interpretations ? ["public.call_interpretations"] : []),
        ...(["method_option", "details"].filter((column) => !currentSchema?.payment_method_columns.includes(column)).map((column) => `payment_methods.${column}`)),
      ];
      if (missing.length) {
        throw new Error(`migration journal advanced but schema is still missing ${missing.join(", ")}`);
      }
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

/** True when the error (or anything in its cause chain) carries one of the given Postgres codes. */
function hasPgCode(error: unknown, codes: ReadonlySet<string>): boolean {
  const pending: unknown[] = [error];
  const visited = new Set<object>();
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current || typeof current !== "object" || visited.has(current)) continue;
    visited.add(current);
    const candidate = current as { cause?: unknown; code?: unknown };
    if (typeof candidate.code === "string" && codes.has(candidate.code)) return true;
    pending.push(candidate.cause);
  }
  return false;
}

const BEHIND_SCHEMA_CODES = new Set(["42703", "42P01"]);

/** True when the error (or anything in its cause chain) is Postgres 42703. */
export function isMissingColumnError(error: unknown): boolean {
  return hasPgCode(error, new Set(["42703"]));
}

/** True when the error (or anything in its cause chain) is Postgres 42P01 (missing table). */
export function isMissingTableError(error: unknown): boolean {
  return hasPgCode(error, new Set(["42P01"]));
}

/**
 * Run a storage query, self-healing once when the schema is behind the code:
 * on Postgres 42703 (undefined column) or 42P01 (undefined table) it
 * applies pending migrations and retries a single time. Every other
 * error — and a retry that still fails — propagates untouched. The migrate
 * step is injectable so tests never touch a database.
 */
export async function withMigrationRetry<T>(
  fn: () => Promise<T>,
  migrate: () => Promise<void> = migrateOnBoot,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (!hasPgCode(error, BEHIND_SCHEMA_CODES)) throw error;
    console.log("[db] schema is behind the code; applying migrations and retrying once");
    await migrate();
    return await fn();
  }
}
