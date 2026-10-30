import "dotenv/config";
import { defineConfig } from "drizzle-kit";
import { resolveDrizzleKitDatabaseUrl } from "./db/neon-url.mjs";

export default defineConfig({
  schema: "./db/schema/index.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    // pg-compatible URL: direct Neon host, no channel_binding (unsupported by
    // node-postgres), TLS enforced. See db/neon-url.mjs.
    url: resolveDrizzleKitDatabaseUrl(),
  },
  verbose: true,
  strict: true,
});
