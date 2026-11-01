# TIXCONNECKT — Role-Aware Reliability and Product Redesign

## Delivery Brief

**Type:** Cross-cutting investigation and implementation specification  
**Priority:** Critical reliability issues first; role and product redesign follows verified data flows  
**Status:** Proposed; implementation must begin with the baseline and trace work below

## 1. Outcome

Restore the existing product workflows that are reported as failing, make data interpretation and persistence dependable, and deliver an experience that gives each account the pages and actions appropriate to its role. Improve the public home and authentication experience without exposing internal implementation details or replacing working business logic with mock behavior.

This specification covers Muse Spark, Muse Voice transcription, Muse Image, profile data and media, project/document parsing, Neon Object Storage reconciliation, calls and chat history, role-specific dashboards, payment readiness and pricing, the landing page, and authentication pages.

The requested scope is a product and reliability improvement, not permission to rewrite unrelated modules. Keep existing APIs and data compatible where possible; use migrations and explicit compatibility handling where a change is necessary.

## 2. Current Code Anchors

Use these as starting points during implementation; verify current behavior and callers before changing contracts.

- Application entry and public page: `app/page.tsx`, `components/site/LandingPage.tsx`
- Authentication pages: `app/login/`, `app/register/`, `app/forgot-password/`, `app/reset-password/`, `app/verify-email/`
- Dashboard boundary and navigation: `app/dashboard/layout.tsx`, `components/layout/DashboardShell.tsx`, `lib/routes.ts`
- AI facade, task definitions, and provider adapters: `lib/ai.ts`, `lib/ai-tasks.ts`, `lib/muse/`, `app/api/ai/`
- Profile interpretation and media: `app/api/profile/voice-assist/route.ts`, `app/api/profile/media/`, `components/profile/ProfilePhotos.tsx`, `db/schema/social.ts`, `lib/validation.ts`
- Calls and conversation persistence: `app/api/calls/route.ts`, `app/api/calls/[id]/`, `db/schema/chat.ts`, `components/chat/ThreadView.tsx`
- Document authorization and storage: `lib/document-access.ts`, `lib/storage.ts`, `lib/storage-config.ts`, `db/schema/`
- Provider project access: `lib/project-access.ts`, `app/api/projects/`, `db/schema/projects.ts`
- Wallet and payment integration: `lib/wallet.ts`, `lib/tixlpay.ts`, `app/api/wallet/withdrawals/`, `db/schema/wallet.ts`, `db/schema/plans.ts`
- Existing product specifications: `Specification/features.md`, `Specification/wallet.md`, `Specification/Project.md`, `Specification/chat.md`

The deployed schema and actual account/profile data are authoritative. For example, the current user role column defaults to `user`; do not assume that university, provider, or support are already first-class authorization roles. Discover the current account categories, profile attributes, permissions, and records before defining the final role matrix.

## 3. Delivery Principles

1. Reproduce each failure with a representative account, input, and record before changing code. Trace browser interaction → route/action → validation → AI/storage/provider → database write → rendered result.
2. Keep the original user input and source document. AI output is a proposal until it passes the canonical schema and the user or authorized workflow confirms it.
3. Use current field names and typed schemas. Do not write parsed content into a generic “interpreted” field when a matching canonical field exists.
4. Do not invent output, balances, calls, payments, capabilities, or AI success when a provider is unconfigured or a request fails. Show actionable pending/error states and safe retries.
5. Apply authorization on the server for every role-specific view and mutation. Hiding a navigation item is not access control.
6. Preserve user data. Storage inventory and migration must be read-only until reconciliation is reviewed; do not delete unlinked objects as part of an automated first pass.
7. Prefer small, reversible changes with focused tests and database migrations. Do not expose internal vendors, infrastructure, prompts, credentials, or implementation details on public pages.

## 4. Workstream A — Restore Muse and Data Flows

### A1. Establish failure evidence

For Muse Spark, Muse Voice, Muse Image, profile image upload/display, and document extraction, capture a working request and a failing request where possible. Record the route, task ID, content type, size, configured model/endpoint presence (never log secrets), response status, validation result, persisted identifier, and rendered result. Inspect browser/server logs and provider errors with sensitive data redacted.

Check each boundary independently: task registration and supported engine; runtime configuration; normalized endpoint; request payload and MIME/audio constraints; provider response parsing; Zod/schema validation; database or object-storage write; authorization; and client response handling. A timeout, missing configuration, invalid response, orphaned storage object, or UI state bug must be reported distinctly rather than collapsed into “AI failed.”

### A2. Canonical parsing and profile interpretation

- Establish a field map from the live profile form, `profileUpdateSchema`, database schema, AI task definition, and existing records. Preserve canonical names and types, including `educationLevel`, `objectives`, `major`, `skills`, `strengths`, `fields`, `bio`, and `location` where those remain the current contract.
- Transcribe audio with Muse Voice first, then pass the transcript and only the task-relevant current profile context to Muse Spark. Text input follows the same interpretation/validation path without audio conversion.
- Map aliases explicitly at the boundary when legacy/provider responses use another name. Reject unknown or ambiguous mappings for review; do not silently discard values or persist an AI-specific field name in place of the real field.
- Return a field-by-field proposal with source/transcript, confidence or uncertainty where available, and validation errors. The user can accept, edit, or reject each proposed change. Never overwrite existing profile data automatically.
- Keep the existing “nothing is persisted here” behavior of the voice-assist proposal route unless a separate, explicit save action is confirmed and authorized.
- Provide concise field-specific prompts and examples in the UI. Suggestions may update as input changes, but must be debounced, cancellable, and reviewable; no silent automatic saves.

### A3. Make Muse features dependable and contextual

- Define the feature contract and supported context for every Muse Spark, Muse Voice, and Muse Image action. Route each request to the correct task and current page/entity; do not use a generic task or schema for unrelated fields.
- Integrate Muse Image with the profile avatar/cover and any existing image-generation surface. Preview before save, validate generated bytes and type, persist through the existing private media path, and ensure the displayed URL resolves for an authorized viewer. A temporary generation URL must not become a permanent media reference.
- Ensure audio capture is converted to the format required by the transcription adapter and that size/duration failures are visible and actionable. Unconfigured services must remain explicitly unavailable rather than appear successful.
- Validate all Spark output against the destination schema before applying it. Preserve the input and provide retry without duplicate records or destructive replacement.
- Add end-to-end tests for success, disabled/misconfigured provider, malformed response, validation rejection, timeout/provider error, persistence failure, and retry.

### A4. Neon bucket and unlinked document investigation

- Inventory the configured `tixconneckt` Neon Object Storage bucket and compare object keys with database references, including `documents`, `profile_media`, and `group_media` records and any other storage-backed schema found during inspection.
- Separately identify valid database-byte fallback records, missing objects referenced by rows, objects with no discoverable row, duplicate references, and objects whose authorization metadata is incomplete. Do not assume every unlinked object is safe to remove; include age, ownership evidence, and module/key prefix when available.
- Trace whether document parsing receives the actual authorized bytes or only metadata/a storage key. Verify supported formats, document ownership, MIME sniffing, payload limits, and output-to-entity mapping.
- First deliver a read-only reconciliation report and a tested resolver for valid records. Any orphan cleanup, migration, or retention action requires an explicit reviewed policy, backup/recovery plan, and audit trail.
- Do not log document contents or private object URLs. Keep bucket access private and use existing document authorization checks.

## 5. Workstream B — Calls, Transcription, and Chat History

- Extend the existing one-to-one call lifecycle; do not imply that group video calls are supported unless that capability is separately implemented.
- Add a clear per-call transcription consent control. Transcription starts only after all participants receive clear notice and the consent policy is satisfied. Either participant can disable it; disabling stops further transcription and prevents transcript persistence for that call. Define whether already-saved transcript is retained or deleted according to the user's explicit privacy policy and communicate that choice.
- Do not store raw call audio/video as a side effect of transcription. Stream/process audio only as required by Muse Voice, minimize retention, and persist the transcript only when consent is active. Record consent state and changes with participant, timestamp, and call ID.
- Persist transcript segments and processing status against the call record (or a suitably related table), with speaker attribution only when reliable and disclosed. Handle partial transcript, provider outage, reconnect, duplicate segments, and call termination without corrupting history.
- In each direct conversation, provide a distinct Calls/Video history section separate from messages. Include missed, declined, failed, and ended calls; accepted calls are hidden/shown with a clear toggle. Show date, participants, call type, outcome, duration when known, and transcript details only to call participants authorized to view them.
- Keep messages and call history separately addressable in UI and API. Do not insert call events or transcripts as ordinary chat messages unless a deliberate, documented export action is added.
- Add privacy-focused tests for consent off/on, either participant opting out, unauthorized access, missed-call visibility, hidden accepted calls, transcript rendering, and deletion/retention behavior.

## 6. Workstream C — Role and Workflow-Specific Product Experience

### C1. Map roles before designing dashboards

Inspect registration, `users.role`, profile/account-type fields, organization/group membership, provider records, support workflows, route guards, database ownership, and current feature permissions. Produce an approved actor/action/resource matrix before changing dashboard routes. Distinguish authentication roles from account categories and capabilities; do not infer authorization from a display label.

At minimum, assess these product actors against the existing data and workflows: individual/member, university or education organization, funding/loan provider, support provider, group member/owner, and administrator. If an actor is not represented in data today, specify the minimum schema and onboarding changes needed before exposing that workflow.

### C2. Assign separate jobs and views

- Individual/member: profile, collaboration, project participation, requests, wallet/savings, and personal history according to current entitlements.
- University/education actor: institution-relevant discovery, project or student participation, and authorized collaboration/request workflows. Do not show provider-only funding controls unless explicitly assigned.
- Funding/loan provider: provider-owned project or offer creation where supported; review/respond only to eligible project requests; attach provider-authored supporting documents; track decisions and provider obligations. Provider responses must remain distinct from requester-authored project documents.
- Support provider: a separate queue and workflow for eligible support requests, with scoped documents and response actions; do not send this actor through the same page or steps as a general member or financial provider.
- Group owner/member: group approval, shared project/request visibility, and group wallet actions only where membership and approval rules permit.
- Administrator: existing administrative duties remain separately guarded and audited.

Make dashboards action-oriented: show tasks, records, and next actions that the current actor can actually perform. Route selection, empty states, counts, and navigation must use authorized persisted records, not hardcoded role assumptions or mock metrics. Where personal savings and provider-supplied funds use a related ledger, preserve distinct ownership, balance, approval, and transaction types.

### C3. Authorization and migration

- Centralize role/capability checks in server-side policy helpers and apply them to page data, API reads, writes, documents, and realtime events.
- Deny access by default for newly introduced capabilities; test both permitted and forbidden cases for every actor/resource pair.
- Migrate existing users deterministically. Preserve current access unless the approved matrix intentionally changes it; log or surface unresolved records rather than silently assigning elevated roles.
- Keep existing URLs working or redirect them deliberately. Ensure role changes, revoked membership, and disabled accounts take effect promptly.

## 7. Workstream D — Profile Identity and Payments

### D1. Profile improvements

- Repair profile avatar/cover upload, generated-image save, and display across owner and authorized viewer contexts. Verify content type, size limits, cache invalidation, private access, and object-storage/database fallback.
- Add an optional user-provided GitHub profile URL field. Validate it as a safe HTTPS GitHub profile URL, render it as a clearly labeled external link, apply the user's profile visibility rules, and do not fetch or scrape GitHub data as part of this field.
- Keep AI-proposed profile changes mapped to the canonical profile schema and subject to review as defined in Workstream A.

### D2. Pricing and payment readiness

- Make plan pricing and available payment methods explicit, with configuration by country/currency and provider capability. Assess card payments (Visa/Mastercard), supported cryptocurrency rails, and mobile-money/bank transfer methods such as MTN and Airtel only where a verified integration is available.
- Do not display a method as usable until its provider integration, settlement/callback verification, refund/failure states, and reconciliation are implemented and tested. Clearly distinguish pending, verified, failed, refunded, and unavailable states.
- Add a payment-method binding/readiness step before enabling or repairing TixlPay-dependent flows. Store only provider-issued token/reference and non-sensitive display metadata. Never collect or persist raw card numbers, CVV, private crypto keys, or mobile-money PINs.
- Keep subscription checkout distinct from wallet deposits, savings, provider disbursements, and withdrawals. Do not treat a selected or bound method as proof of payment; activate entitlements only after verified provider confirmation or an audited manual administrative decision.
- Make pricing display reflect current plan records and entitlements rather than hardcoded claims. Preserve a safe pending state when a provider is unavailable.

## 8. Workstream E — Public Landing and Authentication UX

### E1. Landing page

- Redesign the public home as a high-quality, enterprise-level product experience that immediately communicates the user problem TIXCONNECKT solves and the real actions available in the product.
- Use original/relevant high-quality visual assets and, where a 3D treatment is used, make it purposeful, performant, responsive, accessible, and representative of actual collaboration/project workflows. Do not use decorative 3D merely as visual filler.
- Keep claims consistent with shipped capabilities. Do not invent customer logos, metrics, testimonials, partner endorsements, or payment/AI availability. Represent the product, not its internal vendors, infrastructure, prompts, or manufacturing/implementation details.
- Preserve clear entry points to sign in and create an account; optimize image loading, reduced-motion behavior, keyboard navigation, and mobile layout.

### E2. Authentication pages

- Apply a consistent two-region layout to every authentication page: an informational visual/carousel region on the left and the requested form on the right. Use the same design language for login, registration, recovery, reset, and email verification while tailoring the form and contextual content to each task.
- On small screens, collapse to a usable single-column layout with the form immediately accessible. Do not let carousel motion block form interaction; support reduced motion, keyboard navigation, and screen readers.
- Preserve existing validation, OTP/security behavior, legal acceptance, server actions, redirects, and error states. This is a layout redesign, not an auth-flow rewrite.

## 9. Delivery Sequence and Gates

1. **Baseline and triage:** reproduce broken image, transcription, Spark, profile parsing, document parsing, and storage cases; document role/account model; capture relevant logs and current tests. Do not begin broad dashboard redesign before the actor/action matrix is agreed.
2. **Data and AI reliability:** repair canonical field mapping, provider/config/response handling, image persistence/display, document resolution, and safe retry behavior. Add focused unit and route tests.
3. **Storage reconciliation:** deliver read-only bucket/database inventory and resolve legitimate references. No deletion until separately approved.
4. **Call history and privacy:** implement transcript persistence, consent lifecycle, and conversation call-history UI/API with authorization and privacy tests.
5. **Role-specific workflows:** implement the approved actor/action matrix, migrations, route guards, data queries, and actor-specific dashboards. Verify all existing member and admin journeys remain valid.
6. **Payment readiness:** implement supported method binding and truthful pricing/payment states before enabling TixlPay-dependent operations.
7. **Experience redesign:** deliver the public landing page and shared responsive auth layout after behavior, availability claims, and page destinations are verified.
8. **Release verification:** run relevant Vitest tests, typecheck, lint, production build, and Playwright journeys. Test desktop/mobile, accessibility basics, permission denial, provider outage, and migration rollback/recovery. Record remaining unsupported integrations visibly.

## 10. Acceptance Criteria

- A representative profile voice input produces a transcript and a schema-valid proposal mapped to actual current profile fields; it does not save until reviewed and confirmed.
- Muse Spark, Muse Voice, and Muse Image each have verified configured and unconfigured/error states, with no fabricated success and actionable retry where safe.
- Profile media uploads and generated images persist and render for the owner and authorized viewers; unauthorized requests fail; cache updates show the latest image.
- Document parsing reads the correct authorized bytes and writes approved output to the intended entity. A read-only report classifies linked, fallback, missing, and unlinked bucket data without deleting anything.
- Call history is separate from messages, includes missed/declined/failed calls, supports hiding/showing accepted calls, and exposes a transcript only under the documented consent and access rules.
- The signed-in experience and API behavior are different where actor permissions/actions differ; university, provider, support, member, group, and admin experiences are backed by the approved matrix and real data.
- Provider project responses can include provider-authored supporting documents without overwriting requester-owned project documents.
- GitHub profile links are optional, validated, visibility-aware, and safely rendered as external links.
- Pricing lists only genuinely available payment methods; sensitive payment credentials are not stored; TixlPay-dependent actions remain safely unavailable until payment readiness and provider verification are satisfied.
- Landing and all auth pages render correctly at desktop and mobile sizes, preserve existing workflows, avoid unsupported claims, and meet keyboard/reduced-motion requirements.
- No data migration or storage cleanup loses user content; migrations have a documented rollback/recovery strategy; focused tests and required project checks pass.

## 11. Out of Scope Unless Separately Approved

- Deleting or rewriting unlinked Neon bucket objects before ownership reconciliation and backup.
- Recording or retaining raw audio/video from calls.
- Enabling unverified payment rails or claiming support for every card, crypto, MTN, or Airtel product in every country.
- Changing financial balances, accepting funding, approving provider requests, or saving AI data without the existing authorization and confirmation requirements.
- Replacing the current auth provider, database, object storage, realtime transport, or AI provider solely for visual or architectural preference.
- Broad unrelated refactoring, fabricated dashboard data, or breaking existing public APIs without a migration plan.