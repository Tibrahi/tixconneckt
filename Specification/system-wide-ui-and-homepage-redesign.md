# TIXCONNECKT — System-Wide UI Alignment and Homepage Redesign

## Delivery Brief

**Type:** UX, visual-system, homepage-content, and dashboard-restyling specification  
**Priority:** High; coordinate dashboard screens with the role/action matrix in `Specification/role-aware-reliability-and-product-redesign.md`  
**Status:** Proposed; begin with a route-wide visual audit before implementation

## 1. Objective

Establish a coherent, professional, enterprise-quality visual experience across TIXCONNECKT without making different roles or workflows look and behave as if they were the same. Redesign the public homepage to explain the real platform using trusted product information maintained in project code. Restyle the authenticated dashboard and its feature pages while preserving their existing data, permissions, workflows, and route behavior.

This specification governs presentation and product communication. It does not authorize replacing real workflows with static mockups, changing role permissions, inventing availability, or disclosing internal implementation details. Role-specific behavior and authorization must follow the approved actor/action/resource matrix in the companion specification.

## 2. UI Surfaces to Audit

Before changing shared styles, inventory every route and the components it renders. Include, at minimum:

- Public entry: `/`, welcome/onboarding, not-found, offline, manifest/PWA surfaces.
- Authentication: login, registration, email verification, forgot password, reset password, legal acceptance, and their loading/error/success states.
- Authenticated feature routes: dashboard overview; profile and profile-by-ID; Conneckt; matching; chat list and threads; wallet; plans; actions; notifications; projects and project workspaces; organizations; requests; groups; and settings.
- Administrative routes: overview, users, groups, projects, requests, audit, and settings.
- Shared interaction surfaces: desktop sidebar, collapsed sidebar, mobile navigation drawer, page headers, forms, buttons, tabs, cards, tables/lists, pagination, dialogs, file upload, toasts, empty states, skeletons, and errors.

For each route, record its primary user/job, authorized actions, content hierarchy, navigation path, current spacing and width, shared primitives used, responsive behavior, accessibility gaps, and all loading/empty/error/success states. Capture desktop and narrow-mobile screenshots using representative data; include keyboard focus, open menu/dialog, and long-content states. The route inventory is a verification artifact, not permission to redesign every route with one template.

## 3. Current Code Starting Points

Inspect actual route implementations and callers before changing them. Relevant shared and public surfaces include:

- Public page and product content: `app/page.tsx`, `components/site/LandingPage.tsx`
- Global font, brand tokens, focus styling, and editor styles: `app/layout.tsx`, `app/globals.css`
- Dashboard shell, navigation, and route map: `app/dashboard/layout.tsx`, `components/layout/DashboardShell.tsx`, `components/layout/PageHeader.tsx`, `lib/routes.ts`
- Dashboard overview: `components/dashboard/DashboardHome.tsx`
- Shared UI primitives: `components/ui/Button.tsx`, `Card.tsx`, `Fields.tsx`, `Feedback.tsx`, `Tabs.tsx`, `Modal.tsx`, `Pagination.tsx`, `FileUpload.tsx`, `Toast.tsx`, and `Icon.tsx`
- Authentication forms: `components/auth/`
- Feature modules: `components/profile/`, `components/conneckt/`, `components/chat/`, `components/matching/`, `components/projects/`, `components/requests/`, `components/groups/`, `components/organizations/`, `components/wallet/`, `components/plans/`, `components/actions/`, `components/notifications/`, and `components/settings/`
- Administration: `app/admin/`, `components/admin/`

The current app already uses a shared dashboard shell, a central route map, a page-header component, common buttons/cards/feedback, and global brand tokens. Do not duplicate those systems; assess where they are insufficient and improve them at the owning abstraction. The landing currently uses its own green palette while the global/dashboard system uses blue brand tokens. Resolve this as an intentional product-level palette, not as scattered per-page overrides.

## 4. Design Direction

- Make the product feel trusted, clear, capable, and purpose-built for collaboration and project delivery. Prefer operational clarity and strong information hierarchy over decorative marketing patterns.
- Define a compact visual language for typography, semantic colors, spacing, content widths, borders, elevation, radii, icon sizing, focus, motion, and responsive breakpoints. Use semantic tokens in shared styles/primitives rather than repeatedly hardcoding unrelated values in pages.
- Choose typography intentionally for the product identity, readability, and language coverage. Keep the existing type setup only if it supports the approved direction; avoid introducing several font families or causing layout shifts.
- Keep dashboard cards and controls compact and consistent (generally no more than 8px corner radius); use unframed page sections for layout and reserve framed surfaces for genuinely related data groups, repeated records, or dialogs. Do not nest cards.
- Use familiar controls for their task: icons for clear icon-only commands with accessible names/tooltips, segmented controls for modes, tabs for related views, checkboxes/toggles for binary settings, and labeled fields for values. Do not use decorative pill labels as a substitute for navigation or controls.
- Use status color with text/icon meaning so state is not conveyed by color alone. Maintain visible keyboard focus, sufficient contrast, target sizes, reduced-motion support, and readable zoom/reflow.
- Preserve meaningful differences between workflows. A wallet ledger, chat thread, project workspace, request review, and admin table should share the same design system but keep the information architecture and controls appropriate to their jobs.
- Avoid visual density that hides important data, generic card grids on every page, excessive empty space in operational views, and decorative animation that slows interaction.

## 5. Homepage Content Contract

### 5.1 Trusted source of truth

- Homepage information must come from reviewed, predefined content maintained in the project code. Use structured constants or a small typed content module with stable section IDs and explicit links. Do not generate public claims from user data, AI, environment variables, or third-party scraping.
- Keep copy aligned with verified shipped behavior. Where a capability depends on account eligibility, provider configuration, or an unfinished integration, label that accurately and do not present it as generally available.
- Treat this content as user-facing product copy: edits require code review. Do not expose prompts, model/vendor names, API details, database/storage architecture, deployment information, or internal manufacturing/implementation details.
- Keep the source content testable: assert required sections are present, internal links resolve to known routes/anchors, and any feature availability labels match the approved product capability list.

### 5.2 Required information

The homepage must explain, in clear and concrete language:

- **Platform purpose:** bring people, digital project work, and relevant support into a coordinated, accountable workflow.
- **Problems addressed:** fragmented discovery, difficulty forming capable teams, scattered project coordination, unclear requests/decisions, and limited visibility into contributions and progress. Phrase these as product problems, not unsupported market statistics.
- **Key features:** profiles and skills, collaborator discovery/matching, groups, projects and project documents, chat and one-to-one calls, requests for funding/support, wallet records and approvals, notifications, and scheduled actions where these are verified as available.
- **Benefits:** make it easier to find complementary contributors, keep work and decisions connected to projects, understand responsibilities and request status, and review contributions through permissioned records. Avoid guarantees of funding, success, matching quality, or financial outcomes.
- **Workflows:** explain the actual sequence from account creation and profile setup through discovery, connection/group formation, project collaboration, eligible support request, review/decision, and transparent follow-up. Distinguish member, organization/university, funding-provider, support-provider, group, and admin actions only where those workflows are actually implemented.
- **Trust and transparency:** describe permission-scoped access, user review of consequential actions, traceable project/request decisions, and auditable wallet records only to the extent those mechanisms exist. Link to privacy, terms, and agreement pages.
- **Intended users:** individuals and collaborators, groups, universities/education organizations, funding or loan providers, support providers, and administrators. Clearly state that available actions vary by account role and authorization.
- **Availability:** provide an accurate distinction between currently usable capabilities, configuration-dependent capabilities, and work still in development. Keep this status copy in the same reviewed content source as feature descriptions to avoid contradictions.

### 5.3 Homepage content structure

Organize the page for fast understanding and clear entry into the product:

1. Brand/product signal and concise statement of what TIXCONNECKT does, with visible sign-in and create-account actions.
2. A strong first-viewport visual that shows the actual subject of the product: people coordinating a digital project and its progress. Use a high-quality product screenshot or custom visual asset. If 3D is used, it must communicate a real workflow, remain performant and accessible, and have a static/mobile fallback; do not make an abstract scene the only explanation of the product.
3. A concise explanation of the problem and the connected workflow.
4. A scannable set of verified capabilities, grouped by the user's job rather than a long generic feature list.
5. A role-aware “how it works” section showing distinct user/provider/group journeys without suggesting that all accounts share the same dashboard.
6. A trust/transparency section grounded in existing permissions, review, and audit behavior.
7. Accurate availability/status and links to relevant legal pages.
8. A clear final account-entry action and complete, usable footer navigation.

Keep the product name/category and core value visible above the fold at desktop and mobile widths. Ensure a hint of the next section remains visible on short viewports. Use full-width bands or unframed page sections; do not put the hero message inside a card or build the page as a stack of nested cards.

## 6. Dashboard and System-Wide Restyling

### 6.1 Shared dashboard frame

- Refine the authenticated shell for clear navigation, active-route recognition, role-appropriate sections, and fast movement between related tasks.
- Align desktop sidebar, collapsed state, mobile drawer, content max-width, page gutters, and page headers. Ensure the mobile drawer has complete keyboard and screen-reader behavior, closes at the correct times, and does not obscure the page without a clear dismissal path.
- Retain meaningful unread/status counts and existing retry states. Counts must reflect authorized persisted data, and stale/error states must not look like zero activity.
- Make the account's role and current context clear without exposing sensitive data in the persistent shell.

### 6.2 Page alignment

Audit and align the following, keeping their distinct workflow hierarchy:

- Dashboard overview: role-relevant next actions, summary metrics supported by data, recent activity, and meaningful onboarding/empty states. Avoid displaying irrelevant wallet/provider metrics to roles that cannot act on them.
- Profile and discovery: consistent identity headers, media behavior, profile sections, visibility cues, and safe external links.
- Matching and Conneckt: coherent search/filter controls, result comparison, request state, and clear next action.
- Chat and call history: stable conversation navigation, readable message density, distinct call-history surfaces, and clear loading/offline states.
- Projects and workspaces: predictable project navigation, document/action hierarchy, contribution history, and responsive editor/list layouts.
- Requests and organizations: clear ownership, stage/status, permitted evidence, reviewer action, and decision history.
- Wallet and plans: precise financial typography, clear ledger rows and review states, explicit unavailable/pending states, and no misleading decorative balance treatment.
- Groups, actions, notifications, and settings: consistent forms, event/status hierarchy, destructive-action confirmation, and useful empty states.
- Admin: dense but readable tables/queues, strong distinction between administrative and user actions, safe destructive controls, and visible audit context.
- Authentication and public/legal pages: align typography, form states, navigation, and accessibility to the same product system while retaining the two-region auth layout requirement from the companion specification.

### 6.3 Shared primitives and interaction states

- Establish shared recipes for page title/description/actions, primary/secondary/destructive/icon-only buttons, form fields/help/error text, tabs, data lists/tables, badges, cards, modal/drawer, pagination, and feedback states.
- Apply the same dimensions, labels, disabled/loading behavior, focus handling, and responsive rules wherever the same primitive is used. Use semantic variants rather than inline color combinations for status.
- Define visual states for initial loading, background refresh, empty data, partial data, permission denial, offline/network failure, provider unavailability, form validation, success, and destructive confirmation.
- Preserve user input across recoverable failures. Use skeletons only when the page structure is known; never show fake values as loading placeholders.
- Keep dense dashboard actions scannable with concise labels and stable control dimensions. Ensure long names, translated copy, large numbers, and validation messages wrap without overlapping neighboring controls.

## 7. Data, Role, and Product-Safety Constraints

- Every dashboard panel and homepage capability must reflect real routes, authorized actions, and actual records. No mock activity, fabricated metrics, invented project imagery presented as user work, or unsupported availability claims.
- Use the role/action/resource policy from the companion specification. Styling or client-side visibility does not grant authorization; page data, API actions, documents, and realtime events must remain server-authorized.
- Distinguish workflow states clearly: proposed vs saved, requested vs approved, approved vs paid, and generated preview vs persisted media.
- Preserve route destinations and existing forms/actions. Where navigation or information architecture changes, update the central route map and add redirects or compatibility behavior as required.
- Keep product copy independent from internal implementation. Mention privacy and transparency guarantees only when technically enforced and verified.

## 8. Implementation Sequence

1. **Route and visual baseline:** produce the route inventory and representative desktop/mobile screenshots; record existing primitives, inconsistencies, workflow states, and accessibility issues.
2. **Content and visual direction approval:** define the trusted homepage content model, verified feature availability, palette/type/spacing/radius/elevation tokens, and role-aware page hierarchy before broad implementation.
3. **Shared foundations:** update shared tokens and UI primitives first; validate pages using those primitives and retain clear migration points for local exceptions.
4. **Dashboard shell and overview:** refine global navigation/content layout, then implement the role-aware overview and verify real counts/empty/error states.
5. **Feature-route alignment:** update feature pages in cohesive groups, preserving each module's behavior and testing the representative task end-to-end after each group.
6. **Homepage and auth:** implement reviewed code-maintained homepage content, high-quality visual asset, availability statements, and responsive layout; align auth pages while preserving validation and security flows.
7. **Full visual and functional regression:** repeat the route screenshot inventory, interaction/accessibility checks, and existing tests at desktop, tablet, and mobile breakpoints.

Do not begin with a global class replacement. If the route audit reveals a high-risk shared primitive issue, make a small primitive change and validate its affected consumers before continuing.

## 9. Acceptance Criteria

- Every route listed in the UI inventory has an identified primary task, role/access context, responsive layout, and documented loading, empty, error, and success states where applicable.
- Dashboard and public pages share a deliberate typography, color, spacing, control, status, and focus system; the public palette and authenticated palette feel related without forcing identical contexts.
- Repeated shared components render consistently across feature modules, while chat, editor, financial, provider, and admin workflows retain appropriate information density and controls.
- Homepage content is predefined and reviewed in project code; it covers platform purpose, user problems, verified features, benefits, actual workflows, trust/transparency, intended users, and availability without unsupported claims or internal implementation disclosures.
- The first viewport communicates the product and offers working account-entry actions; visual assets are relevant, high quality, responsive, accessible, and performant.
- Dashboard content and navigation are role-aware, backed by authorized real data, and consistent with the approved role/action matrix.
- No changes break existing route behavior, forms, persistence, OTP/legal flows, or error recovery. All links and controls lead to working destinations/actions.
- Desktop and mobile screenshots show no clipped text, overlapping controls, unstable layout shifts, inaccessible navigation, or unhandled long-content cases.
- Keyboard-only navigation, visible focus, contrast, screen-reader names/landmarks, reduced motion, and browser zoom/reflow are verified on representative public, auth, dashboard, and admin flows.
- Focused unit/functional tests, typecheck, lint, production build, and Playwright coverage for representative user journeys pass. Remaining unavailable features are labeled truthfully.

## 10. Out of Scope Unless Separately Approved

- Changing the data model, account roles, financial policy, access rules, or product availability solely to fit a visual design.
- Replacing working feature behavior with a static design mock or synthetic data.
- Publishing unverified claims, customer logos, metrics, testimonials, provider support, AI capabilities, or payment methods.
- Exposing internal AI vendors, prompts, storage/database details, credentials, deployment topology, or other system construction details on the public homepage.
- Redesigning unrelated backend architecture or deleting existing routes without a reviewed migration and compatibility plan.