/**
 * Runs once when the Next.js server boots, before it serves requests.
 * Applies pending database migrations so a fresh pull never 500s on a
 * schema the code already expects (e.g. the documents `data` column).
 * Safe to run on every boot: migrations are idempotent, concurrent boots
 * are serialized with an advisory lock, and any failure only logs —
 * the server still starts. Set SKIP_AUTO_MIGRATE=1 to manage migrations
 * externally with `npm run db:migrate`.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { migrateOnBoot } = await import("./db/migrate-on-boot");
    await migrateOnBoot();
  }
}
