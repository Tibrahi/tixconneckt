# Fix System Reliability, Eliminate Recurring 503 Errors, Implement Automatic Database Synchronization, and Redesign the Connection & Provider Discovery System

Act as a senior full-stack engineer, backend architect, database specialist, and UI/UX engineer.

Your task is to conduct a complete investigation of the existing application, identify the root causes of its reliability and communication problems, and implement permanent, production-ready solutions.

**IMPORTANT:** Do not simply hide errors, add retry buttons, introduce artificial delays, or apply temporary workarounds. Investigate the underlying architecture and fix the actual causes.

Preserve the existing application architecture, features, design language, authentication system, and database structure wherever possible. Avoid breaking existing functionality.

---

# PART 1: FIX SYSTEM COMMUNICATION AND USER FEEDBACK

## Current problems

- Users share or submit projects, but the interface remains stuck on a loading state.
- The system does not communicate properly with users about whether an operation succeeded or failed.
- Users sometimes complete an action successfully, but the interface does not display a success message.
- Loading indicators remain visible longer than necessary.
- Users are left uncertain about whether their actions were completed.

## Required implementation

1. Audit all user-facing operations, including:
   - Project creation and sharing.
   - Project updates.
   - Connection requests.
   - Accepting and rejecting connection requests.
   - Profile updates.
   - Provider interactions.
   - Database-related operations.

2. Implement a consistent operation lifecycle:
   - Idle.
   - Loading.
   - Success.
   - Error.

3. When a user submits or shares a project:
   - Immediately provide appropriate visual feedback.
   - Disable duplicate submissions while the request is processing.
   - Confirm success immediately after the backend confirms the operation.
   - Display a clear success notification.
   - Update the relevant UI without requiring a manual refresh.
   - Reset loading states correctly.

4. If an operation fails:
   - Display a meaningful error message.
   - Preserve user-entered information where possible.
   - Allow safe retrying.
   - Never display a success message before the backend confirms success.

5. Prevent infinite loading states.
   - Implement request timeouts where appropriate.
   - Handle rejected promises and unexpected responses.
   - Ensure loading states are cleared in all success and failure paths.

**Expected result:** Every user action must have clear, accurate, and immediate feedback. Users should never have to guess whether an operation succeeded.

---

# PART 2: PERMANENTLY FIX THE RECURRING HTTP 503 ERRORS

## Current problems

The application repeatedly encounters HTTP 503 errors.

The behavior appears to involve database refresh or synchronization operations interfering with an already active database connection.

The system sometimes behaves as if it needs to refresh or reconnect the database while the database is already operational.

It then returns a 503 error and asks the user to retry.

This is unacceptable for a production application.

## Required investigation

Perform a complete audit of:

- Database connection lifecycle.
- Connection pooling.
- Database initialization.
- Database health checks.
- Automatic reconnection mechanisms.
- Background synchronization processes.
- Concurrent database operations.
- API request handling.
- Serverless connection management, if applicable.
- Database transaction handling.
- Rate limits and connection limits.
- Backend deployment and infrastructure configuration.

Identify the actual source of the recurring 503 errors before implementing changes.

## Required permanent solutions

### A. Intelligent database connection management

Implement a stable database connection management strategy.

- Reuse healthy database connections.
- Do not unnecessarily recreate active connections.
- Prevent multiple simultaneous database initialization processes.
- Implement connection pooling where supported.
- Avoid creating a new database connection for every request.
- Properly release connections after operations.
- Handle stale or disconnected connections safely.
- Prevent connection leaks.

### B. Background database synchronization

Implement automatic database synchronization without interrupting active users.

The system should:

- Synchronize data automatically in the background.
- Detect whether synchronization is already running.
- Prevent duplicate synchronization jobs.
- Avoid blocking normal database reads and writes.
- Use incremental synchronization whenever possible.
- Update only changed records instead of repeatedly refreshing everything.
- Use transactions and appropriate locking strategies.
- Ensure users can continue using the application during synchronization.

**Critical requirement:** Database synchronization must not interrupt normal application operations.

### C. Intelligent recovery mechanisms

If a database connection genuinely becomes unavailable:

- Detect the problem.
- Recover the connection automatically.
- Use controlled exponential backoff with jitter.
- Avoid aggressive repeated reconnection attempts.
- Queue or retry only operations that are safe to retry.
- Use idempotency protection for write operations.
- Preserve transaction consistency.
- Return meaningful errors only when recovery is unsuccessful.

Do not automatically retry non-idempotent operations without protection against duplicate execution.

### D. Fix the source of HTTP 503

Investigate why the backend returns 503 instead of handling normal database activity reliably.

Check whether:
- Database refresh operations are incorrectly triggering service unavailability.
- Health checks are creating unnecessary database connections.
- Multiple background jobs are competing for resources.
- Database connection limits are being exceeded.
- API requests are being blocked by synchronization.
- Infrastructure health checks are incorrectly marking healthy services as unavailable.

Fix the actual issue.

**Expected result:** Normal application activity must not produce recurring 503 errors. Users should not need to manually refresh the page or repeatedly click retry because of internal database synchronization.

---

# PART 3: IMPLEMENT AUTOMATIC UI AND DATA REFRESH

The application currently does not automatically refresh its data, causing stale information and unnecessary 503-related recovery behavior.

Implement a reliable synchronization strategy between the backend and frontend.

Requirements:

1. Automatically update relevant application data after successful operations.
2. Reflect changes made by other users without requiring a full page reload.
3. Use real-time subscriptions where supported by the existing infrastructure.
4. Otherwise, use efficient polling with appropriate intervals.
5. Refresh only the affected data instead of reloading the entire application.
6. Prevent overlapping refresh requests.
7. Cancel unnecessary requests when components are unmounted.
8. Handle offline and reconnect scenarios.
9. Avoid unnecessary database queries.
10. Ensure background updates do not interrupt user interactions.

The system must distinguish between:
- Initial page loading.
- Background synchronization.
- User-triggered actions.
- Reconnection after temporary network loss.

Background synchronization must never cause the entire page to enter a loading state.

---

# PART 4: REDESIGN THE CONNECTION PAGE

Create a structured connection discovery experience with separate sections for connections, providers, and recommended users.

The interface must be lightweight, responsive, and optimized for database performance.

## A. Connected section

Create a dedicated section named **Connected**.

Display users with whom the current user already has an accepted connection.

Requirements:
- Show connected users.
- Display profile pictures, names, and relevant professional information.
- Provide access to their public profiles.
- Include appropriate connection management actions.
- Load data efficiently.
- Update the section automatically when a connection is accepted or removed.

Do not mix pending requests or recommendations with accepted connections.

## B. Public users section

Create a dedicated section for users who have explicitly enabled public profile visibility.

Requirements:

- Retrieve users who have opted into public profile visibility.
- Display their public profiles in the discovery area.
- Show a lightweight preview containing:
  - Profile picture.
  - Name.
  - Professional title or role.
  - Relevant skills or expertise.
  - A profile-view action.
  - A connection-request action where appropriate.

### Performance requirements

Do not load the entire user database.

Instead:

- Load an initial batch of only 5 users.
- Fetch additional users when needed.
- Use server-side pagination.
- Use efficient database queries and indexes.
- Avoid retrieving unnecessary profile fields.
- Exclude the current user.
- Exclude users already connected.
- Exclude users with pending connection requests where appropriate.
- Respect profile visibility and privacy settings.

The initial display must remain lightweight.

---

# PART 5: PROVIDER DISCOVERY AND VISIBILITY MANAGEMENT

Create a separate **Providers** section inside the connection/discovery experience.

This section must distinguish between providers who have chosen to make their profiles public and those who have chosen private visibility.

## A. Provider public/private setting

Allow providers to choose between:

- Public provider profile.
- Private provider profile.

This preference must be configurable from their profile or provider settings.

The system must save the preference in the database and enforce it consistently across all discovery queries.

### Public providers

Providers who choose public visibility should:

- Appear in the Providers discovery section.
- Be discoverable by other users.
- Have their permitted public profile information displayed.
- Be available for connection requests according to the connection rules.

### Private providers

Providers who choose private visibility must:

- Not appear in the general provider discovery listing.
- Not be discoverable through private provider listings.
- Retain control over their connection requests.
- Still be able to discover and respond to publicly shared projects.

**Important:** Private visibility must not prevent providers from participating in public project opportunities.

---

# PART 6: PUBLIC PROJECT DISCOVERY FOR PRIVATE PROVIDERS

Implement the following workflow carefully.

This is a critical business requirement.

A provider who has selected a private profile must still be able to discover public projects.

## Required workflow

1. A normal user creates and publishes a project.
2. The project becomes publicly visible according to the application's project visibility rules.
3. The published project appears in the relevant public project discovery feed.
4. Private providers can browse and discover these publicly published projects.
5. A private provider can open a project and review its publicly available details.
6. The provider can express interest or request to connect with the project owner.
7. The project owner receives a notification or connection request.
8. The project owner can accept or reject the request.
9. If accepted, the appropriate connection or project collaboration relationship is established.

### Important privacy rules

- Private provider status must not make their profile publicly discoverable.
- A private provider's participation in a project must not automatically change their profile visibility to public.
- Public project visibility and provider profile visibility must be treated as two separate permissions.
- Only explicitly permitted provider information should be visible to project owners.
- Do not expose private contact details or sensitive profile information.
- Prevent duplicate interest submissions and duplicate connection requests.

**Expected result:** Providers can remain private while still discovering public opportunities and initiating legitimate professional connections.

---

# PART 7: RECOMMENDED USERS SECTION

Create a dedicated section named **Recommended Users**.

This section should suggest users who may be relevant to the current user.

Requirements:

- Recommend users with public profiles.
- Exclude the current user.
- Exclude already connected users.
- Exclude blocked users.
- Exclude users with existing pending requests.
- Consider professional role, skills, expertise, interests, or other relevant matching fields already available in the application.

### Display and pagination

- Display a maximum of 10 recommended users per page.
- Use server-side pagination.
- Provide Next and Previous navigation.
- Do not retrieve all users before applying pagination.
- Keep the recommendation query efficient.
- Avoid repeating the same users unnecessarily.
- Provide an appropriate empty state if no recommendations are available.

The system should initially load only the necessary data.

---

# PART 8: PROVIDER RECOMMENDATIONS

Create a separate recommendation experience for providers.

Requirements:

- Recommend providers who have explicitly enabled public visibility.
- Never include private providers in public provider recommendations.
- Use available skills, service categories, expertise, or other relevant matching criteria.
- Exclude already connected providers.
- Exclude blocked profiles.
- Exclude providers with pending requests.
- Display a maximum of 10 providers per page.
- Implement server-side pagination.
- Avoid loading the complete provider database.

Private providers must never leak into the public recommendations through caching, search, API responses, or frontend filtering.

---

# PART 9: DATABASE AND BACKEND ARCHITECTURE

Before implementation, inspect the current database schema and application architecture.

Reuse existing tables and relationships wherever appropriate.

Do not blindly create duplicate tables or duplicate profile fields.

Verify that the system has appropriate structures for:

- User profiles.
- Provider profiles.
- Profile visibility preferences.
- Connection relationships.
- Connection requests.
- Project publication and visibility.
- Provider project interest.
- Notifications.
- Pagination and recommendation queries.

Implement appropriate database constraints and indexes.

Where supported, enforce privacy rules at the database/API authorization layer, not just through frontend filtering.

Ensure that:

- Users cannot modify another user's visibility settings.
- Private profiles cannot be retrieved through unauthorized API endpoints.
- Connection requests cannot be duplicated.
- Public projects are discoverable by authorized users and providers.
- Accepted connections are represented consistently.
- Deleting or changing visibility does not accidentally expose private information.

---

# PART 10: UI/UX REQUIREMENTS

The redesigned experience must feel professional, fast, and intuitive.

Use the application's existing design system.

### Connection page layout

Organize the page into clearly distinguishable sections:

1. Connected.
2. Public Users.
3. Providers.
4. Recommended Users.
5. Recommended Providers.

Use tabs, navigation, or another layout consistent with the existing application.

### Loading experience

- Use lightweight skeleton loaders.
- Load 5 users initially in discovery sections.
- Do not show full-page loading during background synchronization.
- Avoid unnecessary spinners.
- Show clear empty states.
- Show success and error notifications.
- Preserve the user's current page and scroll position when possible.

### Responsive behavior

Ensure the experience works correctly on:
- Desktop.
- Tablets.
- Mobile devices.

---

# PART 11: TESTING AND ACCEPTANCE CRITERIA

Do not consider the task complete until all critical scenarios have been tested.

## System reliability tests

- Share a project and verify that success is displayed.
- Confirm that loading indicators disappear after completion.
- Submit duplicate requests and verify duplicate protection.
- Simulate a database connection interruption.
- Verify automatic recovery.
- Run background synchronization while users perform normal operations.
- Verify that synchronization does not interrupt database reads and writes.
- Verify that recurring 503 errors caused by the identified issue are eliminated.

## Connection tests

- Verify that accepted connections appear under Connected.
- Verify that only public users appear in Public Users.
- Verify that private users cannot be discovered publicly.
- Verify that only public providers appear in Providers.
- Verify that private providers are excluded from provider recommendations.
- Verify that users cannot see themselves in recommendations.
- Verify that already connected users are excluded.
- Verify pagination and the maximum 10-user display limit.

## Private provider workflow tests

- Set a provider profile to private.
- Publish a project using a normal user account.
- Confirm that the project appears publicly.
- Log in as the private provider.
- Confirm that the provider can discover the project.
- Confirm that the provider can express interest.
- Confirm that the project owner receives the request.
- Accept the request and verify the resulting relationship.
- Confirm that the provider profile remains private.

## Security tests

- Attempt to retrieve a private provider through public API endpoints.
- Attempt to modify another user's visibility preference.
- Attempt to access private contact information.
- Attempt to create duplicate connection requests.
- Verify backend authorization independently of frontend behavior.

---

# PART 12: IMPLEMENTATION RULES

Follow these rules throughout the task:

1. Start by examining the existing codebase and understanding its architecture.
2. Identify the root causes before modifying code.
3. Create a clear implementation plan.
4. Implement actual working functionality, not mockups or placeholder buttons.
5. Reuse existing components, hooks, services, and database relationships wherever appropriate.
6. Avoid unnecessary dependencies.
7. Do not introduce duplicate database connections or background synchronization jobs.
8. Do not solve 503 errors by simply hiding error messages.
9. Do not solve loading problems by setting arbitrary loading timeouts.
10. Do not expose private profiles through public queries or cached responses.
11. Do not break existing authentication, project management, or provider functionality.
12. Use proper error handling, logging, and monitoring.
13. Add database migrations only when necessary.
14. Keep all changes compatible with the existing deployment environment.
15. Test the implementation before declaring it complete.

---

# FINAL DELIVERABLE

After implementation, provide:

1. Root causes identified.
2. Explanation of the recurring 503 errors.
3. Files and components modified.
4. Database changes and migrations.
5. Backend/API changes.
6. Frontend/UI changes.
7. Synchronization and recovery strategy.
8. Privacy and security improvements.
9. Tests performed and their results.
10. Any remaining limitations or infrastructure issues.

**FINAL SUCCESS CONDITION:**

The application must operate reliably without recurring database-related 503 interruptions, automatically synchronize data without disturbing active users, communicate clearly after every user action, and provide an efficient, secure connection and provider discovery experience.

Do not declare success merely because the code compiles. Verify the actual end-to-end workflows and demonstrate that each requirement works.