# Admin Gate — Owner Access Guide

How the system owner reaches and manages the admin area (`/admin`).

## 1. Where the gate is

| Item | Value |
|---|---|
| Admin URL (local) | `http://localhost:3000/admin` |
| Admin URL (production) | `<NEXT_PUBLIC_APP_URL>/admin` |
| Admin sign-in | `/admin/login` |
| Owner setup (first admin only) | `/admin/register` |
| Standard login | `/login` |
| Standard registration | `/register` |
| Email verification | `/verify-email` |

Admin sections: `/admin` (Overview), `/admin/users`, `/admin/groups`,
`/admin/projects`, `/admin/requests`, `/admin/audit`, `/admin/settings`.
See the route map in [lib/routes.ts](/run/media/ibrahim/Cracker/tixconneckt/lib/routes.ts).

There is intentionally **no open "sign up as admin"**. Standard registration
only creates `user` or `provider` accounts
([app/api/auth/register/route.ts](/run/media/ibrahim/Cracker/tixconneckt/app/api/auth/register/route.ts)).
The first administrator is created through the one-time owner setup at
`/admin/register`, which stops working as soon as any admin exists; further
admins are promoted by an existing admin (section 5).

## 2. How the gate enforces access (3 layers)

1. **Cookie check** — [proxy.ts](/run/media/ibrahim/Cracker/tixconneckt/proxy.ts) matches
   `/admin/:path*` except the two public auth pages. No session cookie →
   redirect to `/login`.
2. **Page check** — [app/admin/(protected)/layout.tsx](/run/media/ibrahim/Cracker/tixconneckt/app/admin/(protected)/layout.tsx)
   calls `requireAdmin()` ([lib/session.ts](/run/media/ibrahim/Cracker/tixconneckt/lib/session.ts)):
   valid unexpired session + `status = 'active'` + `role = 'admin'`,
   otherwise redirect to `/dashboard` (or `/login` when signed out).
   `/admin/login` and `/admin/register` sit outside this layout (route group)
   so they stay reachable without a session.
3. **API check** — admin APIs call `requireCapability("admin.access")`
   ([lib/roles.ts](/run/media/ibrahim/Cracker/tixconneckt/lib/roles.ts)):
   signed-out → `401`, non-admin or deactivated → `403`.

So: an attacker needs your password **and** your email inbox (login OTP),
plus the `admin` value on your user row.

## 3. First-time owner setup (do once)

**Step 1 — Create the owner account at `/admin/register`.**

1. Start the app (`npm run dev`) and open `/admin/register`.
2. Fill in the form (same identity bar as registration) and submit.
3. Enter the 6-digit code from your inbox on the verification step.
   Your row is now `role = 'admin'`, `status = 'active'`.
4. You land on `/admin` automatically.

This page works only while **zero** administrators exist. Afterwards it shows
"Administration is already set up" and the API refuses with 403 — there is no
second way in through it. An already-registered email is never upgraded; its
owner is pointed at the admin sign-in instead.

**Fallback — Promote via the database.**

If owner setup is unavailable (e.g. SMTP down and you cannot receive the code),
register at `/register`, verify at `/verify-email`, then promote the row:

```bash
# Option A: SQL (works local + production with the right DATABASE_URL)
psql "$DATABASE_URL" -c \
  "UPDATE users SET role = 'admin', status = 'active', email_verified = true \
   WHERE email = 'owner@example.com';"

# Verify
psql "$DATABASE_URL" -c \
  "SELECT email, role, status, email_verified FROM users WHERE email = 'owner@example.com';"
```

```bash
# Option B: visual editor (local dev)
npm run db:studio
# → users table → find your email → set role = admin → save
```

Expected row: `role = 'admin'`, `status = 'active'`,
`email_verified = true`. Schema: [db/schema/auth.ts](/run/media/ibrahim/Cracker/tixconneckt/db/schema/auth.ts).

**Step 2 — Sign in at `/admin/login` (2 steps).**

1. Open `/admin/login`, enter owner email + password.
   (Step 1 only sends a login OTP — no session yet.
   See [app/api/auth/login/route.ts](/run/media/ibrahim/Cracker/tixconneckt/app/api/auth/login/route.ts).)
2. Enter the 6-digit login code from your inbox.
3. You land on `/admin` automatically. Non-admin accounts are stopped here
   with an explicit "Not an administrator" message.

**Step 3 — Confirm.**

- Sidebar shows an **Administration** section (Overview, Users, Groups,
  Projects, Requests, Audit log, Settings).
- `/admin` shows platform counts + recent audit events.

## 4. Daily access

1. Go to `/admin/login` (or `/login`) → email + password → login OTP →
   auto-redirect to `/admin`.
2. Already signed in? Open `/admin` directly, or use the sidebar's
   **Administration** section from any dashboard page.
3. Sign out via the sidebar **Log out** button (calls `POST /api/auth/logout`).

## 5. Managing other admins

- **Via UI:** `/admin/users` → search user → edit → set `role` to
  `admin` / `provider` / `user`, with a reason. Deactivation also lives here.
- **Via SQL:** same `UPDATE users SET role = ... WHERE email = ...` as above.
- **Demote yourself last:** keep at least one active admin; a demoted
  account is redirected to `/dashboard` on the next `/admin` visit.

## 6. Troubleshooting

| Symptom | Cause → Fix |
|---|---|
| `/admin` sends you to `/login` | No/expired session → sign in again at `/admin/login` (password + OTP). |
| `/admin` sends you to `/dashboard` | Signed in but `role != 'admin'` → get promoted by an admin (section 5), then refresh. |
| `/admin/login` says "Not an administrator" | Correct account, wrong gate → use Continue to dashboard, or sign out and use the owner email. |
| `/admin/register` says "already set up" | An admin exists → sign in at `/admin/login` instead. To replace a lost owner account, promote via SQL (section 3 fallback). |
| `/admin/register` says "temporarily unavailable" | Database unreachable → check `DATABASE_URL`/network; the form is hidden on purpose until the admin count is verifiable. |
| "Account is not activated yet" at login | Registration OTP never verified → open `/verify-email` and complete it (or set `status = 'active'` via SQL as owner). |
| No OTP email arrives | SMTP not configured → set `SMTP_USER` / `SMTP_PASS` in `.env`; API returns `emailPending: true` in that case. Check spam. |
| "Too many attempts" | Rate limit (10/hour register, 10/10min login) → wait and retry. |
| Admin API returns `401` / `403` | Session expired or role changed → sign in again; re-check `role`/`status` in DB. |
| `/admin/*` 404 in production | App not deployed/migrated → run `npm run db:push` (or `db:migrate`) + `npm run db:seed`, redeploy. |

## 7. Owner security notes

- `AUTH_SECRET` (32+ chars) signs sessions; `DATABASE_URL` owns the data.
  Never commit `.env` (already git-ignored) or paste these into chat/logs.
- Login always requires the email OTP second step — protect the owner inbox.
- Deactivated/deleted accounts (`status`) lose **all** access immediately,
  including admin — use this to revoke quickly.
- Sensitive actions are recorded; review them at `/admin/audit`.
