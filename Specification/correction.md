# TIXCONNECKT —  System Correction and Implementation Prompt

## 1. Main Objective

Refactor and complete the existing TIXCONNECKT platform into a fully functional, secure, flexible, AI-powered digital collaboration system. Inspect the existing codebase, identify incomplete features and incorrect implementations, fix the underlying issues, and preserve working functionality.

The platform should help people discover digital projects, find collaborators, contribute skills, join teams, solve digital problems, and seek relevant funding or technical support.

**Critical architectural requirements:**
- Use a JSON-first, schema-flexible data architecture for user-defined and AI-generated information.
- Never hardcode Muse Spark or Muse Voice input fields, form layouts, output fields, or document structures.
- Allow users and AI processing to introduce new fields dynamically without requiring database schema migrations for every new field.
- Persist actual user data and AI-generated results in the database, then render the saved data accurately.
- Replace simulated functionality, fabricated data, fake success states and generic errors with real, verifiable system behavior.
- Launch the application at the login page for unauthenticated users, not the welcome page.

## 2. JSON-First Database Architecture

Design the application around flexible JSON documents rather than requiring every user-defined field to have its own predefined database column.

Use PostgreSQL JSONB as the primary storage format for flexible entities, configurable data, user-defined fields, dynamic form definitions, AI inputs and outputs, parsed document details, project-specific attributes and other evolving information.

Do not require developers to alter the database schema every time a user creates a new field.

### Flexible record structure

Each flexible record should support:
- A unique record ID.
- Record type or entity type.
- Owner or creator ID.
- Access-control and visibility metadata.
- A JSONB document containing dynamic fields and nested values.
- Creation and update timestamps.
- A record version or revision identifier.
- Optional processing status and provenance metadata.

Store the actual flexible attributes inside the JSONB document. Use a generic record structure where appropriate, rather than creating a new database table for every user-defined entity type.

Example conceptual JSON document:

{
  "recordType": "digital_project",
  "title": "Community Learning Platform",
  "description": "A platform for collaborative online learning.",
  "skillsNeeded": ["frontend", "backend", "UX design"],
  "customFields": {
    "preferredFramework": "Next.js",
    "collaborationSchedule": "Flexible",
    "additionalRequirements": {
      "language": "English",
      "experienceLevel": "Intermediate"
    }
  }
}

This example is illustrative only. Do not make these fields mandatory or use them as a fixed schema for all projects.

### Dynamic fields

When a user adds a new field:
1. Accept the field name, value and optional metadata.
2. Validate the field name, data type, size and permissions.
3. Save the new field within the appropriate JSONB document.
4. Update the record revision.
5. Return the updated record from the server.
6. Render the new field immediately using the stored data.
7. Ensure the field remains present after refresh, sign-in and subsequent edits.

Support nested objects, arrays, text, numbers, booleans, dates, enumerated values, file references and other validated data types.

Do not silently discard unknown fields during updates. Preserve existing values and merge intentional changes safely.

### Important database distinction

Use JSONB for flexible application data, but retain relational columns and constraints where they are necessary for security, identity, relationships, indexing, transactions and reliable querying.

Core entities such as users, sessions, memberships, message delivery records and payment transactions may require relational structure. Do not force every operational record into one enormous JSON object.

The requirement is a **JSON-first flexible data model**, not the removal of all relational database capabilities.

## 3. Muse Spark — Fully Dynamic AI Interaction

Integrate Muse Spark as an AI service whose required inputs and outputs are determined dynamically for each task.

Never hardcode:
- Prompt-specific form fields.
- Fixed question lists.
- Fixed document field names.
- A single permanent input schema for every task.
- A single output structure for every AI response.
- Fixed assumptions about what information the user must provide.

### Required behavior

1. Identify the user's actual goal and the context of the current task.
2. Determine what information is already available from the user's request, profile, project, uploaded files and previous permitted interactions.
3. Determine which additional information is genuinely necessary.
4. Dynamically produce an appropriate set of questions or input controls only when required.
5. Render those controls from a validated, machine-readable field definition.
6. Allow the user to add custom fields or supply additional context.
7. Submit the actual collected input to the configured Muse Spark integration.
8. Validate the returned output, preserve its structure and save it in JSONB.
9. Render the saved output dynamically without assuming that every response contains the same fields.
10. Allow users to edit, extend, regenerate or remove permitted output fields.

If sufficient information is already available, do not force the user through unnecessary questions.

If the AI service is unavailable, show an honest error state and preserve the user's input. Never simulate an AI result.

### AI-generated form definitions

An AI-generated form definition should be treated as data, not executable code. It may specify field labels, descriptions, types, required status, options, defaults and validation constraints.

Validate the generated definition against a safe form-definition contract before rendering it. Reject unsupported field types, unsafe constraints and executable markup.

Muse Spark may propose fields, but the server must enforce authorization, validation and security.

## 4. Muse Voice — Dynamic Inputs and Outputs

Muse Voice must follow the same flexible data architecture.

Do not hardcode a permanent list of voice inputs, transcription fields, response fields, task forms or result properties.

Determine the required inputs from the actual voice task, such as voice interaction, transcription, summarization, structured extraction or another supported operation.

Depending on the selected task and the configured service capabilities, inputs may include:
- Audio or microphone capture.
- An uploaded audio file.
- Optional contextual information.
- User-defined fields.
- Task instructions or processing preferences.

These are possible input types, not a mandatory fixed form.

### Voice processing workflow

1. Determine the requested voice task.
2. Ask only for information the task requires.
3. Request microphone permission when needed and explain why.
4. Capture or upload audio using a supported, secure mechanism.
5. Store the audio file in object storage and its reference and metadata in PostgreSQL.
6. Submit the audio and relevant context to the configured Muse Voice integration.
7. Validate and persist the resulting transcript, structured output, metadata or other supported results as JSONB.
8. Render the actual result according to its returned structure.
9. Allow authorized edits and follow-up interactions.
10. Preserve the task status and recoverable input if processing fails.

Do not assume Muse Voice supports capabilities that the configured API does not expose. Inspect its actual interface and implement only supported operations.

## 5. Dynamic Document Parsing and Field Creation

Document parsing must not depend on a fixed list of expected fields.

When a user uploads a document:
1. Store the original file securely.
2. Extract available text and document metadata using the appropriate parser.
3. Send relevant content to the configured AI service when AI interpretation is required.
4. Identify the information actually present in the document.
5. Generate a structured JSON result based on the document's contents and the user's goal.
6. Preserve fields that do not fit existing predefined categories.
7. Allow users to review, edit, add, rename or remove extracted fields.
8. Save the approved structured data as JSONB.
9. Render the complete saved result dynamically.

If parsing identifies a previously unknown field, create that field in the JSON document without requiring a database migration.

Do not invent information absent from the document. Represent missing or uncertain values explicitly and distinguish extracted information from AI inference.

Store processing metadata such as the source file reference, processing status, parser or model version, timestamps and confidence information where available.

## 6. Dynamic Rendering Across the Entire Platform

Build reusable components that render flexible JSON data according to validated field definitions and safe type inference.

The rendering system must:
- Display known field types using suitable controls.
- Render unknown fields using safe, reasonable defaults.
- Support nested objects and arrays.
- Allow users to add new fields inline.
- Support editing and saving existing values.
- Preserve unknown properties when unrelated fields are updated.
- Display file references as secure attachment links or previews.
- Show processing status, empty states, validation errors and save confirmation.
- Handle malformed or unsupported data without crashing the page.
- Enforce permissions before displaying private fields.

Do not build a separate hardcoded page for every possible AI-generated output structure. Use reusable dynamic renderers and task-specific presentation rules where genuinely necessary.

Never render untrusted AI-generated HTML directly. Sanitize content and use safe text rendering.

## 7. Fast and Reliable JSON CRUD

Optimize flexible data operations without compromising correctness.

- Use appropriate JSONB operators and indexes for common query patterns.
- Use targeted updates to modify individual JSON paths when safe.
- Avoid repeatedly loading and rewriting enormous documents for small changes.
- Use transactions for changes involving multiple records.
- Use optimistic concurrency or record revisions to prevent accidental overwrites.
- Use pagination for lists and large nested collections.
- Use connection pooling and efficient database queries.
- Return only the fields required by each operation.
- Use optimistic UI updates with rollback when the server rejects a change.
- Move slow AI processing, document parsing and notifications into background jobs.
- Cache only appropriate data and invalidate cached results after relevant updates.
- Measure actual response times and investigate slow operations rather than making unsupported performance claims.

For flexible fields that need frequent filtering or sorting, add appropriate indexes or a deliberate query strategy. Avoid assuming every arbitrary JSON path will be fast automatically.

## 8. Authentication, Launch and Navigation

The application must open at the login page for unauthenticated users.

- `/` redirects unauthenticated users to `/login`.
- `/` redirects authenticated users to `/dashboard`.
- `/login` displays the sign-in interface.
- `/register` displays account creation.
- `/welcome` displays the informational welcome page.
- Protected routes enforce authentication and authorization on the server.
- Successful login navigates to the dashboard.
- Logout invalidates the relevant session and returns the user to login.

The installed PWA must follow the same authentication-aware entry behavior.

Keep a working welcome-page link on the login screen. Do not make the welcome page the initial unauthenticated route.

## 9. Welcome Page — Trustworthy and Relevant

The welcome page must describe only the actual digital collaboration service.

Focus on:
- Finding collaborators for digital projects.
- Joining existing software, web, mobile, AI, data or other digital initiatives.
- Sharing digital project ideas.
- Finding appropriate project partners, technical support or funding opportunities.
- Understanding how registration, matching and collaboration work.

Remove invented statistics, fake testimonials, fabricated partner logos, unsupported security claims and unverified success stories.

Display accurate information about the platform, its purpose, supported features, privacy, terms and available contact or support channels.

State clearly that TIXCONNECKT is being built and identify any features that are still in development. Never imply that an incomplete integration is operational.

## 10. Dashboard and Page Organization

Create a professional, consistent and responsive white-and-blue interface.

- Use a clear navigation sidebar and organized main content.
- Collapse navigation appropriately on smaller screens.
- Use consistent spacing, typography, page headings and component behavior.
- Use blue for primary actions, active navigation and meaningful interaction states.
- Use white backgrounds, accessible contrast and subtle borders.
- Provide consistent loading, empty, success and failure states.
- Render dashboard content from real database records.
- Avoid redundant cards, decorative statistics and unrelated content.
- Use Font Awesome icons consistently.
- Preserve accessible keyboard navigation and focus indicators.

Organize profile, project discovery, matching, project management, chat, groups, funding requests, wallet, notifications, settings and administration into coherent pages.

## 11. Messaging, Groups and Calls

Repair the real backend and user experience for direct messages and group collaboration.

Required capabilities include:
- Persistent direct messages.
- Group creation and membership management.
- Real-time message delivery and reconnect behavior.
- Reactions, replies, sharing and authorized deletion.
- Attachments with secure object-storage references.
- Accurate sending, sent, delivered and read states.
- Typing indicators and presence where supported.
- Audio/video calls using WebRTC, working signaling and required network traversal configuration.
- Appropriate call lifecycle and error handling.

Store messages and relationship data in structures suited to querying and permissions. Flexible message metadata may use JSONB, but core identifiers, sender IDs, conversation IDs, timestamps and delivery state should remain efficiently queryable.

Do not show fake groups, fake messages or simulated call connections. If a capability is not yet implemented, identify it as unavailable.

## 12. Payments

Support the requested payment methods only after each provider is properly integrated:
- Visa.
- Mastercard.
- Binance payment services where supported.
- Supported cryptocurrency payments.
- MTN Mobile Money.
- Airtel Money.

Display the corresponding payment icons next to genuinely available methods.

Store transaction records securely, including provider, amount, currency, status, reference and timestamps. Verify payment events through authenticated server-side provider callbacks. Do not mark payments successful based only on client-side actions.

Never store card security codes, private keys or seed phrases.

## 13. Buttons, Errors and User Feedback

Every button must execute a real action and show a truthful state change.

Examples:
- `Send` → `Sending` → `Sent`, with delivery states shown only when confirmed.
- `Save` → `Saving` → `Saved`.
- `Join group` → `Joining` → `Joined`.
- `Upload` → `Uploading` → `Processing` or `Uploaded`.
- `Pay` → `Processing` → verified payment status.

On failure, preserve input, explain the issue and provide a suitable retry or recovery action.

Replace generic fake errors with structured handling for validation, authentication, authorization, conflicts, network failures, AI failures, document-processing failures and payment-provider failures.

Log technical diagnostics securely on the server. Never expose credentials, stack traces or sensitive data in user-facing errors.

## 14. Guided Tour

Implement a complete, route-aware application tour using Driver.js.

Cover the dashboard, profile, discovery, matching, projects, groups, chat, calls when available, funding, wallet, notifications, settings and privacy.

Wait for the relevant page and element to render before displaying each step. Provide next, back, skip and finish controls. Skip unavailable or inaccessible features rather than pointing to nonexistent UI elements.

## 15. Security and Validation

- Validate all incoming data on the server.
- Validate dynamic field definitions and AI-generated JSON.
- Enforce record-level access control.
- Sanitize user-generated rich text and attachments.
- Restrict upload types and sizes.
- Apply rate limiting and abuse prevention.
- Protect sessions and secrets.
- Prevent unauthorized modification of payment and identity records.
- Audit important administrative and financial actions.
- Maintain schema versioning for flexible documents when their interpretation changes.
- Ensure users can access, export or delete their data according to the platform's privacy rules.

AI-generated field definitions must never be trusted as authorization policies or executable instructions.

## 16. Environment Configuration

Audit `.env` usage and remove unused, duplicate and unnecessary variables.

Keep only the configuration required for database access, authentication, AI services, email, storage, payments, realtime communication, background processing and other integrations actually used.

Validate required variables at startup, document placeholders in `.env.example`, and never expose server-only secrets to the browser.

## 17. Required Implementation Process

Before changing the code:
1. Inspect the existing codebase and current database schema.
2. Identify hardcoded form fields, rigid JSON handling, fixed AI output assumptions, simulated actions, unused environment variables and incomplete integrations.
3. Map existing records and create a safe migration strategy.
4. Preserve valid user data and avoid destructive migrations.

Then:
1. Implement the flexible JSONB data model and safe dynamic CRUD.
2. Implement dynamic Muse Spark and Muse Voice task definitions and output rendering.
3. Implement document parsing and user-approved dynamic field creation.
4. Repair authentication, forms, persistence and error handling.
5. Repair project collaboration, groups, messaging and calls.
6. Implement and verify payment integrations.
7. Improve the welcome page, dashboard, responsive layouts and complete tour.
8. Add automated tests and verify the complete user workflows.

Do not merely generate new UI components or documentation. Make changes in the actual application code, connect the UI to real services, run the available tests, and report any remaining limitations honestly.

## 18. Acceptance Criteria

The implementation is accepted only when:

- Users can add arbitrary supported fields without database schema migrations.
- Newly created fields survive refreshes and subsequent edits.
- Muse Spark and Muse Voice determine task-specific inputs dynamically rather than relying on hardcoded forms.
- AI outputs and parsed documents are validated, saved as JSONB and rendered from actual stored results.
- Existing flexible fields are preserved during unrelated updates.
- CRUD operations have measured, reliable performance.
- The application starts at login for unauthenticated users.
- The welcome page contains no fabricated data or unsupported claims.
- Chat, groups and calls work end to end or clearly state their actual availability.
- Payment status reflects verified provider results.
- Buttons, notifications and errors report real outcomes.
- Security, authorization, data preservation and automated tests are verified.

**Final principle:** TIXCONNECKT must be data-driven rather than field-driven. The application should adapt its forms, document structures and AI results to the user's actual needs, persist those structures safely in JSONB, and render them dynamically—without pretending unsupported capabilities work.