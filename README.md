# TIXCONNECKT — Production environment on Vercel

Add these in Vercel: project → Settings → Environment Variables → environment
**Production**, then redeploy. Keys starting with `NEXT_PUBLIC_` are baked into
the build, so any change to them needs a redeploy too. Never commit real values
to git.

## Required

| Key | Production value |
| --- | --- |
| `DATABASE_URL` | Neon **pooled** URL from the Neon console, e.g. `postgresql://<user>:<password>@<host>-pooler.<region>.aws.neon.tech/<db>?sslmode=require` |
| `AUTH_SECRET` | Random 64 hex chars: `openssl rand -hex 32` (minimum 32 chars) |
| `NEXT_PUBLIC_APP_URL` | `https://<your-domain>` with no trailing slash, e.g. `https://tixconneckt.com` (or your `https://<app>.vercel.app` URL) |

## Email (SMTP)

| Key | Production value |
| --- | --- |
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `465` |
| `SMTP_USER` | Gmail address used for sending |
| `SMTP_PASS` | Google app password (16 characters) |
| `SMTP_FROM` | `TIXCONNECKT <no-reply@tixconneckt.com>` |
| `MAIL_REPLY_TO` | Monitored inbox, e.g. `support@tixconneckt.com` (optional; without it, mail says do-not-reply) |

## File storage (Neon Object Storage, bucket `tixconneckt`)

| Key | Production value |
| --- | --- |
| `NEON_STORAGE_BUCKET` | `tixconneckt` |
| `AWS_REGION` | Neon storage region, e.g. `us-east-1` |
| `AWS_ENDPOINT_URL_S3` | Neon storage endpoint from the Neon console (`https://…`) |
| `AWS_ACCESS_KEY_ID` | Neon storage key with `storage:write` access |
| `AWS_SECRET_ACCESS_KEY` | Matching Neon storage secret |

Without these four AWS values, uploads and pictures are stored in Neon
PostgreSQL instead — the app keeps working.

## Realtime (chat, presence, call signaling)

Ably Pub/Sub is the only realtime infrastructure — no separate realtime
server to host. Browsers authenticate with short-lived tokens from
`GET /api/ably/token`, scoped to the user's own channels.

| Key | Production value |
| --- | --- |
| `ABLY_API_KEY` | Private Ably API key from the Ably dashboard (server-side only — never `NEXT_PUBLIC_`) |

Without it, chat keeps working on API polling and the UI says live
updates are unavailable.

## Calls (voice/video behind NAT)

| Key | Production value |
| --- | --- |
| `NEXT_PUBLIC_TURN_URLS` | TURN server URLs, comma-separated, e.g. `turn:turn.example.com:3478` |
| `TURN_USERNAME` | TURN username (server-side only, delivered per session via `GET /api/calls/ice`) |
| `TURN_PASSWORD` | TURN credential (server-side only) |
| `NEXT_PUBLIC_STUN_URLS` | Optional STUN list, e.g. `stun:stun.l.google.com:19302` |

## Security webhooks and cron

| Key | Production value |
| --- | --- |
| `CRON_SECRET` | Random 32+ chars (set in the Vercel dashboard, all environments). Vercel Cron sends it as `Authorization: Bearer <value>` automatically; the external scheduler below needs the same header configured manually |
| `TIXLPAY_WEBHOOK_SECRET` | Webhook secret from the TixLPay dashboard (only if payments are enabled) |

## Optional integrations

| Key | Production value |
| --- | --- |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST URL (rate limiting; without it the API runs fail-open) |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash REST token |
| `MUSE_SPARK_API_URL` / `MUSE_SPARK_API_KEY` | AI text endpoint + key (without them AI features show explicit pending states) |
| `MUSE_VOICE_API_URL` / `MUSE_VOICE_API_KEY` | AI voice endpoint + key (same fallback) |
| `MUSE_IMAGE_API_URL` / `MUSE_IMAGE_MODEL` | Optional image endpoint/model overrides. Image generation otherwise uses the Spark Model API base, shared `MUSE_SPARK_API_KEY`, and `muse-image-1.0` default |
| `DATABASE_URL_DIRECT` | Neon **direct** (non-pooled) URL, used for schema migrations |
| `DB_POOL_MAX` | `10` (default; one pool per serverless instance) |
| `DB_CONNECT_TIMEOUT_MS` | `10000` |
| `DB_IDLE_TIMEOUT_MS` | `30000` |
| `DB_STATEMENT_TIMEOUT_MS` | `30000` |
| `SKIP_AUTO_MIGRATE` | `1` only if you apply migrations yourself instead of the automatic boot migration |

`NODE_ENV=production` is set by Vercel automatically — do not add it.

## After the first deploy

1. Apply schema and seed data once, from any machine with the production
   `DATABASE_URL`: `npm run db:migrate && npm run db:seed`.
2. Trigger the action worker. `vercel.json` schedules a daily backstop run
   automatically (Hobby plans allow one Vercel cron run per day), but timely
   pre-action reminders need a tick every 1–5 minutes. On a free plan, add a
   free external scheduler (e.g. cron-job.org):
   - URL: `GET https://<your-domain>/api/cron/actions`
   - Schedule: every 1 minute (5 minutes also works with the 15-minute
     reminder window)
   - Header: `Authorization: Bearer <CRON_SECRET>`
   Without this, actions still execute on the daily backstop run, but
   reminders arrive late and same-day actions wait until 06:00 UTC. (On Pro,
   change the `vercel.json` schedule to `*/5 * * * *` and skip this step.)
   Verify with `curl -H "Authorization: Bearer $CRON_SECRET"
   https://<your-domain>/api/cron/actions` — the JSON includes
   `overduePending`, which stays `0` while the scheduler is healthy.
3. Create the admin account by registering normally, then setting
   `role = 'admin'` on that user row before signing in.
