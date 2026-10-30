# TIXCONNECKT — Debugger Kit & Neon PostgreSQL Repair

Thoroughly inspect and debug the entire project using the available Debugger Kit. Identify and fix actual errors, broken functionality, database connection problems, migration failures and runtime issues.

**Priority: Fix the database commands in `package.json` that are not working correctly with Neon PostgreSQL.**

1. Inspect `package.json`, database configuration, ORM/driver setup, migration files, scripts and environment variables.
2. Identify why existing database commands fail with Neon PostgreSQL. Check connection pooling, SSL, connection strings, serverless driver compatibility, migration configuration and schema synchronization.
3. Repair the existing `db:*` scripts so they work reliably with the actual Neon PostgreSQL configuration. Preserve existing command names where possible.
4. Test database connection, schema inspection, migrations and database operations using the configured Neon database.
5. Run the Debugger Kit, inspect errors and warnings, and fix their actual root causes—not just suppress them.
6. Verify that authentication, CRUD operations and existing application features still work after repairs.

**NON-DESTRUCTIVE REQUIREMENTS — STRICTLY ENFORCED**

- Do not delete, drop, truncate, reset or recreate existing database tables, schemas or records.
- Do not run destructive migration commands or database resets.
- Do not overwrite existing production data.
- Do not remove working dependencies, scripts or features without proving they are unnecessary.
- Preserve existing database schema and data; use safe, incremental, backward-compatible migrations.
- Back up or establish a recovery point before any database-changing operation.
- Never expose database credentials or print secrets in logs.
- If a migration could cause data loss, STOP and report the risk instead of executing it.

**Final verification:** Run the repaired package database commands, confirm successful Neon PostgreSQL connectivity, validate migrations without data loss, and report the root causes, files changed, commands tested and any remaining issues.

Do not merely provide recommendations. Implement, test and verify the fixes in the existing codebase without destroying anything.