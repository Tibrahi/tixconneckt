# TIXCONNECKT

Connect people globally through compatible skills, career objectives, collaborative projects,
funding opportunities, and trusted support.

Full-stack Next.js application: authentication with email OTP, dashboard, profiles, matching,
Conneckt, real-time chat, wallet with an auditable ledger, plans, scheduled actions, projects,
funding requests with agreements, notifications, settings, and system administration.
Product, UI/UX, architecture, and security requirements live in `Specification/`.

## Stack

Next.js + React + TypeScript, Tailwind CSS, Neon PostgreSQL + Drizzle ORM, Better Auth (+ jose),
Zod + React Hook Form, Nodemailer (Google SMTP), Socket.IO, Serwist PWA, Upstash Redis rate
limiting, Font Awesome icons, Inter + IBM Plex Mono.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Configure environment:

   ```bash
   cp .env.example .env
   # Fill in DATABASE_URL, BETTER_AUTH_SECRET, SMTP_*, CRON_SECRET, etc.
   ```

3. Create the database schema and seed reference data (legal versions + plan catalog):

   ```bash
   npm run db:push
   npm run db:seed
   ```

   For an existing database, apply `db/migrations/0001_flexible_records.sql` and
   `db/migrations/0002_calls.sql` in order (both idempotent) or run
   `npm run db:push`. No existing data is altered.

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

- Graceful degradation: SMTP, Muse AI, Redis, object storage, and the realtime
  server are optional at runtime. Unconfigured integrations surface as explicit
  "pending" states — never fake success.
- Private data (auth, API, dashboard) is excluded from the service-worker cache.
- Financial balances derive only from approved ledger entries; AI-extracted
  values are proposals until a human verifies them.
- An administrator account is created by registering normally, then setting
  `role = 'admin'` on that user row before signing in.
