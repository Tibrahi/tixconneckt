GET /api/dashboard/counts 503 in 800ms (next.js: 4ms, application-code: 796ms)
[api:error:6e793ad4-87b8-4141-b504-4948358939dc] Dashboard data is temporarily unavailable. Please retry in a moment.
 GET /api/dashboard/counts 503 in 2.0s (next.js: 5ms, application-code: 2.0s)
[api:error:06c9818f-0205-48e9-b364-b84835b3aa1a] Dashboard data is temporarily unavailable. Please retry in a moment.
 GET /api/dashboard/counts 503 in 1106ms (next.js: 66ms, application-code: 1040ms)
[api:error:ba0bb23d-6255-46ce-a8cb-a1fd9afa1dc2] Dashboard data is temporarily unavailable. Please retry in a moment.
 GET /api/dashboard/counts 503 in 840ms (next.js: 8ms, application-code: 832ms)
[api:error:a0a413a3-b214-4931-88b3-0f25b62eda26] Dashboard data is temporarily unavailable. Please retry in a moment.
 GET /api/dashboard/counts 503 in 845ms (next.js: 13ms, application-code: 832ms)
[api:error:09048453-9b91-4259-a49a-a19de5f00123] Dashboard data is temporarily unavailable. Please retry in a moment.
 GET /api/dashboard/counts 503 in 882ms (next.js: 30ms, application-code: 853ms)
[api:error:38fae732-6ccc-4f85-930a-69211c433682] Dashboard data is temporarily unavailable. Please retry in a moment.
 GET /api/dashboard/counts 503 in 1008ms (next.js: 3ms, application-code: 1005ms)
[api:error:7b585d0b-780c-482d-b272-eaf0835030f9] Dashboard data is temporarily unavailable. Please retry in a moment.
 GET /api/dashboard/counts 503 in 821ms (next.js: 3ms, application-code: 819ms)
[api:error:ed9c17dd-b4cd-4208-a7ff-eb5710141a9c] Dashboard data is temporarily unavailable. Please retry in a moment.
 GET /api/dashboard/counts 503 in 927ms (next.js: 33ms, application-code: 894ms)
[api:error:f7b4988b-8bb3-4173-aeec-93cd73aa9c21] Dashboard data is temporarily unavailable. Please retry in a moment.
 GET /api/dashboard/counts 503 in 1052ms (next.js: 62ms, application-code: 991ms)

Some dashboard counts could not load. Please retry.  -> [api:error:dd015e42-5858-489a-8f16-59848567c626] Dashboard data is temporarily unavailable. Please retry ina moment.
 GET /api/dashboard/counts 503 in 1018ms (next.js: 45ms, application-code: 973ms)

## Error Type
Console Error

## Error Message
An error occurred while attempting to validate instant UI. This error may be preventing the validation from completing.


    at DashboardLayout (app/dashboard/layout.tsx:25:5)

## Code Frame
  23 | export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  24 |   return (
> 25 |     <Suspense fallback={<DashboardLoading />}>
     |     ^
  26 |       <AuthenticatedDashboard>{children}</AuthenticatedDashboard>
  27 |     </Suspense>
  28 |   );

Next.js version: 16.4.3 (Turbopack)

## Error Type
Console Error

## Error Message
Route "/dashboard/organizations": Could not validate `instant` because the target segment was prevented from rendering, likely due to the following error.

Next.js version: 16.4.3 (Turbopack)

## Error Type
Blocking Route

## Error Message
Route "/login": Next.js encountered the unstable value `new Date()` while prerendering.

This value can change between renders, so it must be either prerendered or computed later.

Ways to fix this:
  - [dynamic] Render at request time by adding a dynamic data access (e.g. `await connection()`) before this call
  - [cache] Prerender and cache the value with `"use cache"`
  - [client] Render the value on the client with `"use client"`
  - [measure] If the value is for telemetry, use a timing API such as `performance.now()`

Learn more: https://nextjs.org/docs/messages/blocking-prerender-current-time


    at getSession (lib/session.ts:31:13)
    at LoginPage (app/login/page.tsx:9:19)
    at LoginPage (<anonymous>:1:18)

## Code Frame
  29 |     const cookie = [sessionCookieName(), SESSION_COOKIE, ...LEGACY_SESSION_COOKIES]
  30 |       .map((name) => store.get(name)?.value)
> 31 |       .find(Boolean);
     |             ^
  32 |     if (!cookie) return null;
  33 |     const [token, suppliedSignature, ...extra] = cookie.split(".");
  34 |     if (!token || !suppliedSignature || extra.length > 0) return null;

Next.js version: 16.4.3 (Turbopack)

Service temporarily unavailable. Please try again shortly.

 GET /login 200 in 1543ms (next.js: 115ms, application-code: 1428ms)
 GET /manifest.webmanifest 200 in 18ms (next.js: 3ms, application-code: 15ms)
 GET /manifest.webmanifest 200 in 13ms (next.js: 2ms, application-code: 11ms)
Error: Route "/login": Next.js encountered the unstable value `new Date()` while prerendering.

This value can change between renders, so it must be either prerendered or computed later.

Ways to fix this:
  - [dynamic] Render at request time by adding a dynamic data access (e.g. `await connection()`) before this call
  - [cache] Prerender and cache the value with `"use cache"`
  - [client] Render the value on the client with `"use client"`
  - [measure] If the value is for telemetry, use a timing API such as `performance.now()`

Learn more: https://nextjs.org/docs/messages/blocking-prerender-current-time
    at getSession (lib/session.ts:53:68)
    at async LoginPage (app/login/page.tsx:9:19)
    at LoginPage (<anonymous>)
  51 | ...
  52 | ...serId))
> 53 | ...sessions.expiresAt, new Date())))
     |                        ^
  54 | ...
  55 | ...
  56 | ...
○ Compiling /api/auth/login ...
[api:error:c27c8b36-1484-400b-97f1-ca73ecfdf82c] Service temporarily unavailable. Please try again shortly.
 POST /api/auth/login 503 in 3.5s (next.js: 203ms, application-code: 3.3s)


## Error Type
Blocking Route

## Error Message
Route "/login": Next.js encountered the unstable value `new Date()` while prerendering.

This value can change between renders, so it must be either prerendered or computed later.

Ways to fix this:
  - [dynamic] Render at request time by adding a dynamic data access (e.g. `await connection()`) before this call
  - [cache] Prerender and cache the value with `"use cache"`
  - [client] Render the value on the client with `"use client"`
  - [measure] If the value is for telemetry, use a timing API such as `performance.now()`

Learn more: https://nextjs.org/docs/messages/blocking-prerender-current-time


    at getSession (lib/session.ts:31:13)
    at LoginPage (app/login/page.tsx:9:19)
    at LoginPage (<anonymous>:1:18)

## Code Frame
  29 |     const cookie = [sessionCookieName(), SESSION_COOKIE, ...LEGACY_SESSION_COOKIES]
  30 |       .map((name) => store.get(name)?.value)
> 31 |       .find(Boolean);
     |             ^
  32 |     if (!cookie) return null;
  33 |     const [token, suppliedSignature, ...extra] = cookie.split(".");
  34 |     if (!token || !suppliedSignature || extra.length > 0) return null;

Next.js version: 16.4.3 (Turbopack)


○ Compiling /api/projects ...
[api:error:d30eb68f-f2f1-4918-8f46-ee43116b3ed3] Sign in required.
 GET /api/projects?page=1&pageSize=12 401 in 998ms (next.js: 198ms, application-code: 800ms)
