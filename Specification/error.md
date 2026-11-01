GET /dashboard/chat/6b5e9bbe-34f2-4b89-a529-07114ae6ebf3 200 in 40s (next.js: 30.8s, proxy.ts: 8ms, generate-params: 8.8s, application-code: 587ms)
⨯ Error: Route "/dashboard/chat/[id]": Next.js encountered the unstable value `new Date()` while prerendering.

This value can change between renders, so it must be either prerendered or computed later.

Ways to fix this:
  - [dynamic] Render at request time by adding a dynamic data access (e.g. `await connection()`) before this call
  - [cache] Prerender and cache the value with `"use cache"`
  - [client] Render the value on the client with `"use client"`
  - [measure] If the value is for telemetry, use a timing API such as `performance.now()`

Learn more: https://nextjs.org/docs/messages/blocking-prerender-current-time
    at eval (lib/session.ts:56:70)
    at withDbRead (db/index.ts:158:20)
    at getSession (lib/session.ts:40:35)
    at async requireUser (lib/session.ts:84:19)
    at async ChatThreadContent (app/dashboard/chat/[id]/page.tsx:14:16)
    at ChatThreadRoute (app/dashboard/chat/[id]/page.tsx:9:57)
  54 |         .from(sessions)
  55 |         .innerJoin(users, eq(users.id, sessions.userId))
> 56 |         .where(and(eq(sessions.token, token), gt(sessions.expiresAt, new Date())))
     |                                                                      ^
  57 |         .limit(1),
  58 |     );
  59 |     if (!row) return null; {
  digest: '97250531'
}
Error: Route "/dashboard/chat/[id]": Next.js encountered the unstable value `new Date()` while prerendering.

This value can change between renders, so it must be either prerendered or computed later.

Ways to fix this:
  - [dynamic] Render at request time by adding a dynamic data access (e.g. `await connection()`) before this call
  - [cache] Prerender and cache the value with `"use cache"`
  - [client] Render the value on the client with `"use client"`
  - [measure] If the value is for telemetry, use a timing API such as `performance.now()`

Learn more: https://nextjs.org/docs/messages/blocking-prerender-current-time
    at eval (lib/session.ts:56:70)
    at withDbRead (db/index.ts:158:20)
    at getSession (lib/session.ts:40:35)
    at async requireUser (lib/session.ts:84:19)
    at async ChatThreadContent (app/dashboard/chat/[id]/page.tsx:14:16)
    at ChatThreadRoute (app/dashboard/chat/[id]/page.tsx:9:57)
  54 |         .from(sessions)
  55 |         .innerJoin(users, eq(users.id, sessions.userId))
> 56 |         .where(and(eq(sessions.token, token), gt(sessions.expiresAt, new Date())))
     |                                                                      ^
  57 |         .limit(1),
  58 |     );
  59 |     if (!row) return null; {
  digest: '97250531'
}
○ Compiling /api/chat/[id]/messages ...

## Error Type
Blocking Route

## Error Message
Route "/dashboard/chat/[id]": Next.js encountered the unstable value `new Date()` while prerendering.

This value can change between renders, so it must be either prerendered or computed later.

Ways to fix this:
  - [dynamic] Render at request time by adding a dynamic data access (e.g. `await connection()`) before this call
  - [cache] Prerender and cache the value with `"use cache"`
  - [client] Render the value on the client with `"use client"`
  - [measure] If the value is for telemetry, use a timing API such as `performance.now()`

Learn more: https://nextjs.org/docs/messages/blocking-prerender-current-time


    at eval (lib/session.ts:56:70)
    at withDbRead (db/index.ts:158:20)
    at getSession (lib/session.ts:40:35)
    at requireUser (lib/session.ts:84:19)
    at ChatThreadContent (app/dashboard/chat/[id]/page.tsx:14:16)
    at ChatThreadRoute (app/dashboard/chat/[id]/page.tsx:9:57)

## Code Frame
  54 |         .from(sessions)
  55 |         .innerJoin(users, eq(users.id, sessions.userId))
> 56 |         .where(and(eq(sessions.token, token), gt(sessions.expiresAt, new Date())))
     |                                                                      ^
  57 |         .limit(1),
  58 |     );
  59 |     if (!row) return null;

Next.js version: 16.4.3 (Turbopack)
