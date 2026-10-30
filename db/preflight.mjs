/**
 * Preflight for `pg`-driver db commands (`db:migrate`, `db:push`, `db:studio`).
 *
 * Drizzle Kit currently reports connection failures as a silent spinner with
 * exit code 1. This preflight runs one `SELECT 1` through the same driver and
 * URL Drizzle Kit will use, so unreachable hosts, TLS problems, and bad
 * credentials fail fast with an actionable message instead.
 *
 * Read-only: never writes. Quiet on success.
 *
 * Usage: node db/preflight.mjs
 */
import "dotenv/config";
import { Client } from "pg";
import { redactDatabaseUrl, resolveDrizzleKitDatabaseUrl } from "./neon-url.mjs";

async function main() {
  let url;
  try {
    url = resolveDrizzleKitDatabaseUrl();
  } catch (error) {
    console.error(`db: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }

  const client = new Client({ connectionString: url, connectionTimeoutMillis: 15000 });
  try {
    await client.connect();
    await client.query("select 1");
  } catch (error) {
    const detail = error instanceof Error ? error.message.split("\n")[0] : String(error);
    console.error(
      `db: cannot reach Neon PostgreSQL (${redactDatabaseUrl(url)}): ${detail}\n` +
        "db: check DATABASE_URL in .env (see .env.example), your network, and that the Neon project is active.",
    );
    process.exit(1);
  } finally {
    try {
      await client.end();
    } catch {
      // Ignore close errors; the probe already succeeded or reported.
    }
  }
}

await main();
