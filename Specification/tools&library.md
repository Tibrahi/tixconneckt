# TIXCONNECKT — Tools & Libraries

| Tool / Library | Application Area | Role in TIXCONNECKT |
|---|---|---|
| Next.js | Application framework | Routing, server rendering, API endpoints, authentication pages, and dashboard pages. |
| React | UI development | Component-based rendering and interactive interfaces. |
| TypeScript | Entire application | Type safety for frontend, backend, database models, and integrations. |
| Tailwind CSS | UI styling | Responsive layouts, blue interactive elements, pure white backgrounds, and black text. |
| Inter (Google Fonts) | Main typography | Headings, body text, labels, forms, and interface content. |
| IBM Plex Mono (Google Fonts) | Technical typography | User identifiers, timestamps, transaction references, and technical values. |
| Font Awesome | Icons | Navigation, actions, status indicators, notifications, and interface controls. |
| Neon PostgreSQL | Database | Persistent storage for users, profiles, groups, connections, chats, wallets, projects, requests, notifications, and audit records. |
| Drizzle ORM | Database access | Typed queries, schema definitions, relationships, and transactions. |
| Drizzle Kit | Database management | Schema generation, migrations, database synchronization, and database inspection. |
| Better Auth | Authentication | Registration, login, session management, account security, and authentication workflows. |
| jose | Token security | JWT and cryptographic token operations where required by authentication or integrations. |
| Nodemailer | Email delivery | Verification emails, OTPs, password recovery, security alerts, and system notifications. |
| Google SMTP | Email transport | Sends system-generated emails through configured Google email credentials. |
| Muse Spark | AI processing | Profile interpretation, collaborator matching assistance, project analysis, idea refinement, and document parsing. |
| Muse Voice | Voice processing | Voice transcription and conversion of spoken instructions into text for profile updates, projects, and scheduled actions. |
| Zod | Data validation | Validates form inputs, API requests, AI-generated structured data, and database-bound values. |
| React Hook Form | Form management | Registration, profile editing, matching questionnaires, funding requests, and settings forms. |
| DOMPurify | Content sanitization | Sanitizes untrusted HTML in project content, messages, and user-submitted material where HTML rendering is permitted. |
| Socket.IO | Real-time communication | Live chat, notification updates, connection events, and group activity. |
| WebRTC | Peer communication | Direct audio/video communication if required by the implemented communication workflows. |
| MeshP2P | Peer networking | Peer-to-peer communication workflows where applicable to the system. |
| Serwist | Progressive Web App | Service worker, installable application support, and controlled caching for compatible devices. |
| Upstash Redis | Temporary shared state | Rate-limit counters, caching, and coordination for selected short-lived operations. |
| Upstash Rate Limit | API protection | Limits authentication attempts, OTP requests, search requests, and other sensitive endpoints. |
| Object Storage | File management | Stores uploaded documents, transaction proofs, project attachments, and agreement files. |
| libphonenumber | Phone validation | Validates and normalizes phone numbers according to country calling codes. |
| World Countries data | Country selection | Provides country names and country metadata for registration and profile forms. |
| Browser Geolocation API | Location detection | Requests user permission to obtain location where needed for registration or profile information. |
| Intl API | Internationalization | Formats currencies, dates, numbers, and locale-sensitive values. |
| date-fns-tz | Timezone handling | Converts and displays dates for scheduled actions, reminders, and user-specific timezones. |
| Frankfurter | Currency conversion | Retrieves supported exchange rates for displaying currency conversions when needed. |
| Driver.js | Guided onboarding | Guides users through dashboard navigation, matching, project creation, and other workflows. |
| SVG | Badge rendering | Displays earned profile badges and group or project achievement indicators. |
| Background Job Queue / Worker | Scheduled processing | Executes scheduled actions, retries failed jobs, and processes asynchronous tasks independently of the user's device. |
| Vitest | Unit and integration testing | Tests business logic, validation, matching rules, and application services. |
| Playwright | End-to-end testing | Tests authentication, navigation, chat, funding workflows, and complete user journeys. |
| ESLint | Code quality | Detects common code errors and enforces project linting rules. |
| Prettier | Code formatting | Maintains consistent formatting across the codebase. |
| dotenv / Environment Configuration | Secrets management | Loads local environment configuration and supports server-side integration settings. |
| Git | Version control | Tracks source changes, collaborative development, and release history. |

## Package Scripts — Database & Development

| Command | Role |
|---|---|
| `dev` | Starts the local development server. |
| `build` | Builds the production application. |
| `start` | Starts the production server. |
| `lint` | Checks code quality. |
| `typecheck` | Checks TypeScript types. |
| `test` | Runs automated tests. |
| `db:generate` | Generates database migration files. |
| `db:migrate` | Applies database migrations. |
| `db:push` | Synchronizes the configured database schema. |
| `db:studio` | Opens the database inspection interface. |
| `db:seed` | Loads explicitly defined development or test records. |

## Core Library Mapping

- **Authentication:** Better Auth + jose + Nodemailer + Google SMTP.
- **Database:** Neon PostgreSQL + Drizzle ORM + Drizzle Kit.
- **Matching and AI:** Muse Spark + Muse Voice + Zod.
- **Chat and notifications:** Socket.IO + PostgreSQL + Nodemailer.
- **Wallet and funding:** PostgreSQL + Drizzle ORM + Object Storage + Zod.
- **Projects and document parsing:** Muse Spark + Object Storage + Zod + PostgreSQL.
- **Scheduled actions:** Muse Voice + Muse Spark + background job worker + PostgreSQL + Nodemailer.
- **PWA and responsive interface:** Next.js + React + Tailwind CSS + Serwist.
- **Security and performance:** Better Auth + Upstash Redis + Upstash Rate Limit + server-side validation.
- **Internationalization:** libphonenumber + World Countries data + Intl + date-fns-tz + Frankfurter.
- **Testing and maintenance:** Vitest + Playwright + ESLint + Prettier.

