# TIXCONNECKT — System Features, Corrections & Integration Specification

## 1. Authentication & Account Management

**Features**
- Registration and login.
- Email OTP verification.
- Password recovery and password changes.
- Account activation and security notifications.
- Session and cookie management.
- Privacy Policy, Terms, and Agreement acceptance.
- Account deactivation and deletion.

**Corrections and improvements**
- Use separate, expiring OTP challenges for registration, login, and password recovery.
- Require both password validation and OTP verification where configured.
- Record the version of each accepted legal document.
- Use secure, HTTP-only cookies and server-side session validation.
- Do not reveal whether an email address is registered.
- Notify users of successful account activation, password changes, and suspicious or new-device activity.

**Connection and rendering**
- Render login and registration as the initial public application entry point.
- Redirect authenticated users to the dashboard after session validation.
- Connect forms to server-side authentication actions and persistent account records.
- Use Nodemailer and Google SMTP for email delivery.
- Use Better Auth for authentication and session management.

## 2. Dashboard

**Features**
- Profile summary.
- Quick-access navigation.
- Recent activity.
- Unread chat and notification counts.
- Pending connection requests.
- Matching opportunities.
- Group, project, and funding updates.
- Upcoming scheduled actions.

**Corrections and improvements**
- Display only data retrieved from authorized database queries.
- Calculate counts from actual records.
- Do not display fabricated statistics, balances, or activity.
- Show meaningful empty states when no data exists.

**Connection and rendering**
- Render a left navigation area and a main content area.
- Do not include a global dashboard header or footer.
- Connect dashboard summaries to the corresponding feature modules.
- Use shared layout components and responsive navigation across authenticated pages.

## 3. Profile

**Features**
- Unique four-character user identifier.
- Full name, email, phone, location, and country.
- Education level, objectives, skills, and capabilities.
- Group membership count and roles.
- Earned badges.
- Applicable support and loan information.

**Corrections and improvements**
- Generate identifiers on the server and enforce database uniqueness.
- Separate private contact details from publicly visible profile information.
- Calculate group and funding counts from actual records.
- Show financial status only to authorized viewers.
- Require review before AI-generated profile changes are saved.

**Connection and rendering**
- Connect the profile to the user, skills, education, group memberships, and authorized financial records.
- Render the owner's editable profile and other users' permission-filtered profiles.
- Allow profile lookup from Conneckt using the unique identifier.
- Use Muse Voice for transcription and Muse Spark for field interpretation when configured.

## 4. Matching

**Features**
- Objective and skill collection.
- Field or sector selection.
- Education or major information.
- Compatibility assessment.
- Candidate recommendations.
- Approval and rejection of suggested connections.
- Group formation around shared objectives.

**Corrections and improvements**
- Distinguish complementary skills from identical skills.
- Define explicit matching rules before applying AI scoring.
- Limit dynamic roles to two or three where appropriate to the matching model.
- Avoid duplicate recommendations and repeatedly rejected matches.
- Treat AI results as recommendations rather than automatic authorization.

**Connection and rendering**
- Render a guided, one-question-at-a-time questionnaire.
- Save responses to the profile and matching records.
- Compare candidates using structured criteria, with Muse Spark assistance where available.
- Send eligible recommendations to Conneckt.
- Create a group only when the defined conditions and required approvals are satisfied.

## 5. Conneckt

**Features**
- Search individual users by identifier.
- Discover potential collaborators.
- Send, accept, and reject connection requests.
- Discover loan and support providers.
- Request individual or group connections with providers.
- Group voting and approval where required.

**Corrections and improvements**
- Separate individual connections from group-provider connections.
- Enforce project visibility and provider eligibility on the server.
- Record request status and the identities of decision-makers.
- Prevent duplicate pending requests.
- Require authorized group approval before proceeding with workflows that need it.

**Connection and rendering**
- Render separate Individual and Group sections.
- Connect individual searches to profiles and connection-request records.
- Connect group requests to group memberships, provider profiles, and approval records.
- Open the appropriate profile or request detail page instead of linking to nonexistent routes.

## 6. Chat

**Features**
- Individual conversations.
- Group conversations.
- Conversations with applicable loan providers.
- Conversations with applicable support providers.
- Message history and read status.
- Unread-message counts and real-time updates.

**Corrections and improvements**
- Persist messages before reporting successful delivery.
- Enforce conversation membership and access permissions.
- Use pagination for long message histories.
- Synchronize read states and unread counts.
- Handle reconnection and duplicate message submissions.
- Do not create a provider conversation before its required connection or authorization exists.

**Connection and rendering**
- Use Socket.IO for real-time communication.
- Use PostgreSQL for persistent conversations, messages, membership, and read states.
- Render separate Individual and Group conversation lists.
- Open an existing authorized conversation when selected.
- Display actual unread counts, such as Chat (4), only when four unread messages exist under the configured counting rule.

## 7. Wallet

**Features**
- Individual self-funding.
- Group contributions.
- Targeted and general savings.
- Provider funding.
- Transaction history.
- Balances, transfers, and approvals.
- Savings thresholds and notifications.

**Corrections and improvements**
- Use an auditable transaction ledger.
- Never treat an uploaded document or AI-parsed result as proof of a completed payment.
- Require validation and appropriate approval before recording financial transactions.
- Prevent duplicate processing, double spending, and unauthorized withdrawals.
- Separate personal balances from group balances.
- Define provider funding, repayment, and transfer states explicitly.

**Connection and rendering**
- Render Individual Funding, Group Funding, and Provider Funding as separate sections.
- Connect each section to its own authorized transaction queries and workflow.
- Store supporting documents in private object storage.
- Use Muse Spark to extract proposed transaction information, then validate and approve it.
- Update balances through authorized database transactions only.

## 8. Plans

**Features**
- Individual Basic and Super plans.
- Group Basic and Super plans.
- Provider Basic and Super plans.
- Plan-specific features and access restrictions.

**Corrections and improvements**
- Treat the specified prices as configurable proposed prices.
- Define the benefits of each plan.
- Enforce subscription entitlements on the server.
- Verify payments before activating paid access.
- Record subscription status, changes, and payment history.

**Connection and rendering**
- Render plans according to the user's account category.
- Connect plan selection to subscription records and the configured payment workflow.
- Enforce private-project access according to verified subscription entitlements.

## 9. Action & Scheduled Automation

**Features**
- Voice and text instructions.
- Scheduled messages and profile changes.
- Timezone-aware execution.
- Pre-action notifications.
- Completion and failure summaries.
- Action history.

**Corrections and improvements**
- Require users to review and confirm interpreted actions before scheduling consequential operations.
- Store schedules independently of the user's device.
- Use a durable background job worker.
- Prevent duplicate execution through idempotency controls.
- Record retries, results, and execution timestamps.
- Allow cancellation or editing when the action has not yet executed.

**Connection and rendering**
- Use Muse Voice to transcribe supported audio.
- Use Muse Spark to interpret the instruction into a structured action.
- Render the proposed action for review before saving.
- Store the action, schedule, timezone, and status in PostgreSQL.
- Execute through a background worker and send relevant emails through Nodemailer.

## 10. Notifications

**Features**
- Chat notifications.
- Connection requests and decisions.
- Group approvals.
- Matching opportunities.
- Funding and wallet updates.
- Project analysis results.
- Scheduled action reminders and outcomes.
- Account security alerts.

**Corrections and improvements**
- Persist notification records.
- Separate unread status from email-delivery status.
- Link each notification to an existing authorized resource.
- Retry failed email deliveries without duplicating business operations.
- Calculate counts from actual unread records.

**Connection and rendering**
- Use PostgreSQL for notification records.
- Use Socket.IO for real-time updates.
- Use Nodemailer for applicable email notifications.
- Render a notification list with read/unread states and working links.
- Display counts such as Notifications (16) only when supported by actual data.

## 11. Project & Idea Development

**Features**
- Project and idea submission.
- Idea projection feed or carousel.
- Contributions and replies.
- Likes or reactions.
- Consolidated feedback.
- AI-assisted project analysis.
- Project document generation.
- Version history and re-analysis.

**Corrections and improvements**
- Preserve original ideas and individual contributions.
- Store analysis versions instead of overwriting previous results.
- Distinguish verified external research from AI-generated assumptions.
- Do not invent competitors, market figures, sources, or project statistics.
- Restrict project visibility according to its privacy setting.

**Connection and rendering**
- Render ideas in a navigable feed or carousel.
- Connect contributions and replies to their respective project records.
- Use Muse Spark for structured analysis and project document generation.
- Store project versions, contributions, and analysis results in PostgreSQL.
- Notify authorized participants when analysis is complete.
- Link results to the actual project and its discussion.

## 12. Requests & Agreements

**Features**
- Individual or group funding requests.
- Project visibility settings.
- Provider discovery and connection.
- Project summaries for providers.
- Agreement creation and document upload.
- Review, acceptance, and rejection.
- Funding request status tracking.

**Corrections and improvements**
- Require owner or authorized group approval before submission.
- Show providers only the information permitted at the current stage.
- Keep private project details protected.
- Store agreement versions and acceptance records.
- Separate agreement acceptance from actual funding completion.
- Do not claim legal registration without a supported registration process.

**Connection and rendering**
- Connect requests to projects, owners, providers, and group approvals.
- Render request status and permitted project summaries.
- Store agreements in private object storage and their metadata in PostgreSQL.
- Connect accepted agreements to the appropriate funding workflow.

## 13. Proof & Document Parsing

**Features**
- PDF and supported document uploads.
- Pasted transaction messages.
- Project notes and supporting evidence.
- Structured data extraction.
- Review and correction of extracted information.

**Corrections and improvements**
- Validate file size, type, and permissions.
- Preserve the original source document.
- Validate AI-generated JSON against Zod schemas.
- Require verification for consequential financial or legal data.
- Record processing failures and permit safe retries.

**Connection and rendering**
- Render the parsing workflow within Wallet, Project, and Request where appropriate.
- Store files in private object storage.
- Use Muse Spark for supported extraction and classification.
- Save approved results to the correct database entities.
- Preserve the source document and processing history.

## 14. Settings

**Features**
- Profile updates.
- Account security.
- Session management.
- Account deactivation.
- Account deletion.
- Notification preferences where implemented.

**Corrections and improvements**
- Keep deactivation separate from permanent deletion.
- Require appropriate confirmation for destructive actions.
- Revoke relevant sessions after security-sensitive changes.
- Apply defined data-retention and deletion rules.
- Use AI-assisted field updates only with user review.

**Connection and rendering**
- Render settings in organized sections.
- Connect profile settings to profile records and authentication settings to the authentication service.
- Connect deactivation and deletion to protected server-side workflows.
- Provide clear success, failure, and confirmation states.

## 15. System Administration

**Features**
- User and role management.
- Group and project oversight.
- Provider and funding-request oversight.
- Moderation.
- Audit logs.
- Controlled system configuration.

**Corrections and improvements**
- Enforce administrator permissions on the server.
- Record sensitive administrative actions.
- Restrict access to private messages and financial information.
- Separate administrative duties where necessary.
- Do not rely on client-side role flags.

**Connection and rendering**
- Render a separate protected administration area.
- Connect administrative screens to authorized server-side services.
- Store audit events in the database.
- Return only information permitted by the administrator's role.

## 16. Privacy, Terms & Agreement

**Features**
- Privacy Policy.
- Terms of Service.
- User Agreement.
- Third-party service disclosures.
- AI and cloud-processing disclosures.
- Consent records.

**Corrections and improvements**
- Keep legal documents versioned.
- Require explicit consent where required.
- Store acceptance timestamps and document versions.
- Explain responsibilities for malicious links and credential sharing.
- Do not assume that reading a document proves acceptance.

**Connection and rendering**
- Render the legal documents during registration before the required acceptance.
- Keep the checkbox unchecked until the user explicitly accepts.
- Connect consent to persistent legal-consent records.
- Block account creation when mandatory acceptance is missing.

## 17. Logout

**Features**
- End the authenticated session.
- Clear the relevant session cookie.
- Redirect to authentication.

**Corrections and improvements**
- Revoke the server-side session where applicable.
- Ensure protected pages cannot be accessed through an invalid session.
- Do not clear unrelated user data or unfinished work without an explicit policy.

**Connection and rendering**
- Connect logout to the authentication service.
- Redirect to the login page after successful session termination.
- Revalidate protected routes on subsequent requests.

## 18. Application Entry Point & PWA

**Features**
- Installable application.
- Authentication-first startup.
- Responsive rendering.
- Controlled offline behavior.
- Static asset caching.

**Corrections and improvements**
- Do not render the public landing page as the initial application screen.
- Validate an existing session before rendering private pages.
- Never cache sensitive API responses publicly.
- Provide an offline message when server-dependent actions cannot complete.

**Connection and rendering**
- Use Next.js for routing and server rendering.
- Use Serwist for service-worker and PWA behavior.
- Render authentication for unauthenticated sessions and the dashboard for valid authenticated sessions.
- Use Tailwind CSS for responsive layouts.

---

# 19. Required Shared System Connections

| Shared system | Connected modules | Responsibility |
|---|---|---|
| Authentication and authorization | All protected modules | Establish identity and enforce permissions. |
| PostgreSQL and Drizzle ORM | All data-backed modules | Persist authoritative records and maintain relationships. |
| Object storage | Wallet, Project, Request, Profile where needed | Store protected files and supporting documents. |
| Muse Spark | Matching, Profile, Project, Wallet parsing, Action | Interpret or analyze data within authorized workflows. |
| Muse Voice | Profile, Project, Action | Transcribe spoken input. |
| Nodemailer and Google SMTP | Authentication, Notifications, Action, Project, Request | Deliver verification, security, reminder, and workflow emails. |
| Socket.IO | Chat, Notifications, Conneckt, Group activity | Deliver authorized real-time events. |
| Background job worker | Action, email delivery, document processing | Execute durable asynchronous operations. |
| Zod | API requests, forms, AI outputs, server actions | Validate data before it enters sensitive workflows. |
| Upstash Redis and rate limiting | Authentication, search, OTP, APIs | Control request frequency and selected temporary state. |
| Audit logging | Wallet, Request, Settings, Administration | Maintain records of sensitive operations. |

# 20. Rendering and Connection Rules

1. Every page must have a defined route and purpose.
2. Every button must perform a real action or be clearly disabled.
3. Every navigation link must lead to an implemented page.
4. Every form must have validation, a submission workflow, and feedback.
5. Every persistent action must be processed through an authorized server-side workflow.
6. Every displayed count, balance, status, and profile detail must come from a trusted source.
7. Every real-time event must reflect an authorized and appropriately persisted operation.
8. Every AI-generated result must be validated before it is used in a consequential workflow.
9. Every private resource must be checked against the current user's permissions.
10. Every failed operation must communicate its actual status and preserve recoverable user input.
