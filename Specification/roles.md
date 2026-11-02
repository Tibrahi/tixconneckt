# Roles, Onboarding, and Individual Support Workflow

## 1. Purpose

Define how individuals, groups, universities, government organizations, and funding/support providers should join TIXCONNECKT, work with one another, and see role-appropriate dashboards. The design builds on the current authentication, groups, projects, provider links, requests, chat, notifications, and organization verification flows. It is a product and data-model proposal, not a claim that every workflow below is already implemented.

The outcome should be that an individual or group can raise a clearly scoped need, find the right partner, communicate without exposing unrelated private data, and track the help through a decision or resolution.

## 2. Current System Findings

- Registration is in `components/auth/RegisterForm.tsx`; it asks for name, email, password, country, phone, and an account category. The choices are `individual`, `university`, `government`, and `provider`.
- `lib/validation.ts` validates the category, but registration has no conditional institution details and no `providerKind` field.
- `app/api/auth/register/route.ts` persists the category. It creates `role="provider"` only for `category="provider"`; individuals, universities, and government accounts all have `role="user"`. The provider's `providerKind` is left null.
- `db/schema/auth.ts` keeps category, authorization role, and provider kind as separate user fields. `lib/roles.ts` uses role for capability checks, category for education/government dashboard presentation, and provider kind for loan/support capability gates. Administrators are assigned separately.
- `providerKind` can currently be set later through the profile update path. Provider onboarding should capture it, and any later change should be audited and governed; a public-facing category or editable label must not grant capabilities.
- Organizations already have public/private profiles, an owner, a verification status, and verification evidence/review history (`organizations`, `organizationVerifications` in `db/schema/projects.ts`). There is no organization-member table: each profile is effectively controlled by one user.
- Groups already have owners and `groupMembers` with per-group `admin`/`member` roles. `groupApprovals` handles selected group decisions; groups are contexts that an individual belongs to, not separate login accounts.
- Projects support user ownership, optional group association, project collaborators, scoped provider document shares, project activity, and version history. Institution/government projects are currently owned by the creating user or a group, not by an organization entity.
- `providerLinks` connects providers to individuals or groups. Group provider connections can require group approval before the provider decides. `fundingRequests` and agreements support project-linked funding work, and project requests create a request-specific conversation.
- Chat membership, notifications, delivery records, and Ably events already provide communication primitives. The request queue and provider response workflow are provider-focused; there is not yet a university/government support-case queue or organization-scoped chat membership.
- Dashboards already branch for individuals, universities, government, and providers. The data comes from `/api/dashboard/summary`; counts should remain query-backed. The current university/government pages are mostly project, group, organization-profile, and funding-request views.

### Main gaps to close

1. Provider kind is not collected at signup, leaving new providers with an unspecified service kind.
2. An institution/agency profile is separate from the account category, but no staff membership or shared organization ownership exists.
3. Category-specific onboarding does not collect the fields needed to identify an institution, agency, or provider and begin verification.
4. Financial requests are modeled, but non-financial support and institution/government assistance do not have a dedicated case lifecycle.
5. Group membership and project ownership exist, but org-wide access to projects and case work does not.

## 3. Role and Context Model

Keep these concepts distinct. A person authenticates as a user; a group or organization is the context in which that person is acting.

| Concept                 | Meaning                                                                                            | Authority source                                                             |
| ----------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Authentication role     | `user`, `provider`, or `admin`; security gate for broad capabilities                               | Server-owned `users.role` and role policy                                    |
| Account category        | `individual`, `university`, `government`, or `provider`; onboarding and default dashboard identity | `users.category`, validated and not trusted from a client after registration |
| Provider service        | Currently `loan` or `support`; determines the provider queue and response permissions              | Provider profile / `users.providerKind` plus verified policy                 |
| Organization membership | A person's assignment and permissions inside an institution, agency, or provider organization      | Active membership row and organization verification state                    |
| Group membership        | A person's role in one particular group                                                            | Active `groupMembers` row; group `admin` is not a global role                |
| Resource relationship   | Ownership, project membership, request assignment, conversation membership, or explicit share      | Checked by the owning API on every read and write                            |

An individual can belong to multiple groups and can collaborate with an organization without changing their personal account category. A university or government employee is still an individual user with an organization membership. Do not create a shared organization password or a login account representing a group.

For the first release, require a provider to select exactly one service kind: **Funding / lending** (`loan`) or **Non-financial support** (`support`). The existing model is singular. Offer “both” only after adding a provider-services relation and enforcing the correct queue and permissions per service.

## 4. Registration and Onboarding Inputs

Keep the common authentication form and legal acceptance. Make the category selector a clear first step; after selection, show only the additional fields for that path. The selected values must survive validation errors and be submitted to the server, not inferred from a label or email domain. Email OTP still activates the account; institutional/provider verification is a separate process and must not be implied by OTP.

### Individual

- Keep the current name, email, password, country, phone, timezone, and legal acceptance fields.
- Add a short onboarding step after account creation for objectives, fields/interests, skills, education level, location, and whether the user is starting alone or joining/creating a group. These map to existing profile and group workflows; do not make a group mandatory.
- Show a privacy choice for profile/contact discovery and explain that group membership does not make private profile or financial data visible to other members.

### University

- Ask for institution name, institution type, country, website, department/faculty, the registrant's job title or relationship to the institution, and an official contact email where available.
- Offer “Create a new institution profile” or “Request access to an existing institution.” Do not create duplicate institution records merely because another staff member registers.
- Let the user save a draft institution profile and submit verification evidence after email activation. Display `unverified`/`pending` state clearly; only verified organizations receive capabilities that rely on institutional authority.
- Avoid requiring a public email domain as proof: domains vary and can be shared. Use evidence review and optional domain checks as signals, not authorization by themselves.

### Government organization

- Ask for agency/ministry/department name, level or jurisdiction, mandate/program area, country, website, registrant's title, and an official contact email where available.
- Use the same create-or-request-access path and evidence-based verification as a university. Do not expose citizen/student records or program queues merely because the user chose “Government.”
- Keep official program identity separate from the employee's personal profile and personal/group projects.

### Funding / support provider

- Ask whether the account provides **Funding / lending** or **Non-financial support**. Persist this as `providerKind` when creating the provider account.
- Ask for provider/organization name, service description, country/coverage, website, contact role, and service areas. Let the account create or request membership in a provider organization.
- Provide a verification step for provider identity and explain that verification is distinct from payment readiness, lending authority, or approval of any individual request.
- Do not ask for raw card/bank credentials, sensitive personal financial data, or sensitive borrower information at signup.

### Authentication behavior and validation

- Login remains email/password/OTP behavior and does not ask users to select a role. The server derives the session actor from persisted, verified account data.
- Extend `registerSchema` with a discriminated category-specific payload. Reject provider registrations without a valid service kind; reject irrelevant fields or ignore them explicitly rather than persisting arbitrary input.
- Create the account, profile, and provider kind in one transaction. Create organization draft/membership only after verifying ownership rules; keep OTP activation and organization verification as separate states.
- A user may update ordinary profile details, but must not be able to promote their auth role, change category to gain a dashboard, add services, or bypass organization review through a profile PATCH.
- Preserve existing account URLs and OTP behavior. Existing accounts with null provider kind need a deliberate completion flow; do not silently infer “loan” or “support.”

## 5. How the Parties Help an Individual or Group

Treat the individual or group's project and stated need as the center of the workflow. The university, government agency, and provider are possible helpers with different eligibility, decision, and follow-through responsibilities; they are not automatically entitled to the requester's profile or documents.

1. **Describe the need.** An individual starts a project or a group starts a group-owned project. They state the objective, location/field, current stage, desired outcome, type of help, timeline, and what information/documents can be shared. Existing profile matching and project workspace fields can prefill this, with user review.
2. **Choose the requester context.** The requester chooses “Me” or one of their active groups. Group requests require the existing group-admin/approval rules. The same person can act personally in one request and for a group in another.
3. **Route by service and eligibility.** Funding/lending requests go to eligible providers; non-financial support requests go to support providers; university and government programs are surfaced only when their verified organization has a matching program or an explicitly accepted referral. A category match alone is not eligibility.
4. **Request consent and share minimally.** The requester previews the recipient, documents, profile fields, and visibility before submission. Providers and institutions see only request details and explicitly shared documents, not a full private profile, personal wallet, unrelated group data, or every project document.
5. **Triage and communicate.** Each recipient receives a private queue item and a request-bound conversation. The recipient can ask for more information, accept/decline, assign an authorized staff member, or make a consented referral to another party. Referral does not silently copy attachments or open private records.
6. **Resolve and follow up.** The request tracks milestones, owner, due dates, decisions, offers/agreements when applicable, and a resolution note. The requester can withdraw, revoke future document access, and see who accessed or changed the case. A completed case can prompt an optional follow-up without claiming a transfer, grant, or service occurred until it is recorded.

### Distinct contribution of each party

- **University:** research guidance, academic collaborators, labs/facilities, mentorship, student or faculty programs, and institution-led project support. Staff see only projects/cases assigned to their organization and team.
- **Government:** published programs, eligibility guidance, public-service referrals, permits or coordination workflows, and agency decisions. Program access is jurisdiction- and assignment-scoped; no broad citizen-database browsing.
- **Funding / lending provider:** review an explicitly submitted financial request, ask for permitted evidence, provide a documented offer/agreement, and record a verified decision/funding outcome. The existing financial workflow remains separate from non-financial help.
- **Support provider:** triage a non-financial need, offer relevant expertise/resources/training/mentorship, schedule or record agreed work, and close with an outcome. Do not route this actor through loan agreement or funding controls.
- **Individual or group:** owns the need, decides what to share, chooses whether to accept a referral/offer, and retains access to the request timeline and communications. For a group, group membership and approvals govern shared actions.

## 6. Dashboard Requirements

Dashboards should surface assigned work and next actions, not merely role labels. Keep current responsive dashboard shell and route map. Query each count from authorized records; zero is a meaningful empty state. A group is a selectable working context layered on the user's dashboard, not a new account category.

### Individual dashboard

- Profile completeness and suggested next steps, matching opportunities, connection invitations, unread conversations/notifications, and scheduled actions.
- “My work” with recent projects, milestones, and help requests by status, next action, recipient, and last update.
- A clear personal/group context switch. In group context show only the selected group's projects, requests, approvals, conversations, and wallet summary the member may access.
- Quick actions: create/update project, find collaborators, ask for funding, ask for non-financial support, create/join a group, and review a referral or offer.
- Personal wallet and financial history remain private and separate from any group balance or group decision.

### Group dashboard/context

- Shared project progress, member/contributor list, unread group/request conversations, pending join/provider/request approvals, request status, shared documents, and due tasks.
- Group admins can invite/remove members, coordinate scoped requests, and manage eligible group actions. Members can contribute, follow progress, and raise a proposal without receiving admin-only controls.
- Show group-wallet balances or transactions only to members authorized by current wallet rules; require the correct approvals for withdrawals and other consequential actions.
- Provide one activity timeline for accountable group decisions without copying private individual messages into group chat.

### University dashboard

- Organization verification and profile state; institution-owned portfolio once organization ownership is supported; active research/campus projects; research groups; collaborators; and assigned support/program cases.
- Work queue for cases assigned to the institution or its staff, eligibility/program milestones, unanswered questions, upcoming commitments, and recent case decisions.
- Discovery of potential collaborators and projects using permitted profile/project fields. Do not show personal financial details or private project documents by default.
- Organization team management, role/permission review, and auditable staff assignment after organization memberships are implemented.

### Government dashboard

- Verification state, program portfolio, eligible incoming applications/support cases, assigned cases, deadlines, referrals, and recorded outcome counts.
- Filters for program, jurisdiction, status, and assigned officer; eligibility requirements visible before a person applies.
- Case-based collaboration with an individual/group and scoped agency staff. Avoid broad identity search or cross-program data access absent a separately authorized purpose.
- Public program information can be visible without login; case details, decisions, and documents remain private to assigned participants.

### Provider dashboard

- Keep separate **Funding / lending** and **Non-financial support** queues. Show pending connections separately from assigned requests, with status, age, eligibility, next action, and deadline.
- Funding providers: requested amount/currency, project summary, explicitly shared files, due diligence checklist, offer/agreement state, and verified outcome. Do not imply funds are paid from an approval alone.
- Support providers: service category, requested outcome, priority, location/coverage fit, assigned specialist, milestones, and follow-up date. No loan-only fields or controls.
- Organization profile/verification, staff assignment, response history, and request-bound conversations. Never expose a provider's private internal notes to the requester unless intentionally shared.

## 7. Communication and Decision Rules

- Reuse `conversations`, `conversationMembers`, messages, read state, notifications, delivery tracking, and Ably for real-time updates. Create conversations only after a valid request, accepted connection, or explicit invitation establishes participants.
- Keep each financial or support case as the durable communication boundary. Participants should be the requester (or approved group representatives), assigned organization/provider staff, and explicitly invited collaborators. Enforce membership on every message, realtime subscription, file URL, and history read.
- Use request-specific system events for submitted, assigned, information requested, referred, decided, and resolved transitions. Avoid making a chat message the authoritative record of a decision.
- Notify the requester and assigned staff in-app; use email only under current notification/security policy. Realtime events are signals to refresh authorized data, not permission to read it.
- For a group request, follow `groupApprovals` and group admin membership rules before external submission. Notify the group through its authorized context; do not broadcast personal request details to every group member without the group's consent policy.
- Referrals are explicit, auditable transitions. The requester sees the proposed recipient and data scope and accepts before the new organization/provider is added. Revoke or expire prior document shares when the case closes or its access window ends.
- Record who changed case status/assignment and when. A user-friendly conversation must not replace a durable decision, agreement, or financial ledger entry.

## 8. Database Changes

Reuse existing tables where their semantics fit; do not create dashboard-stat tables. Keep database changes additive first and maintain current request URLs/contracts while migrating.

### Reuse now

- `users.category`, `users.role`, and `users.providerKind` for account identity, security role, and the current single provider kind.
- `organizations` and `organizationVerifications` for organization profiles and their evidence/review lifecycle.
- `groups`, `groupMembers`, and `groupApprovals` for group membership and group decisions.
- `projects`, `projectMembers`, `projectShares`, and `projectActivity` for project ownership/collaboration, scoped provider files, and audit history.
- `providerLinks`, `fundingRequests`, and `agreements` for existing provider connections and financial requests.
- `conversations`, `conversationMembers`, `messages`, `notifications`, and `notificationDeliveries` for authorized communications and delivery state.

### Add or extend for organization and support workflows

1. **`organization_members` (required for shared organization accounts):** `id`, `organization_id` FK, `user_id` FK, `role` (owner/admin/staff or narrowly defined equivalents), `status` (invited/pending/active/revoked), inviter/decision fields, timestamps, unique `(organization_id, user_id)`, and indexes by user/status and organization/status. Only active members may act for an organization; server policy checks membership and role per action. Keep the existing `organizations.owner_id` as initial owner during migration.
2. **Organization classification:** add a constrained `kind` such as `university`, `government`, or `provider` (or convert the existing free-text category only after data review). Keep institution type, agency area, and provider service areas as descriptive fields, not authorization. Reuse existing verification status/history; do not add a competing verification flag without a migration plan.
3. **Organization-owned projects (required before true shared portfolios):** add nullable `organization_id` to projects and define an explicit ownership invariant across user, group, and organization. Migrate existing rows unchanged. Update project access, request ownership, document sharing, and dashboard queries before allowing organization members to create organization-owned work. Until then, label current institution/government projects as user-owned workspaces rather than implying shared legal ownership.
4. **`support_requests` (required for non-financial cases):** add a separate case table rather than overloading `fundingRequests`. Suggested fields: `id`, `project_id`, requester identity with a database-enforceable individual-or-group representation, `target_organization_id` and/or `target_provider_id`, service category, summary/details, status, priority, assigned user, consent/access scope, created/updated/resolved timestamps. Prefer nullable FK columns plus a check constraint for individual vs group instead of an unconstrained polymorphic `requesterId`.
5. **`support_request_documents` and `support_request_events` (required for scoped case sharing/audit):** document grant rows identify the case, document/project file, who granted access, recipient, permission, and expiry; event rows record actor, event, status transition, and timestamp. Use existing private document authorization; never treat an ID in JSON as an access grant by itself.
6. **Request-bound support conversations:** add an explicit `support_request_id` FK/index on conversations (or a shared request-resource relation with enforced FKs) and uniqueness as appropriate. Reuse conversation membership for participants; do not overload a funding request ID without a type-safe relationship.
7. **Multiple provider services (only if needed):** add `provider_services` with provider/org FK, service kind, coverage/eligibility metadata, active state, and verification state. Until then require one `providerKind` per account and set it at registration.

Do not store complete dashboard summaries, profile snapshots, passwords, private payment details, or access-control decisions in JSONB. Keep searchable ownership/status/recipient fields relational; JSONB may hold non-authoritative program-specific metadata after validation.

## 9. Authorization, Privacy, and Migration

- Derive the actor from the validated session, then check active account status, role capability, organization membership, group membership, resource ownership, request assignment, and explicit document share at the server boundary.
- Keep `users.role` for broad auth policy. Do not add `university`, `government`, `group_admin`, or UI labels as global auth roles. Group admin is scoped to one group; organization admin is scoped to one organization.
- Gate official organizational actions on active organization membership and the appropriate verification state. Creating an unverified profile is allowed; representing the account as verified or making authority-sensitive decisions is not.
- Enforce category/provider-service compatibility at registration and service changes. Changing category, provider kind/services, organization owner, or verification status must be audited and may require review.
- Scope projects, documents, conversations, realtime channels, dashboards, and notifications to the same resource relationships. Hiding navigation is not authorization.
- Preserve current users, roles, provider links, funding requests, conversations, and project ownership. Backfill the existing owner as an active organization owner only when the organization record and owner are unambiguous. Leave uncertain rows for review; do not elevate access by guessing.
- Add focused tests for category-to-role creation, provider kind persistence, invalid category/service combinations, organization membership denial/allowance, group-vs-individual request ownership, cross-organization isolation, private document sharing, referral consent, request conversation membership, and dashboard counts under each actor.

## 10. Delivery Order and Acceptance

1. Update registration validation/UI/API to collect and persist provider kind; add conditional institution/agency/provider onboarding and clear pending-verification states. Preserve existing OTP/legal behavior.
2. Add organization membership and owner invitation/access flows before advertising shared organization teams.
3. Add organization-owned projects and resource-policy support only after ownership and migration constraints are tested.
4. Add non-financial support requests, scoped documents, assignment/audit, request conversations, and role-specific dashboard queues. Keep financial requests on their current lifecycle.
5. Refine dashboard summaries so each role sees only real, authorized tasks and relevant next actions; add the group context switch without creating a group login.
6. Roll out with additive migrations, explicit legacy-provider-kind completion, permission-denial tests, and rollback notes.

Acceptance checks:

- Signup fields change predictably for individual, university, government, and provider selection; submission persists only validated fields.
- A provider's funding/support kind is explicit at onboarding and controls its server-side queue. Existing unset providers are prompted to choose rather than silently classified.
- A university/government account can create or request access to a verified organization, and multiple staff can act only after membership is granted.
- An individual can raise a need personally or for an authorized group, preview sharing, receive a relevant response/referral, and follow decisions in one case timeline.
- Funding and non-financial support have distinct states, fields, permissions, and dashboard workflows.
- Organization, group, project, message, document, and dashboard access is denied outside explicit membership/ownership/assignment rules, even if a user edits a URL or API payload.
- No dashboard claim, balance, grant, service outcome, or verification state is fabricated; each summary is based on authorized records.

## 11. Code Anchors

- Registration UI and schema: `components/auth/RegisterForm.tsx`, `lib/validation.ts`
- Registration persistence and OTP: `app/api/auth/register/route.ts`
- Actor and capability policy: `lib/roles.ts`
- Account and group schema: `db/schema/auth.ts`, `db/schema/social.ts`
- Organization, project, request, and verification schema: `db/schema/projects.ts`
- Organization endpoints and UI: `app/api/organizations/`, `components/organizations/`
- Provider links: `app/api/providers/route.ts`
- Funding request lifecycle: `db/schema/projects.ts`, `app/api/requests/route.ts`, `components/requests/RequestsPage.tsx`
- Dashboard shell, role views, and query-backed summary: `components/layout/DashboardShell.tsx`, `components/dashboard/DashboardHome.tsx`, `app/api/dashboard/summary/route.ts`
- Communication primitives: `db/schema/chat.ts`, `db/schema/system.ts`, `lib/notify.ts`, `lib/realtime.ts`
