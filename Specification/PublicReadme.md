# MASTER PROMPT: PROFESSIONAL README.md GENERATION, CODEBASE AUDIT & PROJECT OWNERSHIP PROTECTION

## ROLE & OBJECTIVE

Act as a senior software architect, technical documentation engineer, UI/UX analyst, cybersecurity-conscious repository auditor, and open-source licensing advisor.

Your mission is to deeply inspect my entire project repository and generate an exceptionally professional, visually appealing, technically accurate, and comprehensive `README.md`.

Do not generate a generic README based on assumptions.

You MUST first understand the actual codebase, its architecture, features, dashboards, components, responsibilities, dependencies, and workflows.

The final README must accurately represent what the project actually does.

---

## PHASE 1: DEEP PROJECT REPOSITORY AUDIT

Before writing anything, inspect the repository thoroughly.

1. Identify the project name and its primary purpose.
2. Inspect the folder and file structure.
3. Identify the programming languages, frameworks, libraries, and technologies.
4. Examine configuration files and dependency manifests.
5. Inspect the application's entry points.
6. Analyze routing, navigation, authentication, authorization, and middleware.
7. Inspect every dashboard individually.
8. Examine the components, services, hooks, APIs, utilities, and backend logic.
9. Identify database models, relationships, and data flows where applicable.
10. Identify external integrations and third-party services.
11. Inspect existing tests, scripts, and deployment configurations.

### Dashboard-by-dashboard analysis

For EVERY dashboard discovered:

- Identify its name and purpose.
- Explain what it is responsible for.
- Identify its main features.
- Explain what information it displays.
- Identify the actions users can perform.
- Identify the components and services powering it.
- Explain its interactions with other dashboards.
- Identify its user roles and access permissions, if implemented.
- Document its important workflows.

Never invent dashboard functionality.

If something cannot be verified from the code, explicitly identify it as unverified.

---

## PHASE 2: UNDERSTAND THE PROJECT ARCHITECTURE

Create a clear explanation of:

- Overall system architecture.
- Frontend architecture.
- Backend architecture, if applicable.
- Database architecture, if applicable.
- Authentication and authorization.
- API communication.
- State management.
- Routing and navigation.
- Data processing and storage.
- External integrations.
- Security mechanisms.

Include Mermaid diagrams where useful.

Generate an accurate project directory tree, excluding irrelevant folders such as `node_modules`, `.git`, build artifacts, caches, and generated files.

---

## PHASE 3: GENERATE AN EXCEPTIONAL README.md

Create a complete, polished, professional `README.md` with the following structure, adapting sections to the actual project.

### 1. Project Header
- Professional project name.
- Compelling one-paragraph description.
- Relevant technology badges.
- Project status.
- Screenshots or preview images if available.

### 2. Table of Contents
Create a comprehensive clickable Table of Contents.

Every entry must link to its corresponding section using valid Markdown anchor links.

Include nested entries for dashboards and major subsystems.

### 3. About the Project
Explain:
- What the project is.
- The problem it solves.
- Its target audience.
- Its core value proposition.
- What makes it different.

### 4. Key Features
Document actual implemented features.

Separate:
- Core features.
- Dashboard features.
- Administrative features.
- User-facing features.
- Security features.
- Integrations.

Distinguish implemented features from planned features.

### 5. Dashboard Documentation
Create a dedicated subsection for EVERY dashboard.

For each dashboard document:
- Dashboard name.
- Purpose.
- Responsibilities.
- Main functionality.
- Available actions.
- Related components.
- Access permissions.
- Relevant workflows.

### 6. Technology Stack
Organize technologies by:
- Frontend.
- Backend.
- Database.
- Authentication.
- APIs.
- Infrastructure.
- Development tools.

Only list technologies actually discovered in the repository.

### 7. System Architecture
Provide:
- Architecture overview.
- Mermaid architecture diagram.
- Data-flow explanation.
- Component relationships.

### 8. Project Structure
Include a clean directory tree and explain important directories and files.

### 9. Installation and Setup
Provide accurate instructions for:
- Prerequisites.
- Cloning the repository.
- Installing dependencies.
- Environment variables.
- Database configuration.
- Running migrations if applicable.
- Starting the development server.

### 10. Environment Variables
Document discovered environment variables.

Never expose actual secrets, API keys, tokens, passwords, or private credentials.

Use placeholders for sensitive values.

### 11. Usage Guide
Explain how to:
- Start the application.
- Navigate the platform.
- Access dashboards.
- Use important features.
- Understand user roles.

### 12. Screenshots and Demonstrations
Use existing screenshots and genuine project assets if available.

Never fabricate screenshots or claim a feature works based on an image alone.

### 13. API Documentation
Where applicable, document:
- Endpoints.
- HTTP methods.
- Request parameters.
- Authentication requirements.
- Response structures.

### 14. Security
Document implemented security mechanisms and recommended deployment precautions.

### 15. Testing
Explain how to execute available tests and quality checks.

### 16. Deployment
Document the actual deployment process if discoverable.

### 17. Roadmap
Include verified upcoming work only when documented or explicitly identified as planned.

### 18. Contribution Policy
Explain contribution expectations and authorization requirements.

### 19. Intellectual Property, Ownership & Usage Restrictions

Include the following project ownership and access policy.

#### PROJECT OWNERSHIP AND HACKATHON EVALUATION POLICY

This project is independently developed intellectual property and may contain proprietary software, original implementations, business logic, designs, and commercially valuable source code.

The repository may be made accessible publicly and temporarily for a specific hackathon, competition, demonstration, or evaluation purpose.

**Conditions of access:**

1. Public access during an authorized hackathon does not automatically grant permission to commercially exploit, redistribute, rebrand, sublicense, or claim ownership of the project.

2. Access to the project for evaluation is limited to the applicable hackathon rules, organizer requirements, and any explicitly granted permissions.

3. If the project owner is eliminated, disqualified, withdraws, or otherwise becomes ineligible to continue participating, the owner requests notification of that outcome.

4. Following elimination or the end of authorized evaluation access, evaluators and other participants should discontinue any access that is no longer authorized and refrain from further use, copying, modification, redistribution, or commercial exploitation of the project beyond permissions granted by applicable competition rules or law.

5. The project owner reserves all intellectual property rights not expressly granted to others.

6. Public visibility must not be interpreted as an unrestricted commercial license.

7. Outside an expressly authorized hackathon or evaluation period, the project is intended to remain private and proprietary as a commercial source of income.

8. Any permission to use the project outside evaluation must be obtained explicitly from the project owner in writing.

**Important:** This statement does not override mandatory hackathon rules, previously granted licenses, applicable open-source licenses, or rights established by law. It is a notice of the owner's intended usage conditions, not a technical access-control mechanism.

### 20. License
Do not automatically declare the project MIT, Apache, GPL, or another open-source license.

Inspect existing license files and repository configuration first.

If no license exists, explain that no general license has been granted and recommend consulting a qualified legal professional before publication.

### 21. Author and Contact
Use only author information and contact details already provided or verified.

### 22. Acknowledgments
Include relevant technologies, libraries, and contributors where appropriate.

---

## PHASE 4: DOCUMENTATION QUALITY CONTROL

Before finalizing:

- Verify every Table of Contents link.
- Verify that every dashboard mentioned actually exists.
- Verify technology names against dependency files.
- Verify setup commands against project scripts.
- Verify paths and filenames.
- Check that Mermaid diagrams are syntactically valid.
- Check Markdown formatting.
- Ensure no secrets or credentials are exposed.
- Remove duplicated information.
- Avoid unsupported claims.
- Maintain consistent terminology.
- Ensure the README renders correctly on GitHub.

---

## PHASE 5: IMPORTANT EXECUTION RULES

1. READ THE CODE FIRST. Do not write the README before understanding the project.
2. Do not modify application source code.
3. Do not delete, rename, or restructure existing files.
4. Do not change application functionality.
5. Do not install unnecessary dependencies.
6. Do not expose secrets.
7. Do not invent features, screenshots, endpoints, or configurations.
8. Do not overwrite an existing README without first inspecting it.
9. Preserve existing project documentation where useful.
10. Create or update ONLY `README.md`, unless I explicitly authorize additional documentation files.
11. If essential information is missing, document the limitation rather than making assumptions.
12. Keep the documentation professional, detailed, readable, and easy to navigate.

## FINAL DELIVERABLE

Produce:

- A complete, production-quality `README.md`.
- A clickable Table of Contents.
- A detailed explanation of every discovered dashboard.
- An accurate architecture overview.
- A professional technology stack section.
- Installation and usage instructions.
- A clear intellectual property and hackathon evaluation policy.
- A verified and polished Markdown document.

**FINAL INSTRUCTION:**

Your job is not merely to describe the project. Your job is to understand it deeply enough that a new developer, technical evaluator, investor, or potential collaborator can understand its purpose, architecture, functionality, and ownership conditions simply by reading the README.md.

Prioritize accuracy, professionalism, clarity, and protection of the project's intellectual property.
# PHASE 6: COMPLETE ENVIRONMENT CONFIGURATION & REPOSITORY SETUP

Act as a senior DevOps engineer and software configuration specialist.

Your responsibility is to inspect the entire project and document everything required to configure, initialize, and run the application successfully from a fresh clone.

The objective is to make the repository easy to set up for authorized developers without exposing confidential credentials or production secrets.

## 1. Inspect All Environment Requirements

Inspect:

- `.env` and `.env.example` files.
- `.env.local`, `.env.development`, `.env.production`, and other environment files.
- Package and dependency manifests.
- Backend configuration.
- Frontend configuration.
- Database connection settings.
- Authentication providers.
- API integrations.
- Cloud storage configuration.
- Email services.
- Payment integrations, if applicable.
- Third-party APIs.
- Docker and deployment configuration.
- Build and runtime scripts.

Identify every environment variable referenced in the actual codebase.

For each variable, document:

- Variable name.
- Purpose.
- Whether it is required or optional.
- Whether it is frontend-public or server-private.
- Expected format.
- Where to obtain its value.
- Whether it needs a default value.

Never invent environment variables.

## 2. Create a Safe .env.example

If appropriate, create a `.env.example` file containing every required configuration variable.

Example structure:

```env
# Application
APP_NAME=MyApplication
APP_ENV=development
APP_URL=http://localhost:3000

# Database
DATABASE_URL=

# Authentication
AUTH_SECRET=
AUTH_URL=

# External API
EXTERNAL_API_KEY=

# Storage
STORAGE_BUCKET=
STORAGE_ACCESS_KEY=
STORAGE_SECRET_KEY=
```

IMPORTANT:
- Adapt this example to the actual project.
- Do not include real credentials.
- Do not expose production secrets.
- Never copy the contents of a real `.env` file into `.env.example`.
- Preserve the actual variable names expected by the application.
- Use placeholders for sensitive configuration.

## 3. Create a Complete Environment Setup Guide

Document the exact procedure:

1. Clone the repository.
2. Install the required runtime and package manager.
3. Install dependencies.
4. Copy `.env.example` to the correct environment filename.
5. Obtain the necessary API credentials.
6. Configure the database.
7. Initialize the database.
8. Run migrations and seed data if applicable.
9. Configure external integrations.
10. Start the development server.
11. Verify the application is running.
12. Run available tests.

Provide commands that match the actual project.

Include Windows PowerShell, macOS, and Linux commands where appropriate.

## 4. Document Every External Service

For each external integration discovered, explain:

- What it does.
- Why the project needs it.
- Whether it is mandatory.
- How to create an account.
- Where to generate API credentials.
- Which environment variables it requires.
- How to test the integration.

Never invent provider URLs or claim that an integration is implemented when it is not.

## 5. Database Setup

If the application uses a database, document:

- Database engine and version requirements.
- Local database installation or Docker setup.
- Database creation.
- Connection string configuration.
- Migration commands.
- Seeding commands.
- Database reset procedure, with appropriate warnings.
- Connection troubleshooting.

Never execute destructive database commands during documentation generation.

## 6. Docker and One-Command Setup

If Docker is already supported or can be configured without changing application behavior, inspect its feasibility.

Document:
- Docker prerequisites.
- Required services.
- Environment configuration.
- Build commands.
- Startup commands.
- Shutdown commands.
- Persistent volumes.
- Health checks.

Do not introduce Docker configuration without authorization if it requires modifying application infrastructure.

## 7. Security and Git Configuration

Inspect `.gitignore`.

Ensure it excludes sensitive files, including applicable:

- `.env`
- `.env.local`
- `.env.production`
- Private keys.
- Credentials.
- Access tokens.
- Service-account files.
- Local database files.
- Private certificates.

Do not blindly exclude `.env.example`.

If a sensitive file is already tracked, warn me. Do not assume adding it to `.gitignore` removes it from Git history.

Never print actual secret values in the final report.

## 8. Environment Configuration Table in README.md

Create a comprehensive table:

| Variable | Description | Required | Example |
|---|---|---|---|
| DATABASE_URL | Database connection | Yes | Placeholder |
| AUTH_SECRET | Authentication secret | Yes | Generate locally |
| API_KEY | External service credential | Conditional | Obtain from provider |

Use actual discovered variable names and mark conditional variables appropriately.

Do not expose actual credentials.

## 9. Troubleshooting Guide

Document common setup errors:

- Missing environment variables.
- Invalid API credentials.
- Database connection failures.
- Dependency installation problems.
- Port conflicts.
- Build failures.
- Authentication configuration problems.
- Migration errors.
- External service connection failures.

Provide verified troubleshooting steps.

## 10. Final Environment Deliverables

Subject to the repository's existing structure and explicit permissions, generate or update:

- `README.md`
- `.env.example`
- `.gitignore` (only if necessary and authorized)

Do not generate a real `.env` file containing secrets.

If additional configuration files are needed, explain why and request authorization before creating them.

## FINAL VERIFICATION

Test the documented setup commands where the environment permits.

Distinguish between:
- Successfully tested.
- Documented but not tested.
- Requires external credentials.
- Requires manual configuration.

The ultimate goal is a reproducible, secure, developer-friendly setup experience.

A developer with authorized repository access should be able to follow the README from beginning to end and understand exactly how to configure and run the project.
# PHASE 7: COMPLETE AI INTEGRATION, ARCHITECTURE & WORKFLOW DOCUMENTATION

## ROLE

Act as a senior AI solutions architect, machine learning engineer, LLM integration specialist, and technical documentation engineer.

Your mission is to inspect the entire codebase and identify every AI-powered capability implemented in the project.

You must explain how AI is integrated, when it is activated, what it does, how it processes information, how it generates results, and how those results are delivered to users or other system components.

IMPORTANT: Do not assume that the project uses AI simply because AI-related dependencies or environment variables exist. Verify actual implementation and execution paths.

---

## 1. IDENTIFY ALL AI TECHNOLOGIES

Inspect the entire codebase for:

- AI APIs and SDKs.
- Large Language Models (LLMs).
- Machine learning models.
- Generative AI services.
- AI agents.
- Agent frameworks.
- Embedding models.
- Vector databases.
- Retrieval-Augmented Generation (RAG).
- Recommendation engines.
- Classification systems.
- Prediction systems.
- Computer vision.
- Speech recognition and generation.
- AI-powered automation.
- Intelligent decision-making systems.
- Prompt templates.
- Model orchestration systems.

Identify actual providers, model names, versions, and integrations where verifiable.

Examples of possible providers include OpenAI, Anthropic, Google Gemini, Hugging Face, and locally hosted models.

Only document providers and models actually found in the implementation.

---

## 2. AI FEATURE-BY-FEATURE ANALYSIS

For every AI-powered feature discovered, explain:

1. Feature name.
2. Purpose.
3. Business problem it solves.
4. Where it appears in the application.
5. Which dashboard or user role accesses it.
6. What triggers it.
7. Which AI provider or model it uses.
8. What information it receives.
9. How information is processed.
10. What prompt, instruction, or processing logic is applied.
11. What output is generated.
12. How the result is delivered.
13. Whether users can modify or approve the result.
14. Whether the output is saved in the database.
15. Whether human verification is required.

Distinguish implemented functionality from experimental, incomplete, or planned functionality.

---

## 3. EXPLAIN WHEN AI IS USED

Identify the exact conditions under which each AI feature executes.

For example:

- When a user submits a request.
- When a dashboard loads.
- When a user uploads a document.
- When a scheduled background job runs.
- When a specific event occurs.
- When an administrator initiates an operation.
- When the application detects a condition requiring intelligent processing.

Document whether AI runs automatically, manually, periodically, or conditionally.

Do not claim automatic execution if the code requires a user action.

---

## 4. EXPLAIN HOW AI WORKS INTERNALLY

Trace the actual execution flow from beginning to end.

Document:

- User input.
- Frontend event.
- API request.
- Backend processing.
- Data retrieval.
- Prompt construction.
- Model selection.
- AI API request.
- Model response.
- Response validation.
- Post-processing.
- Database persistence.
- Frontend response.
- Final user-facing result.

Include relevant file paths, functions, classes, API routes, and services.

---

## 5. AI WORKFLOW DIAGRAMS

Generate Mermaid diagrams showing actual AI execution flows.

Example:

User Request
    ↓
Frontend Interface
    ↓
Backend API
    ↓
Input Validation
    ↓
Context/Data Retrieval
    ↓
Prompt Construction
    ↓
AI Model / Provider
    ↓
Generated Response
    ↓
Output Validation
    ↓
Database / Application Logic
    ↓
Dashboard Presentation
    ↓
User Receives Result

Adapt the diagram to the actual implementation.

If the project contains multiple independent AI workflows, create separate diagrams for each.

---

## 6. HOW AI DELIVERS RESULTS

Explain exactly how AI-generated results reach their destination.

Investigate whether the application delivers results through:

- Dashboard interfaces.
- API responses.
- Database records.
- Notifications.
- Reports.
- Generated documents.
- Recommendations.
- Automated actions.
- Background processing.
- Streaming responses.
- Real-time interfaces.

For each feature, explain the output format and delivery mechanism.

Identify whether results are immediate, asynchronous, or scheduled.

---

## 7. AI DATA FLOW AND SECURITY

Document:

- What data is sent to external AI providers.
- What data remains inside the application.
- Whether personally identifiable information is processed.
- Whether prompts or responses are stored.
- Whether external services retain submitted data, if their policies are verified.
- Whether data is anonymized or filtered before transmission.
- How API credentials are protected.
- How AI requests are authenticated.
- How errors and failed requests are handled.

Never expose API keys, private prompts containing secrets, credentials, or sensitive user data.

Do not make unsupported privacy or compliance claims.

---

## 8. AI ENVIRONMENT VARIABLES

Inspect all AI-related configuration.

Document actual variables, such as:

- AI_PROVIDER
- AI_MODEL
- OPENAI_API_KEY
- ANTHROPIC_API_KEY
- GEMINI_API_KEY
- EMBEDDING_MODEL
- VECTOR_DATABASE_URL

These are examples only. Include only variables actually referenced in the repository.

Explain where each credential comes from, how it is configured, and whether it is mandatory.

Include safe placeholders in `.env.example`.

---

## 9. AI COSTS, LIMITATIONS AND FAILURE HANDLING

Where supported by the code and provider documentation, explain:

- Token usage.
- Model pricing considerations.
- Request limits.
- Rate limiting.
- Context window limitations.
- Response latency.
- API quotas.
- Retry mechanisms.
- Fallback models.
- Error handling.
- Unavailable AI services.
- Potential hallucinations.
- Human review requirements.

Never invent cost estimates or claim that fallback systems exist without evidence.

---

## 10. AI DOCUMENTATION IN README.md

Create a dedicated section titled:

# AI Architecture & Intelligent Features

Include these subsections:

1. AI Technologies Used.
2. AI-Powered Features.
3. When AI Is Activated.
4. How AI Works.
5. AI Processing Pipeline.
6. AI Models and Providers.
7. AI Input and Output.
8. AI Result Delivery.
9. AI Data Flow.
10. AI Environment Configuration.
11. AI Security and Privacy.
12. Error Handling and Limitations.
13. AI Usage and Cost Considerations.

Add a feature comparison table:

| AI Feature | Trigger | AI Provider/Model | Input | Output | Destination |
|---|---|---|---|---|---|
| Actual feature | Verified trigger | Actual model | Actual input | Actual result | Actual destination |

---

## 11. FINAL AI AUDIT REPORT

After analyzing the code, provide a separate summary identifying:

- Total AI integrations discovered.
- Actual AI providers.
- Models used.
- AI-powered dashboards.
- AI-powered features.
- AI execution triggers.
- Important AI source files.
- External AI dependencies.
- Required API credentials.
- Missing or incomplete AI implementations.
- Security concerns.
- Opportunities for improvement.

Do not confuse an imported AI SDK with an actively used AI feature.

The documentation must reflect the real implementation, not marketing assumptions.

FINAL OBJECTIVE:

A technical evaluator, developer, investor, or future maintainer should be able to understand exactly where AI exists in the project, why it is used, when it runs, how it works internally, and what measurable or practical result it delivers.