import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";

export type Database = NeonHttpDatabase<typeof schema>;

let cached: Database | null = null;

/**
 * Lazy database client. Throws only when actually used without DATABASE_URL,
 * so the app can render degraded states instead of crashing at import time.
 */
export function getDb(): Database {
  if (cached) return cached;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not configured. Set it in .env (see .env.example).",
    );
  }
  cached = drizzle(neon(url), { schema });
  return cached;
}

export function dbAvailable(): boolean {
  return Boolean(process.env.DATABASE_URL);
}
