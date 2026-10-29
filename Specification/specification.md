# TIXCONNECKT — Improved Project Specification

**Document type:** Product, UI/UX, architecture, security, and implementation requirements  
**Project:** TIXCONNECKT  
**Primary objective:** Connect people globally through compatible skills, career objectives, collaborative projects, funding opportunities, and trusted support.

---

## 1. Project Objective

TIXCONNECKT is a full-stack collaboration and funding platform designed to help talented people, individuals, groups, universities, and governments connect with the right collaborators and funding providers.

The system must solve these core problems:

- Talented people struggling to find work that matches their skills and ambitions.
- Promising projects being abandoned because of insufficient capital or collaborators.
- People lacking reliable access to project support, funding, and professional networks.
- Groups needing a structured way to develop ideas, manage contributions, and coordinate work.
- Funding providers needing a safer, organized process to evaluate projects and establish agreements.

### Core principles

1. Connect users according to their objectives, skills, and project requirements.
2. Allow individuals and groups to collaborate on shared goals.
3. Support project funding through self-funding, group contributions, loans, and other support.
4. Use AI to assist with matching, transcription, project development, and document parsing.
5. Maintain trustworthy records through a persistent database.
6. Protect private information, project ideas, financial records, and user accounts.
7. Ensure every implemented feature has a working backend workflow.

## 2. Customer Categories

- **Individuals:** People seeking collaborators, opportunities, support, and project funding.
- **Groups:** People collaborating toward shared objectives.
- **Universities:** Organizations participating as providers or supporters.
- **Government organizations:** Organizations participating as providers or supporters.
- **Funding and support providers:** Individuals or organizations offering eligible loans, financial support, or other project assistance.

The system must distinguish ordinary users, group members, group administrators, providers, and system administrators according to verified roles and permissions.

## 3. Technology Stack

Use the following technologies specified by the project.

| Area | Required technology |
|---|---|
| Application | Next.js, React, TypeScript |
| Styling | Tailwind CSS |
| Database | Neon PostgreSQL |
| Database tooling | Drizzle ORM, migrations, schema push |
| Authentication | Better Auth, jose where appropriate |
| Validation | Zod, React Hook Form |
| Email | Nodemailer with Google SMTP |
| AI | Muse Spark and Muse Voice integrations |
| Real-time communication | Socket.IO |
| Peer communication | WebRTC and MeshP2P where appropriate |
| PWA | Serwist |
| Phone and country data | libphonenumber, world countries data |
| Date and timezone | Intl, date-fns-tz |
| Rate limiting | Upstash Redis and rate limiting |
| HTML sanitization | DOMPurify |
| User onboarding | Driver.js |
| Currency conversion | Frankfurter |
| Badges | SVG |
| File storage | Private object storage with access controls |

Use a supported, compatible version of each dependency. Keep secrets and private configuration in environment variables. Never expose server credentials to client-side code.

Muse integrations must use their actual available APIs and capabilities. Do not fabricate AI responses or pretend an unavailable integration has completed an action.

## 4. Visual Design System

### 4.1 Colors

The interface must use a strict, minimal visual system.

- **Primary background:** Pure white (`#FFFFFF`).
- **Primary text:** Black (`#000000`).
- **Primary interactive color:** Blue, reserved for buttons, links, focus indicators, selected navigation, and interactive states.
- **Secondary backgrounds:** White, including cards and dashboard content surfaces.
- **Decorative backgrounds:** None.

Do not introduce gradients, background patterns, decorative dots, distracting lines, or unnecessary visual effects.

Use borders only when needed to separate meaningful content, form controls, tables, or cards. Keep them subtle and functional.

### 4.2 Typography

Only use these Google Fonts:

- **Inter:** Main interface, headings, labels, forms, and body text.
- **IBM Plex Mono:** Identifiers, technical values, timestamps, transaction references, and other appropriate data.

Use consistent font weights, readable line heights, and a clear type scale. Load fonts efficiently and avoid unnecessary font variants.

### 4.3 Icons

- Use Font Awesome icons only.
- Icons must be black by default.
- Use blue for icons that communicate an active or interactive state when appropriate.
- Use consistent icon sizes, stroke or visual weight, spacing, and alignment.
- Avoid broken, clipped, distorted, oversized, or undersized icons.
- Do not substitute emoji or arbitrary icon libraries for Font Awesome.

### 4.4 Components

Build a reusable design system rather than implementing every screen independently.

Shared components should include:

- Buttons, icon buttons, and links.
- Form fields, validation messages, and selectors.
- Cards, tables, badges, and status indicators.
- Modals, confirmation dialogs, and error dialogs.
- Loading indicators, skeletons, empty states, and retry actions.
- Pagination, search, filters, and sorting controls.
- Profile summaries, navigation items, and notification counters.
- File upload controls and document previews.
- Accessible tabs, accordions, and mobile navigation.

Every component must have consistent spacing, typography, interaction states, and responsive behavior.

## 5. Responsive Layout and Navigation

### 5.1 Dashboard layout

The authenticated dashboard must have two principal regions:

1. **Left navigation:** Main navigation links and optional collapsible navigation groups.
2. **Right content area:** The current page and its relevant sections.

Do not add a global dashboard header or footer. Page-level titles, actions, search fields, and controls may appear within the main content area when necessary.

### 5.2 Responsive behavior

The application must adapt to actual viewport width and height.

- Desktop: Persistent left navigation and a flexible main content area.
- Tablet: Compact or collapsible navigation with appropriate content spacing.
- Mobile: A compact navigation drawer or another accessible mobile navigation pattern.
- Small screens: Stack forms, cards, and sections vertically.
- Long content: Allow appropriate scrolling without clipping or overlapping elements.
- Dialogs: Fit the available viewport and remain accessible on mobile.

Use CSS responsive breakpoints, flexible layouts, and viewport-aware sizing. Use `ResizeObserver` only where element dimensions genuinely need to be observed; ordinary responsive layouts should rely primarily on CSS.

### 5.3 Sidebar behavior

- Support expanded and collapsed navigation.
- Preserve a clear active-page indicator.
- Display tooltips for icon-only navigation items.
- Keep icons and labels aligned.
- Prevent overlapping labels, badges, and controls.
- Preserve navigation usability on small screens.
- Make the collapsed state consistent across pages.

### 5.4 Navigation integrity

Every visible navigation item must lead to a real, implemented destination.

- Create a centralized route map.
- Use shared navigation configuration.
- Verify internal links and dynamic route parameters.
- Handle unauthorized and nonexistent resources explicitly.
- Show meaningful empty states when no records exist.
- Provide a useful not-found page instead of a broken or blank screen.
- Never display an interactive button that points to an unimplemented destination.

The dashboard must offer meaningful access to Profile, Conneckt, Chat, Matching, Wallet, Plan, Action, Notifications, Project, Request, Settings, and other implemented modules.

## 6. Application Entry Point and PWA

The application must be installable as a Progressive Web App using Serwist.

### Required behavior

- On a fresh application launch, render the authentication page rather than a public landing page.
- If an authenticated session exists, validate it and redirect the user to the appropriate authenticated destination.
- If the session is invalid or expired, require authentication.
- Do not expose private dashboard content before authorization.
- Support installation on compatible desktop and mobile devices.
- Provide a web app manifest, application icons, theme configuration, and appropriate service-worker registration.
- Use a clear offline state and retry mechanisms.
- Cache static assets where appropriate.

**Security requirement:** Never cache private financial information, authentication responses, private messages, or sensitive API responses in a publicly accessible cache. Service workers must not bypass authentication or authorization.

Any public landing page must remain separate from the required application startup flow.

## 7. Authentication and Account Security

### 7.1 Registration

The registration flow must collect and validate:

- Full name.
- Email address.
- Password and password confirmation.
- Phone number.
- Country and country calling code.
- Applicable account terms and agreements.

Use country metadata and libphonenumber to normalize and validate phone numbers. Use browser geolocation only with explicit permission. Country and timezone detection must have manual fallbacks.

### 7.2 Privacy, Terms, and Agreement

Before registration, users must be presented with the applicable Privacy Policy, Terms, and Agreement.

- Show the relevant document in a modal or dedicated dialog.
- Require the user to read the document before acknowledging it.
- Keep the acknowledgment checkbox unchecked until the user explicitly accepts.
- Record the accepted document version and timestamp.
- Do not create an account if required consent has not been provided.

Store the legal document versions and consent records persistently.

### 7.3 Email verification and OTP

- Send a registration verification code to the supplied email.
- Validate the code on the server.
- Apply expiration, attempt limits, resend cooldowns, and rate limits.
- Activate the account only after successful verification.
- Send an account activation confirmation email.

### 7.4 Login

Use email, password, and the configured email OTP verification flow.

- Validate credentials securely.
- Verify the OTP before granting access.
- Notify the user when a new device or session is detected.
- Maintain a record of session creation and relevant security events.
- Apply rate limits to login and verification endpoints.

### 7.5 Password recovery

1. Send a security notification when a recovery request is initiated.
2. Issue a time-limited verification code.
3. Verify the user before allowing a password reset.
4. Require the configured second verification step before changing the password.
5. Invalidate recovery tokens after use.
6. Revoke appropriate existing sessions after a successful password change.
7. Send a password-change confirmation email.

The recovery process must use secure, server-generated tokens and must not reveal whether an email address has an account.

### 7.6 Sessions and cookies

Configure Better Auth and the session system to use:

- `HttpOnly` cookies.
- `Secure` cookies in production.
- Appropriate `SameSite` settings.
- Expiration and session renewal policies.
- Server-side session validation.
- CSRF protection where applicable.
- Session revocation and logout.
- Secure production cookie domains and paths.

Never store authentication secrets or privileged tokens in browser local storage.

## 8. Dashboard

The dashboard must display real information retrieved from the database.

It may include:

- Profile completion information.
- Recent messages and unread-message counts.
- Pending connection requests.
- Matching opportunities.
- Group membership information.
- Current wallet balances, where authorized.
- Project activity and project status.
- Pending approvals and funding requests.
- Unread notifications.
- Upcoming scheduled actions.

Every statistic must be calculated from a defined database query or a trustworthy, explicitly sourced data provider.

Do not create fake users, fake transaction histories, placeholder balances presented as real, fabricated activity, or invented platform statistics.

When a module has no records, display a useful empty state and a relevant action.

## 9. Profile

Users must have a professional profile accessible through their account and, according to visibility rules, through Conneckt.

### Profile fields

- Unique short user identifier, such as `A2WD`.
- Full name.
- Email address.
- Phone number.
- Location and country.
- Education level.
- Objectives and major.
- Skills and capabilities.
- Relevant fields or sectors.
- Group membership count.
- Group roles and earned badges.
- Applicable support and loan records or counts.
- Funding and repayment status where authorized.

### Profile requirements

- Generate unique identifiers on the server.
- Enforce uniqueness in the database.
- Search by short identifier using an authorized backend endpoint.
- Display only information the viewer is permitted to access.
- Keep financial and contact details private according to user preferences and authorization rules.
- Calculate group, support, and loan counts from actual records.
- Display badges only when supported by verified eligibility criteria.

Profile updates must be validated and persisted. AI-assisted profile updates may transcribe spoken input and suggest field values, but the user must be able to review changes before they are saved.

## 10. Matching

Matching helps users discover compatible collaborators based on their goals and capabilities.

### Matching workflow

1. Ask the user about their objective.
2. Collect their skills and strengths.
3. Collect their intended field or sector.
4. Collect relevant education or major information when appropriate.
5. Save the answers to the user's profile.
6. Identify compatible users using structured matching criteria.
7. Apply AI-assisted comparison when the configured Muse integration is available.
8. Present suitable candidates in Conneckt.
9. Allow users to approve or reject a proposed connection.
10. Support group creation for users with a shared objective when the relevant conditions are satisfied.

### Matching rules

- Do not recommend users merely because their profiles contain the same skill.
- Exclude incompatible roles where the matching rules require complementary capabilities.
- Prefer complementary skills when collaboration requires different responsibilities.
- Support two or three dynamic roles where applicable to the project's matching model.
- Avoid duplicate suggestions and repeated rejected matches.
- Store match explanations and relevant matching status.
- Allow the matching rules to be adjusted as the project evolves.

AI must assist with compatibility evaluation rather than independently granting access, accepting connections, or creating unauthorized groups.

## 11. Conneckt

Conneckt is the main discovery and connection management module.

### 11.1 Individual connections

Users can:

- Search for users by short identifier.
- View permitted profile information.
- Send connection requests.
- Accept or reject incoming requests.
- View current connections and pending requests.
- Discover eligible loan and support providers.
- Request a provider connection.

Connection state changes must be saved in the database.

### 11.2 Group connections

Groups can discover and connect with eligible funding and support providers.

- Display relevant providers.
- Show the group and the relevant project context.
- Allow authorized group members to request a connection.
- Support group voting or approval where required.
- Record who submitted, reviewed, approved, or rejected a request.
- Notify affected members of decisions.

Provider connections must respect group permissions and project privacy.

## 12. Chat

Chat must support persistent individual and group conversations with real-time updates through Socket.IO.

### Individual conversations

- User-to-user chat.
- User-to-loan-provider chat when an applicable connection or request exists.
- User-to-support-provider chat when an applicable connection or request exists.

### Group conversations

- Group member conversations.
- Group-to-loan-provider conversations where authorized.
- Group-to-support-provider conversations where authorized.

### Required functionality

- Persistent messages and conversation membership.
- Real-time delivery and synchronization.
- Read and unread status.
- Message timestamps.
- Appropriate pagination and history loading.
- Attachment support with access controls, if implemented.
- Connection and group permission checks.
- Reconnection handling and failure recovery.
- Message notification delivery.

Unread counts must be calculated from persisted message and read-status records. Do not display fabricated counts.

WebRTC and MeshP2P should be introduced only for the specific communication workflows that need them, with clear authorization and connection handling.

## 13. Wallet and Funding

The Wallet module must maintain trustworthy, auditable financial records.

### 13.1 Individual self-funding

Users can submit supporting documents or transaction evidence.

The system must:

1. Receive and validate the uploaded file or supported text.
2. Store the document securely.
3. Send it through the configured document-parsing workflow.
4. Return proposed structured transaction details.
5. Allow verification or correction where required.
6. Record the approved transaction.
7. Update the relevant wallet balance and history.

### 13.2 Group funding

Groups can contribute to a shared wallet.

- Record contributions and their sources.
- Require member approval when the workflow specifies it.
- Maintain an audit trail of approvals.
- Support targeted savings accounts and general savings.
- Allow permitted minimum and maximum savings thresholds.
- Notify authorized members when configured thresholds are reached.
- Restrict withdrawals to the authorized amount and individual or group permissions.

A group member must not be able to withdraw another member's personal funds merely because they belong to the same group.

### 13.3 Provider funding

Providers can contribute funds to an eligible individual or group based on an approved request.

The system must record:

- Provider identity.
- Funding recipient.
- Related project or request.
- Amount and currency.
- Supporting documents.
- Approval status.
- Transaction reference.
- Applicable agreement.
- Funding and repayment status.
- Transaction history.

### 13.4 Financial integrity

Wallet balances must never be updated by an unverified document-parsing result alone.

Use server-side authorization, database transactions, appropriate locking or concurrency controls, and an auditable ledger. Prevent duplicate transactions, unauthorized withdrawals, and double spending.

For transfers and approvals, define an explicit state machine and preserve the history of every state transition.

AI-generated JSON is a proposal for structured data, not proof that a transaction occurred.

## 14. Plans and Subscriptions

The initial proposed plans are:

| Account category | Basic | Super |
|---|---:|---:|
| Individual | $5 | $10 |
| Group | $10 | $15 |
| Provider | $10 | $20 |

These are proposed project prices and must be treated as configurable product requirements, not confirmed payments or revenue.

The system must:

- Associate plans with the correct account category.
- Define the actual benefits of each plan.
- Enforce plan-specific access on the server.
- Persist subscription status and billing history.
- Provide appropriate upgrade and downgrade workflows.
- Handle payment confirmation and cancellation securely.

Do not mark a plan as paid or active without a verified payment event or an authorized administrative action.

Private project visibility for Super users must be enforced by the backend, not merely hidden in the interface.

## 15. Action and Scheduled Automation

The Action module allows users to create instructions for future execution.

### Workflow

1. The user records a voice instruction or enters text.
2. Muse Voice transcribes supported audio.
3. Muse Spark interprets the instruction.
4. The system presents the proposed action, parameters, and execution time.
5. The user reviews and confirms the action.
6. The system stores the action and its schedule.
7. The system sends a pre-execution email notification where applicable.
8. A reliable background worker executes the authorized action at the specified time.
9. The system records the result.
10. The system sends a completion or failure notification and displays the result in the Action module.

### Supported examples

- Prepare an instruction for a group meeting at a specified time in Rwanda.
- Schedule a profile phone-number update.
- Prepare a message to be sent to a group.
- Schedule an approved workflow.

### Automation safeguards

- Store timestamps in a consistent format, preferably UTC, alongside the intended timezone.
- Resolve daylight-saving and timezone issues where applicable.
- Persist execution status, attempts, results, and timestamps.
- Make retries safe and idempotent.
- Prevent the same action from executing twice unintentionally.
- Require explicit authorization for consequential actions.
- Provide cancellation and editing before execution when possible.
- Notify users if an action cannot be completed.

The system must not depend on the browser being open, the user being online, or the device remaining powered on. Scheduled actions require reliable server-side job processing.

## 16. Notifications

The Notifications module must show persisted notifications for meaningful system events.

Examples include:

- New messages.
- Connection requests and decisions.
- Group approvals.
- Matching opportunities.
- Funding request updates.
- Wallet transaction updates.
- Scheduled action reminders and results.
- Project analysis results.
- Security events.
- Subscription changes.

Each notification should have an identifier, recipient, event type, relevant resource, creation time, read status, and delivery status where applicable.

Use real database-backed unread counts. Support opening the related resource directly, marking notifications as read, and retrying failed email delivery.

## 17. Project and Collaborative Idea Development

The Project module provides a structured environment for developing and improving ideas.

### 17.1 Idea projection

Present ideas in a navigable feed or carousel.

Users should be able to:

- Submit an idea.
- Review project details.
- Add structured contributions.
- Reply to other contributions.
- Like or react to ideas where supported.
- Review accumulated feedback.
- Navigate through related ideas.
- View the consolidated discussion and its history.

Do not discard previous contributions when ideas are revised or analyzed.

### 17.2 AI project development

Muse Spark may assist with producing a structured project document containing:

- Problem statement.
- Proposed solution.
- Target customers.
- Market and competitor research.
- Scope and objectives.
- Required collaborators.
- Distribution strategy.
- Revenue model.
- Funding requirements.
- Delivery requirements and milestones.
- Risks and assumptions.

Clearly distinguish user-supplied information, AI-generated analysis, and externally researched facts.

Competitor information and market claims must be supported by identifiable sources when external research is available. If evidence is unavailable, label the information as an assumption or an item requiring research.

### 17.3 Project revision

- Preserve original ideas and contributions.
- Store analysis versions.
- Let authorized users review and comment on AI-generated results.
- Support revisions and re-analysis.
- Maintain project history and contributor attribution.
- Notify relevant participants when a new analysis is available.
- Link notifications and chat messages to the actual project.

Every project, contribution, analysis, and revision must have a persistent database record.

## 18. Requests, Funding Applications, and Agreements

The Request module manages formal requests for funding or project support.

### Workflow

1. An individual or group develops a project.
2. The project owner or authorized group members approve the funding decision.
3. The owner chooses whether the project is public or private.
4. The project owner submits an eligible request.
5. A provider views the permitted project summary.
6. The provider requests a connection or initiates the appropriate review.
7. The provider prepares or uploads an agreement.
8. The relevant parties review the terms.
9. Authorized parties accept or reject the agreement.
10. The system records the decision and any resulting funding workflow.

### Privacy requirements

- Public projects may be visible to eligible users and providers according to defined access rules.
- Private projects must be restricted to authorized users.
- Private project content must not leak through search results, API responses, notifications, or generated previews.
- Providers must see only the information required at each stage.
- Sensitive project details must not be exposed merely because a provider is interested.

Agreements must preserve their versions, signatories, acceptance timestamps, and relevant status. Do not claim that an agreement is legally registered or enforceable without a supported process that establishes that status.

## 19. Proof and Document Parsing

Provide a reusable document-processing workflow for Wallet, Project, Request, and other authorized modules.

### Accepted inputs

- Supported document uploads.
- PDF files.
- Pasted transaction messages.
- Text documents.
- Voice transcripts where supported.

### Processing flow

1. Validate file type, size, and permissions.
2. Store the original file securely.
3. Record its owner and intended destination.
4. Extract or transcribe the relevant content.
5. Parse the content through the configured AI service.
6. Validate the returned structured data using Zod schemas.
7. Show the proposed extracted fields for review where required.
8. Save approved values to the correct database records.
9. Preserve the source document and processing history.
10. Display errors and allow safe retries.

AI output must not be blindly trusted, especially for money, identity, agreements, and financial status.

## 20. Settings and Account Management

The Settings module must provide:

- Profile updates.
- Account security and session management.
- Password changes.
- Account deactivation requests.
- Account deletion.
- Relevant privacy controls.
- Notification preferences where supported.

Profile changes must be validated and saved to the database.

For account deletion, define how related messages, group records, financial records, and legal obligations are handled. Preserve records that must lawfully be retained and remove or anonymize eligible personal information according to the applicable policy.

Deactivation and deletion must be separate, clearly explained actions.

## 21. System Administration

Provide a protected administration area for authorized administrators.

It should support the project-defined operational controls, including:

- User and account management.
- Role and permission management.
- Group and project moderation.
- Provider and request oversight.
- Appropriate review of flagged records.
- System configuration.
- Audit and security event review.
- Controlled administrative actions.

Enforce administrative permissions on the server. Record sensitive administrative actions with actor, timestamp, target, reason where appropriate, and outcome.

Do not grant administrative access through a client-side flag or an editable profile field.

## 22. Database and Data Persistence

PostgreSQL is the authoritative source for persistent application data.

Create normalized schemas and appropriate relationships for entities such as:

- Users and profiles.
- Accounts, sessions, and verification records.
- Legal documents and consent records.
- Groups, memberships, and roles.
- Skills, objectives, and matching results.
- Connections and connection requests.
- Conversations, memberships, messages, and read states.
- Wallets, ledger entries, transfers, and approvals.
- Plans and subscriptions.
- Projects, contributions, analyses, and versions.
- Funding requests and agreements.
- Scheduled actions and execution attempts.
- Notifications and delivery attempts.
- Uploaded documents and parsing jobs.
- Audit logs and administrative events.

Use foreign keys, unique constraints, indexes, timestamps, and appropriate deletion rules.

### Persistence rules

- Save all meaningful user actions.
- Read displayed data from authorized database queries.
- Use transactions for operations that must succeed or fail together.
- Apply pagination to large collections.
- Maintain audit trails for sensitive operations.
- Do not store sensitive data redundantly without a defined reason.
- Avoid trusting client-provided balances, roles, permissions, or ownership.
- Use database constraints to protect data integrity.

Socket.IO events should communicate committed database changes, not replace persistent records.

## 23. Error Handling and Recovery

All application errors must be handled in a consistent, user-friendly way.

### Error dialog requirements

- Appear centrally within the viewport when a blocking error needs user attention.
- Adapt to the current screen size.
- Explain what happened in plain language.
- Offer a Cancel or Close button.
- Offer Retry when the operation is safely retryable.
- Preserve entered form values and unsaved work where possible.
- Prevent accidental duplicate submissions.
- Avoid exposing stack traces, SQL errors, secrets, or internal developer messages.

Examples:

- "We couldn't save your changes. Your entered information is still available. Please try again."
- "Your connection was interrupted. We'll reconnect when possible."
- "This request has already been processed. Refresh the page to see its latest status."

Persisted operations must expose their actual server status. If a request fails before saving, keep the user's input available and clearly communicate that the operation was not completed.

Use structured server-side logging and a correlation identifier to help investigate problems without exposing sensitive diagnostic details to users.

## 24. Real-Time Behavior

Use real-time communication where the project requires it.

- New chat messages should appear without manual refresh.
- Notification counts should update when relevant events occur.
- Connection requests and approvals should update their visible status.
- Group approval results should synchronize across authorized members.
- Wallet and funding status should update after successful database commits.
- Project analysis status should update as processing progresses.

Use authorization checks for socket connections and each protected event. Reconnect safely, prevent duplicate event processing, and reload authoritative records when a client reconnects.

Do not treat an optimistic frontend update as proof of a successful database operation.

## 25. Numbering and Counts

Display badges only when they represent meaningful, current information.

Examples:

- `Chat (4)` for four unread messages, according to the defined counting rule.
- `Notifications (16)` for sixteen unread notifications.

These values are examples of presentation, not default data.

Counts must be calculated from real database records and scoped to the authenticated user. Do not use random values, hardcoded counts, fake pagination totals, or invented activity.

Use clear empty states when the count is zero.

## 26. Email and Background Processing

Configure Nodemailer with Google SMTP using server-side environment variables.

Use email notifications for appropriate events, including:

- Account verification and activation.
- Login security notifications.
- Password recovery and password-change confirmation.
- Scheduled action reminders and outcomes.
- Project analysis completion.
- Funding request and agreement updates.
- Other important user-authorized events.

Use a background job or durable queue for tasks that must survive application restarts. Store job status, retry attempts, and delivery results.

Email sending failures must not silently erase a successfully persisted business operation. Record the failure and retry delivery where appropriate.

## 27. Performance and Loading

Optimize the application for fast initial rendering and responsive interactions.

- Use server rendering and server components where appropriate.
- Keep client components focused on genuine interactivity.
- Load large modules and editors on demand.
- Optimize images and static assets.
- Avoid unnecessary client-side JavaScript.
- Use database indexes for common queries.
- Paginate messages and other large datasets.
- Cache only safe, appropriately scoped data.
- Avoid repeated requests and unnecessary database queries.
- Provide loading indicators for operations that take time.
- Use skeletons only when they improve perceived loading.
- Monitor performance and errors in production.

Performance optimizations must not weaken authorization or expose private cached information.

## 28. Accessibility and Usability

- Use semantic HTML.
- Provide labels for form controls.
- Ensure keyboard navigation works.
- Give visible focus indicators.
- Maintain sufficient contrast.
- Provide accessible names for icon-only buttons.
- Make dialogs keyboard accessible and manage focus correctly.
- Respect reduced-motion preferences.
- Display validation errors next to the relevant fields.
- Avoid relying on color alone to communicate status.

Use Driver.js to introduce the application through optional, contextual onboarding. Do not block the user with repetitive tours.

## 29. Environment Variables and Configuration

Use `.env` for local development and deployment-platform environment configuration for production.

Maintain an `.env.example` file containing variable names and safe placeholder values only.

Configuration may include:

- `DATABASE_URL`
- Authentication secrets and URLs.
- Google SMTP credentials.
- Muse service credentials and endpoints.
- Object storage credentials.
- Upstash Redis configuration.
- Public application URL.
- Other integration-specific server settings.

Never commit real credentials. Never expose server-only secrets through public environment variables. Validate required configuration at startup and provide clear configuration errors in server logs.

## 30. Package Scripts and Database Commands

Include practical development, validation, and database commands in `package.json`.

The following are examples of the intended command structure; implement them according to the selected ORM and project configuration.

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:push": "drizzle-kit push",
    "db:studio": "drizzle-kit studio"
  }
}
```

Database scripts must correspond to actual installed dependencies and valid configuration.

- `db:generate` generates migration files.
- `db:migrate` applies committed migrations.
- `db:push` synchronizes the schema directly with the database where appropriate.
- `db:studio` opens the configured database management interface.

Use reviewed migrations for production changes. Do not make production deployments depend on an uncontrolled schema push.

Add seed commands only for explicitly identified development or test data. Seed data must never be presented as genuine production activity.

## 31. Security Requirements

Implement server-side controls throughout the application.

- Validate every request.
- Authenticate protected routes and APIs.
- Authorize every protected resource and action.
- Apply rate limits to authentication, uploads, search, and sensitive operations.
- Validate uploaded file types and sizes.
- Restrict private object storage access.
- Sanitize untrusted HTML.
- Prevent SQL injection through safe query construction.
- Protect against cross-site scripting and CSRF.
- Apply secure password and OTP handling.
- Audit sensitive financial and administrative operations.
- Protect project confidentiality and group membership.
- Verify webhook signatures for integrations that support them.
- Apply retention and deletion policies to sensitive information.

The frontend is not a security boundary. Every important permission must be enforced by the backend.

## 32. Implementation Structure

Organize the code into reusable modules rather than placing the application in a single large file.

A suitable structure is:

This is a suggested organization, not a requirement to create empty files for every directory. Use the actual Next.js routing conventions and keep related functionality together.

Separate:

- UI components.
- Business logic.
- Database access.
- API and server actions.
- Authentication and authorization.
- External integrations.
- Background jobs.
- Validation schemas.
- Tests.

## 33. Acceptance Criteria

The project is ready for release only when the following conditions have been verified.

### Authentication

- Registration, email verification, login, OTP, password recovery, and logout work.
- Legal consent is recorded correctly.
- Sessions and cookies are configured securely.
- Unauthorized access is rejected.

### Navigation and responsive UI

- The dashboard uses the two-region layout.
- No global dashboard header or footer is present.
- The interface adapts to desktop, tablet, and mobile.
- Navigation links lead to implemented destinations.
- Collapsed navigation does not overlap or hide essential controls.
- Errors and empty states are understandable.

### Database and persistence

- Important actions persist across refreshes and sessions.
- Database constraints prevent invalid relationships and duplicate records.
- Financial records are auditable.
- Counts and displayed statistics come from real data.
- No fabricated production records appear.

### Core modules

- Profiles can be updated.
- Matching produces candidates from defined criteria.
- Connection requests can be accepted and rejected.
- Chat messages persist and synchronize.
- Wallet operations use validated, authorized transactions.
- Funding requests and agreements follow defined approval workflows.
- Projects preserve contributions and analysis history.
- Scheduled actions run independently of the user's device.
- Notifications and email delivery reflect actual events.

### Security and reliability

- Private data is not accessible without permission.
- AI output is validated before consequential use.
- Failed actions preserve user input and record actual status.
- Retries do not duplicate transactions or scheduled actions.
- Background jobs survive application restarts.
- Database migrations and production configuration are documented.

### Testing

Include unit tests for business logic, integration tests for database workflows, and end-to-end tests for critical user journeys.

Test at minimum:

1. Registration through successful account activation.
2. Login with OTP and session protection.
3. Profile update and matching.
4. Connection request and acceptance.
5. Real-time chat and unread counts.
6. Group approval and funding workflows.
7. Project creation and revision.
8. Scheduled action execution and notification.
9. Failed network requests and recovery.
10. Unauthorized access to private projects and financial records.

---

## 34. Final Development Rule

**Build TIXCONNECKT as one coherent, production-oriented application.**

Every page must have a defined purpose, every action must have a real workflow, every protected operation must be authorized, and every persistent detail must have an appropriate source of truth.

Do not prioritize the number of screens over the completeness of the system. Build and verify connected vertical workflows from the interface through the server, database, and external services.

If an integration or feature is not yet available, clearly identify it as pending rather than presenting a fake success state.

The final product must combine the requested minimal blue, white, and black design with reliable functionality, persistent data, responsive navigation, secure access, and consistent user experience.
