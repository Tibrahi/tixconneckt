/**
 * Neon PostgreSQL URL handling for Drizzle Kit (`pg`-driver) commands.
 *
 * The app runtime and Drizzle Kit use node-postgres (`pg`). Runtime queries
 * preserve the pooled DATABASE_URL; Drizzle Kit uses a direct Neon host. The
 * PostgreSQL driver:
 *  - does not implement SASL channel binding, so `channel_binding=require`
 *    must be removed;
 *  - cannot reliably run introspection/DDL over Neon's transaction-pooled
 *    (`-pooler.`) host, so the direct host must be used.
 *
 * Dependency-free so it can be imported from drizzle.config.ts, the
 * db preflight script, and unit tests.
 */

const CONNECT_TIMEOUT_SECONDS = "10";
const RUNTIME_CONNECT_TIMEOUT_SECONDS = "5";

/** Keep the current secure pg behavior explicit across pg major versions. */
function enforceVerifiedTls(parsed) {
  const sslmode = parsed.searchParams.get("sslmode");
  if (sslmode && ["prefer", "require", "verify-ca"].includes(sslmode)) {
    parsed.searchParams.set("sslmode", "verify-full");
  } else if (!sslmode && parsed.hostname.endsWith(".neon.tech")) {
    parsed.searchParams.set("sslmode", "verify-full");
  }
}

/**
 * Resolve the runtime URL for node-postgres while preserving a Neon pooler host.
 *
 * @param {Record<string, string | undefined>} [env=process.env]
 * @returns {string} pg-compatible runtime URL (still contains credentials).
 * @throws {Error} when the URL is missing, malformed, or not PostgreSQL.
 */
export function resolveRuntimeDatabaseUrl(env = process.env) {
  const databaseUrl = env.DATABASE_URL?.trim() ?? "";
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to connect to PostgreSQL.");
  }

  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL could not be parsed as a PostgreSQL URL.");
  }

  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("DATABASE_URL must use the postgres or postgresql scheme.");
  }

  parsed.searchParams.delete("channel_binding");
  enforceVerifiedTls(parsed);
  parsed.searchParams.set("connect_timeout", RUNTIME_CONNECT_TIMEOUT_SECONDS);

  return parsed.toString();
}

/**
 * Resolve the connection URL Drizzle Kit (`pg` driver) should use.
 * Prefers an explicit `DATABASE_URL_DIRECT` override, otherwise derives the
 * direct (non-pooler) host from `DATABASE_URL`.
 *
 * @param {Record<string, string | undefined>} [env=process.env]
 * @returns {string} pg-compatible connection URL (still contains credentials).
 * @throws {Error} when no database URL is configured or it cannot be parsed.
 */
export function resolveDrizzleKitDatabaseUrl(env = process.env) {
  const directOverride = env.DATABASE_URL_DIRECT?.trim();
  const databaseUrl = (directOverride || env.DATABASE_URL?.trim()) ?? "";

  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is required. Set it in .env before running Drizzle commands (see .env.example).",
    );
  }

  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error(
      "DATABASE_URL could not be parsed as a URL. Check its value in .env (see .env.example).",
    );
  }

  if (!directOverride && parsed.hostname.includes("-pooler.")) {
    // Neon documents the direct host as the same hostname without `-pooler`.
    parsed.hostname = parsed.hostname.replace("-pooler.", ".");
  }

  // node-postgres does not implement channel binding; TLS is still enforced
  // via sslmode=require below.
  parsed.searchParams.delete("channel_binding");
  enforceVerifiedTls(parsed);
  if (!parsed.searchParams.get("connect_timeout")) {
    parsed.searchParams.set("connect_timeout", CONNECT_TIMEOUT_SECONDS);
  }

  return parsed.toString();
}

/**
 * Redact credentials from a database URL for safe logging. Never prints secrets.
 *
 * @param {string} url
 * @returns {string} `host/db?params` without user info.
 */
export function redactDatabaseUrl(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname}${parsed.search ? `?${parsed.searchParams.toString()}` : ""}`;
  } catch {
    return "<unparseable database url>";
  }
}
