# TIXCONNECKT

Connect people globally through compatible skills, career objectives, collaborative projects,
funding opportunities, and trusted support.

Full-stack Next.js application: authentication with email OTP, dashboard, profiles, matching,
Conneckt, real-time chat, wallet with an auditable ledger, plans, scheduled actions, projects,
funding requests with agreements, notifications, settings, and system administration.
Product, UI/UX, architecture, and security requirements live in `Specification/`.

## Stack

Next.js + React + TypeScript, Tailwind CSS, Neon PostgreSQL + Drizzle ORM, app-owned auth (+ jose),
Zod + React Hook Form, Nodemailer (Google SMTP), Socket.IO, Serwist PWA, Upstash Redis rate
limiting, Font Awesome icons, Inter + IBM Plex Mono.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Configure environment:

   ```bash
   # Create .env and fill in DATABASE_URL, AUTH_SECRET, SMTP_*, and only the integrations you enable.
   ```

   `DATABASE_URL` must be a PostgreSQL connection URL. For Neon, use the pooled
   connection URL for application traffic; `DATABASE_URL_DIRECT` is optional
   and is used by Drizzle Kit for schema changes. The runtime uses a shared
   `pg` connection pool (`DB_POOL_MAX=5`, `DB_CONNECT_TIMEOUT_MS=5000`,
   `DB_IDLE_TIMEOUT_MS=30000`, `DB_STATEMENT_TIMEOUT_MS=30000` by default).
   Set these `DB_*` values only when the deployment needs different limits.

   Private uploaded documents and profile/group photos use Neon Object Storage.
   Configure `AWS_ENDPOINT_URL_S3`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`,
   `AWS_REGION`, and `NEON_STORAGE_BUCKET` with a bucket and a Neon credential
   that has `storage:write` access. Without these values uploads return an
   explicit unavailable response; they are never stored in a temporary local
   file. Apply migration `0008_neon_object_storage.sql` to an existing database.

3. Apply the committed schema migrations and seed reference data (legal versions + plan catalog):

   ```bash
   npm run db:migrate
   npm run db:seed
   ```

   `db:migrate` is the schema-change path for existing databases and production.
   `db:push` is for local development only; do not use it against production.
   Migrations preserve existing profile media while new uploads use object storage.

4. Run the app:

   ```bash
   npm run dev          # Next.js only
   npm run realtime     # Socket.IO server (second terminal)
   npm run dev:all      # both at once
   ```

   Open [http://localhost:3000](http://localhost:3000) — visitors see the landing
   page, with sign-in and registration behind its buttons. Authenticated users
   go straight to `/dashboard`. (`/welcome` redirects to `/`.)

5. Schedule the action worker (example, every minute):

   ```bash
   curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/actions
   ```

## Scripts

| Command          | Purpose                                              |
| ---------------- | ---------------------------------------------------- |
| `dev` / `dev:all`| Start Next.js / Next.js + realtime server          |
| `realtime`       | Standalone Socket.IO server (`realtime.mjs`)         |
| `build` / `start`| Production build / production server               |
| `lint`           | ESLint                                               |
| `typecheck`      | `tsc --noEmit`                                       |
| `test`           | Vitest unit tests                                    |
| `test:e2e`       | Playwright smoke journeys (needs a running server)   |
| `db:generate`    | Generate Drizzle migrations                          |
| `db:migrate`     | Apply committed migrations                           |
| `db:push`        | Push schema directly (dev only)                      |
| `db:studio`      | Inspect the database                                 |
| `db:seed`        | Seed legal documents + plan catalog                  |

## Notes

- Graceful degradation: SMTP, Muse AI, Redis, and the realtime
  server are optional at runtime. Unconfigured integrations surface as explicit
  "pending" states — never fake success.
- Private data (auth, API, dashboard) is excluded from the service-worker cache.
- Financial balances derive only from approved ledger entries; AI-extracted
  values are proposals until a human verifies them.
- An administrator account is created by registering normally, then setting
  `role = 'admin'` on that user row before signing in.
