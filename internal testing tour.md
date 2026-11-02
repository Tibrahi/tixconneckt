# Internal Testing Tour — TIXCONNECKT

A guided, hands-on QA walkthrough for the project owner. It follows the same page inventory published in the [README System Tour](README.md#system-tour), but instead of describing pages it tells you **exactly what to click, what to expect, and how to cross-check the API and database** at every stop.

- Work top to bottom. Each stop builds on the previous one (accounts → connections → chat → projects → requests → money → admin).
- Record every result in the [Results Log](#results-log). Never mark PASS from reading code — only from doing the step.
- Nothing here modifies source code. Use test accounts and a non-production database.

## Contents

- [Ground rules](#ground-rules)
- [Stop 0 — Prep](#stop-0--prep)
- [Stop 1 — Landing, legal, and edge pages](#stop-1--landing-legal-and-edge-pages)
- [Stop 2 — Register, verify, login, recovery](#stop-2--register-verify-login-recovery)
- [Stop 3 — Dashboard shell, home, notifications, settings](#stop-3--dashboard-shell-home-notifications-settings)
- [Stop 4 — Profiles](#stop-4--profiles)
- [Stop 5 — Conneckt and matching (two accounts)](#stop-5--conneckt-and-matching-two-accounts)
- [Stop 6 — Chat and realtime](#stop-6--chat-and-realtime)
- [Stop 7 — Calls and transcripts](#stop-7--calls-and-transcripts)
- [Stop 8 — Project workspace](#stop-8--project-workspace)
- [Stop 9 — Groups and organizations](#stop-9--groups-and-organizations)
- [Stop 10 — Requests and support cases](#stop-10--requests-and-support-cases)
- [Stop 11 — Wallet, plans, payment methods](#stop-11--wallet-plans-payment-methods)
- [Stop 12 — Actions, AI tasks, and cron](#stop-12--actions-ai-tasks-and-cron)
- [Stop 13 — Admin tour](#stop-13--admin-tour)
- [Stop 14 — Cross-cutting checks](#stop-14--cross-cutting-checks)
- [Results log](#results-log)
- [Appendix A — Useful curl checks](#appendix-a--useful-curl-checks)
- [Appendix B — Useful SQL spot checks](#appendix-b--useful-sql-spot-checks)
- [Appendix C — Degraded-mode tests](#appendix-c--degraded-mode-tests)

## Ground rules

1. **Test accounts.** Create: Member A, Member B, one `loan` provider, one `support` provider, one admin. Never use real user data.
2. **Two browsers.** Use two browsers (or a private window) so Member A and Member B are signed in simultaneously for connection/chat/call flows.
3. **DevTools open.** Keep Console + Network visible. Any red console error or failed request is a finding — note the route and payload.
4. **Statuses.** `PASS` (did it, correct) · `FAIL` (did it, wrong — attach repro + screenshot) · `BLOCKED` (missing config/dependency — name it) · `NOT TESTED` · `NEEDS REVIEW` (can't tell correct without a business decision).
5. **Severities.** `Critical` (crash, data loss, security hole, core flow dead) · `High` (business function broken, wrong money math, authZ bypass) · `Medium` (broken interaction, wrong display, workflow gap) · `Low` (cosmetic) · `Info` (suggestion).
6. **Persistence rule.** After every create/update/delete: refresh the page, then navigate away and back. If the change disappears, that's a FAIL.
7. **Backend rule.** Every frontend denial (hidden button, redirect) must also be tested at the API level with curl — frontend-only enforcement is a `High` finding.

## Stop 0 — Prep

- [ ] 0.1 App boots: `npm run dev`, open `/`, and `GET /api/health` returns `ok:true` with `configured:true`. If `missing` lists keys, set them first (see README env table).
- [ ] 0.2 Database migrated + seeded: `npm run db:migrate && npm run db:seed`.
- [ ] 0.3 SMTP configured (OTP mails must arrive). Check spam folder once and note delivery time.
- [ ] 0.4 Decide which optional integrations are ON for this run (Ably, Muse Spark/Voice, object storage, TURN, Redis) and write them in the results log. Anything OFF becomes expected-fallback behavior, not a failure (see Appendix C).
- [ ] 0.5 Run automated suites once and paste the summary: `npm run test`, `npm run test:e2e`, `npm run lint`, `npm run typecheck`.

## Stop 1 — Landing, legal, and edge pages

| # | Do this | Expect |
|---|---|---|
| 1.1 | Open `/` signed out | Landing renders: headline "Turn skills and ideas into work that moves forward.", Sign in + Create-account links |
| 1.2 | Click Sign in → back → Create account | Land on `/login`, then `/register` |
| 1.3 | Open `/welcome` | Redirects to `/` (legacy alias, `app/welcome/page.tsx`) |
| 1.4 | Open `/legal/privacy`, `/legal/terms`, `/legal/agreement` | Each renders its versioned document; unknown type (e.g. `/legal/nope`) 404s |
| 1.5 | Open a nonsense route `/dashboard/nope-xyz` signed out | Redirect to `/login` (guard), no dashboard flash |
| 1.6 | Open a nonsense route signed in | Friendly 404 (`app/not-found.tsx`), nav still works |

Cross-check: `curl $APP/api/legal/privacy` returns the document JSON.

## Stop 2 — Register, verify, login, recovery

Do this for Member A first, then repeat registration for B + providers.

| # | Do this | Expect |
|---|---|---|
| 2.1 | `/register`: try submitting empty | Frontend blocks; backend `POST /api/auth/register` with `{}` returns 400, not 500 |
| 2.2 | Note the 3 legal checkboxes | Disabled until each document is opened/read |
| 2.3 | Fill valid data (individual), accept all, submit | Redirect to `/verify-email?email=…`; OTP mail arrives |
| 2.4 | Enter a wrong OTP, then resend, then the correct OTP | Wrong → clear error, no activation; resend → new mail; correct → account activates, lands on `/login` |
| 2.5 | Login with wrong password, then correct | Wrong → error, no session; correct → verification step → `/dashboard`, session cookie (`tixconneckt.session_token`, `HttpOnly`) set |
| 2.6 | Register a `provider` (kind `loan`) and one (kind `support`) | Accounts created with provider category; queues differ later (Stop 10) |
| 2.7 | `/forgot-password` → request → `/reset-password` + OTP → new password | Recovery mail arrives; reset works; old sessions revoked (other browser signed out) |
| 2.8 | Try duplicate email registration | Clean "already registered"-style error, no stack trace |

Cross-checks: `users` row exists with correct `role/category/providerKind`; `legal_consents` rows recorded; `sessions` row created on login; after 2.7, old `sessions` rows for that user are gone.

## Stop 3 — Dashboard shell, home, notifications, settings

| # | Do this | Expect |
|---|---|---|
| 3.1 | Land on `/dashboard` | `DashboardHome` renders; sidebar shows all 15 items; each links to a real page (click every one) |
| 3.2 | Watch badge counts (chat, notifications, conneckt) | Match `/api/dashboard/counts` response; update after actions in later stops |
| 3.3 | Trigger something notifiable (e.g. B sends A a connection request) | `/dashboard/notifications` lists it; mark-read works; unread filter + pagination behave |
| 3.4 | `/dashboard/settings`: read, update a preference, refresh | Change persists after refresh + navigate-away-and-back |
| 3.5 | Logout from the shell | Lands on `/login`; `/dashboard` direct URL now redirects; session row revoked |
| 3.6 | Paste a `/dashboard/*` URL while signed out, then sign in | Guard redirects to login first; app usable after login |

## Stop 4 — Profiles

| # | Do this | Expect |
|---|---|---|
| 4.1 | `/dashboard/profile`: fill objectives, skills, experience | Saves; validation errors are specific (try empty required fields, overlong text, whitespace-only) |
| 4.2 | Upload avatar + cover, then remove them | Images render (`/api/profile/media`); removal reverts cleanly |
| 4.3 | Open your public URL `/dashboard/profile/[shortId]` in the other browser (as B) | B sees the public view; private-only fields stay hidden |
| 4.4 | AI field extraction: paste free text, review suggestions | Suggestions appear (or explicit pending state if Spark OFF — never fake data); **nothing saves until you press save** |
| 4.5 | Voice assist (if Voice ON) | Recording → transcript → usable input; wrong-format audio gives actionable error |

Cross-check: `profiles` + `profile_media` rows match the UI; media bytes in object storage when configured, else in-DB fallback (Stop 14 / Appendix C).

## Stop 5 — Conneckt and matching (two accounts)

| # | Do this | Expect |
|---|---|---|
| 5.1 | As A: `/dashboard/conneckt` → discover B → send request | Request sent; appears in B's incoming |
| 5.2 | As B: accept; then check A's view | Both list each other as connected; conneckt badge counts update both sides |
| 5.3 | Decline/withdraw path with a third account or re-request | Clean state transitions, no duplicates after refresh |
| 5.4 | `/dashboard/matching` as A | Suggestions load; request an explanation → Spark rationale renders (or pending state if OFF) |
| 5.5 | Empty states | New account with no connections/matches sees helpful empty copy, not blank/errors |

Cross-check: `connections` rows and `match_results` match what both browsers show; `GET /api/connections?view=connected` agrees.

## Stop 6 — Chat and realtime

| # | Do this | Expect |
|---|---|---|
| 6.1 | As A: `/dashboard/chat` → new thread with B | Thread created and listed for both |
| 6.2 | Exchange messages both ways | Instant delivery (Ably ON) or polling delivery (Ably OFF + "live updates unavailable" notice); order correct after refresh |
| 6.3 | Edit, react, reply, forward a message; delete one | Each reflects for both users; deleted stays deleted after refresh |
| 6.4 | Attach a file; download it as the other user | Upload via `/api/documents`; download URL works; large/odd files fail gracefully |
| 6.5 | Typing indicator + presence + read/delivery receipts | B sees A typing; receipts update; `…/delivered` + `/presence` calls succeed |
| 6.6 | Search within thread + global `/api/chat/search` | Results match query; empty query handled |
| 6.7 | Thread settings change; per-message AI analyze; thread AI summarize | Settings persist; AI outputs render or show pending (Spark OFF); input preserved on failure |
| 6.8 | Pagination: scroll a long thread | Older messages load once each — no duplicates, no gaps |

Cross-check: `conversations`, `conversation_members`, `messages`, `message_reads`, `message_reactions` rows match the UI; unauthenticated `curl /api/chat` → 401; B can't fetch a thread they're not in → 403/404, not data.

## Stop 7 — Calls and transcripts

Requires two browsers; TURN configured for realistic NAT behavior.

| # | Do this | Expect |
|---|---|---|
| 7.1 | Start a call from a thread | Callee notified; `/api/calls/ice` returns server-side TURN credentials (never in page source) |
| 7.2 | Join, speak, hang up | Media flows; call history entry appears for both; hide works per user |
| 7.3 | As callee: look for the transcription switch | No toggle — status text only ("only the caller can turn it on"); PATCH via curl → 403 |
| 7.4 | As caller: turn transcription ON, both speak 60s+ | Segments auto-save per voice; history detail "What everyone said" shows C1/C2 dialogue with names, refreshing live |
| 7.5 | Click "Interpret conversation" (Voice + Spark ON) | Structured summary stored; re-open shows it instantly (from DB, not recomputed) |
| 7.6 | Caller turns switch OFF mid-call | Saving stops at once; saved dialogue retained; DELETE removes per policy |
| 7.7 | Voice OFF run | Explicit pending/unavailable state, no fabricated transcript |

Cross-check: `calls`, `call_participants`, `call_transcript_consents` (caller row), `call_transcripts` (speaker-tagged), `call_interpretations` rows match; consent API 403s non-callers.

## Stop 8 — Project workspace

| # | Do this | Expect |
|---|---|---|
| 8.1 | `/dashboard/projects` → create project → opens `/dashboard/projects/[id]` | Workspace loads; activity feed records creation |
| 8.2 | Create folders; create a TipTap doc; format text, table, link, image | All persist; image upload via `/api/projects/[id]/images` renders |
| 8.3 | Upload binary files; rename; move; delete one | File list + counts correct; deleted file gone after refresh |
| 8.4 | Edit a doc 3 times → version history → restore v1 | Versions listed; restore works; content matches v1 exactly |
| 8.5 | Export a doc (PDF + DOCX) | Downloads open correctly with content intact |
| 8.6 | Invite B as member; B edits; remove B | B sees project only while a member; removal revokes immediately (API too) |
| 8.7 | Create a share → open preview signed out (if public link) or as B | Share preview matches project; delete share revokes access |
| 8.8 | AI: file assist + project analysis + document extraction | Outputs validated + saved as records; Spark OFF → pending states; malformed-result handling (never raw crash) |
| 8.9 | Reactions, replies, conversations tab | All persist and count correctly |

Cross-check: `projects`, `project_members/folders/files/versions/shares/activity/replies/reactions`, `documents`, `flexible_records`, `ai_task_runs` (model id recorded); non-member `curl` on `/api/projects/[id]/workspace` → denied.

## Stop 9 — Groups and organizations

| # | Do this | Expect |
|---|---|---|
| 9.1 | Create a group → invite B → B joins (approval flow if set) | Membership + approvals recorded; `/api/groups/[id]/join` + `/members` agree with UI |
| 9.2 | Group media (avatar/cover), group conversation link | Media renders; linked chat thread opens for members |
| 9.3 | Group wallet action (authorized member) | Balance/ledger updates; unauthorized member blocked at API level |
| 9.4 | Create an organization (university) → add members → request verification | Statuses progress; verification endpoints enforce capability |
| 9.5 | Access-request flow from a third account | Approve/deny works; denied account sees nothing private |

Cross-check: `groups`, `group_members`, `group_approvals`, `group_media`, `organizations`, `organization_members`, `organization_access_requests`, `organization_verifications`.

## Stop 10 — Requests and support cases

| # | Do this | Expect |
|---|---|---|
| 10.1 | As A: `/dashboard/requests` → create funding request on your project, attach files | Listed; detail page shows files + conversation entry |
| 10.2 | As loan provider: queue shows A's request; respond; decide | Response + decision persist; A sees them; `support` provider does NOT see loan queue (and vice versa) |
| 10.3 | Request conversation thread | Messages flow like chat; files downloadable by parties only |
| 10.4 | `/dashboard/support`: create non-financial case → add docs → update status → remove a doc | Events timeline records each step; removal confirmed after refresh |
| 10.5 | Provider links: link/unlink, `?pageSize=1` group-link badges in Conneckt | Counts and badges consistent |

Cross-check: `funding_requests`, `provider_links`, `support_requests` + `_events` + `_documents`; provider A cannot respond outside their kind (`provider.loan.respond` vs `provider.support.respond`) — test with curl.

## Stop 11 — Wallet, plans, payment methods

Money checks demand exact numbers — write expected vs actual for every amount.

| # | Do this | Expect |
|---|---|---|
| 11.1 | `/dashboard/wallet`: note opening balances (individual scope) | Match `GET /api/wallet?scope=individual` + ledger sum to the cent |
| 11.2 | Self-fund with proof document | Pending/intake state; proof stored; ledger entry correct |
| 11.3 | Create savings goal; contribute; check progress math | `progress = contributed / target × 100`; test 0 target handling, overfunding display |
| 11.4 | Request withdrawal; reconcile; (if TixLPay configured) callback | Statuses progress; amounts immutable once confirmed; reconcile matches callback |
| 11.5 | Review queue (authorized reviewer): approve + reject paths | Queue updates; requester notified; unauthorized approve via curl → denied |
| 11.6 | `/dashboard/plans`: view plans, subscribe/change; payment methods add/edit/delete | Entitlements update (`lib/entitlements.ts` behavior); methods CRUD persists |
| 11.7 | Currency/date formatting across wallet | Consistent `lib/currency.ts` formatting; timezone-correct timestamps |

Cross-check: `wallets`, `ledger_entries` (sum = balance), `withdrawals`, `savings_goals`, `payment_methods`, `plans`, `subscriptions`. Any 1-cent mismatch is `High`.

## Stop 12 — Actions, AI tasks, and cron

| # | Do this | Expect |
|---|---|---|
| 12.1 | `/dashboard/actions`: submit "Remind me to call Ada tomorrow at 9am" | Spark interpretation renders as a **reviewable draft** (or pending if OFF) |
| 12.2 | Edit the draft, confirm | `scheduled_actions` row created with correct schedule/timezone |
| 12.3 | Trigger the worker: `curl -H "Authorization: Bearer $CRON_SECRET" $APP/api/cron/actions` | Action executes; `action_attempts` logged; notification appears; `overduePending: 0` |
| 12.4 | Wrong/missing cron secret | 401; no execution |
| 12.5 | `GET /api/ai/tasks` → run each supported task via `AiTaskRunner` | `project_analysis`, `match_explain`, `parse_document`, `interpret_action`, `profile_interpret`, `summarize_conversation`, `summarize_decisions`, `extract_action_items`, `transcribe` all work or pend explicitly |
| 12.6 | Voice tasks `summarize_audio` / `extract_audio` | Clean 501 + "transcription only" message (documented unsupported, not a bug) |
| 12.7 | AI abuse/edge: empty values, oversized doc, 21st rapid request | 400s with clear messages; rate limit (20/10min) triggers 429, not a crash |
| 12.8 | Check `ai_task_runs` + saved flexible record | Every run records model id; UI renders the saved record shape |

## Stop 13 — Admin tour

Sign in as admin (register → set `role='admin'` → sign in).

| # | Do this | Expect |
|---|---|---|
| 13.1 | `/admin` overview | Aggregates match spot counts (users, requests, projects, payments) |
| 13.2 | `/admin/users`: search, paginate, change role/status | Changes persist; deactivated user loses access immediately |
| 13.3 | `/admin/groups`, `/admin/projects`, `/admin/requests` moderation queues | Items list; approve/reject (PATCH) works and reflects on member side |
| 13.4 | `/admin/audit` | Your admin actions from 13.2–13.3 appear in `audit_logs`/`security_events` |
| 13.5 | `/admin/settings` + payments + storage reconciliation | Payment states editable per policy; reconciliation GET shows object-store vs in-DB placement |
| 13.6 | As Member A: visit `/admin` and curl `/api/admin/overview` | Both denied — frontend redirect AND backend 403 |

## Stop 14 — Cross-cutting checks

| # | Area | Do this | Expect |
|---|---|---|---|
| 14.1 | AuthZ sweep | For 5 member-only APIs, curl signed out + as wrong user | 401/403 everywhere; no data leaks |
| 14.2 | Session expiry | Delete/shorten session, reload dashboard | Clean redirect to login, no half-rendered private data |
| 14.3 | Responsive | Each dashboard at 390px, 768px, 1440px | Nav collapses sensibly; tables scroll, don't break; modals fit; no clipped actions |
| 14.4 | Offline/PWA | Load app, go offline, visit `/offline`, reload a page | SW serves fallback; understandable messaging; online recovery clean |
| 14.5 | Error handling | Kill DB briefly / bad SMTP / provider down (staging only) | User-friendly errors; no stack traces or secrets in responses |
| 14.6 | Data accuracy | Pick 5 numbers (balances, counts, progress %, badges) | Each traced to source field + formula in the log; all match |
| 14.7 | Empty states | Fresh account through every page | Helpful empty copy everywhere; no NaN/undefined/crashes |
| 14.8 | Full workflow | Run README workflow 1→9 end to end in one sitting | Every transition from the relationship matrix holds |

## Results log

Copy this per stop. File defects with: stop #, steps, expected vs actual, severity, screenshot/network capture, API/DB evidence.

```md
### Run: YYYY-MM-DD · tester: <name> · commit: <sha>
Integrations ON: Ably? Muse Spark? Muse Voice? Object storage? TURN? Redis? TixLPay?
Automated: test __/__ · e2e __/__ · lint OK/FAIL · typecheck OK/FAIL

| Stop | Check | Status | Severity | Notes / evidence |
|---|---|---|---|---|
| 0 | 0.1 boot+health |  |  |  |
| 1 | 1.1 landing |  |  |  |
... (one row per check)

Counts: PASS __ · FAIL __ · BLOCKED __ · NOT TESTED __ · NEEDS REVIEW __
Critical __ · High __ · Medium __ · Low __ · Info __
```

Final report checklist (per the tour spec): totals above + data-accuracy findings + cross-page findings + security findings + responsive findings + AI findings + recommended fixes, with automated vs manual clearly separated.

## Appendix A — Useful curl checks

```bash
APP=http://localhost:3000
curl -s $APP/api/health                       # liveness + missing keys
curl -s $APP/api/chat                         # expect 401 signed out
curl -s -b cookies.txt $APP/api/dashboard/counts
curl -s -H "Authorization: Bearer $CRON_SECRET" $APP/api/cron/actions
curl -s $APP/api/ai/tasks -b cookies.txt      # task catalog
curl -s -X POST $APP/api/auth/register -H 'Content-Type: application/json' -d '{}'  # expect 400
```

Save session cookies with `curl -c cookies.txt` on login for authenticated checks.

## Appendix B — Useful SQL spot checks

Read-only queries (`SELECT`) against your test database:

```sql
-- accounts & roles
SELECT id, email, role, category, providerKind, status FROM users ORDER BY createdAt DESC LIMIT 10;
-- consents & sessions
SELECT userId, type FROM legal_consents LIMIT 5;
SELECT userId, expiresAt FROM sessions WHERE userId = '<id>';
-- connections & chat
SELECT * FROM connections WHERE fromUserId = '<a>' OR toUserId = '<a>';
SELECT id, conversationId, senderId, left(body,60) FROM messages ORDER BY createdAt DESC LIMIT 5;
-- wallet math (must equal UI balance)
SELECT accountId, SUM(amount) FROM ledger_entries GROUP BY accountId;
SELECT id, status, amount FROM withdrawals ORDER BY createdAt DESC LIMIT 5;
-- actions & AI provenance
SELECT id, status, runAt FROM scheduled_actions ORDER BY runAt DESC LIMIT 5;
SELECT taskId, model, status FROM ai_task_runs ORDER BY createdAt DESC LIMIT 10;
-- audit trail
SELECT action, actorId, createdAt FROM audit_logs ORDER BY createdAt DESC LIMIT 10;
```

Adjust column names to the Drizzle schema if a query fails — note corrections in the log.

## Appendix C — Degraded-mode tests

Run once with each integration OFF (restart after env change):

| Integration OFF | Expect (not a bug) |
|---|---|
| `ABLY_API_KEY` unset | Chat works via polling; UI says live updates unavailable |
| `MUSE_SPARK_*` unset | All Spark features show pending states; inputs preserved; nothing fabricated |
| `MUSE_VOICE_*` unset | Voice/transcription features show pending states |
| `AWS_*` storage unset | Uploads succeed via PostgreSQL fallback (slower, DB grows) |
| `UPSTASH_*` unset | API runs fail-open per project docs |
| `TURN_*` unset | Calls may fail behind NAT; direct/LAN calls can still work |
| No cron tick | Actions execute on daily backstop only; `overduePending` rises |

---

*Companion to the [README System Tour](README.md#system-tour). Stops, routes, endpoints, and tables verified against this repository; results are yours to fill in.*
