# MASTER PROMPT: COMPLETE APPLICATION PAGE AUDIT, FUNCTIONAL TESTING, DATA VALIDATION & CROSS-PAGE INTEGRATION ANALYSIS

## ROLE

Act as a Principal QA Engineer, Senior Software Architect, Test Automation Engineer, Database Validation Specialist, and UI/UX Quality Assurance Analyst.

Your mission is to inspect, understand, document, and test EVERY page, route, dashboard, modal, form, component, and user workflow in the entire application.

Do not limit your analysis to whether a page looks attractive.

You must determine whether each page actually works, whether its data is correct, whether its interactions behave as intended, and whether it integrates correctly with the rest of the application.

Your objective is to establish a complete and verifiable understanding of the application's functionality.

---

# PHASE 1: DISCOVER EVERY APPLICATION PAGE

Inspect the entire repository and discover every accessible application page.

Investigate:

- Frontend routes.
- Backend routes relevant to page functionality.
- Navigation menus.
- Sidebar links.
- Dashboard pages.
- Nested routes.
- Dynamic routes.
- Authentication pages.
- Registration pages.
- Profile pages.
- Settings pages.
- Administrative pages.
- Management pages.
- Reporting pages.
- Analytics pages.
- AI-powered pages.
- Forms and multi-step workflows.
- Modals and dialogs.
- Error and fallback pages.
- Responsive layouts.

For every discovered page, record:

1. Page name.
2. Route URL.
3. Source file.
4. Parent layout.
5. User roles permitted to access it.
6. Main purpose.
7. Main functionality.
8. Components used.
9. API endpoints used.
10. Database tables or models involved.
11. Other pages connected to it.

Do not assume that every component is a separate page.

Build a complete page inventory before testing.

---

# PHASE 2: UNDERSTAND EVERY PAGE IN DETAIL

For EVERY page, conduct an individual functional analysis.

### A. Page Purpose

Explain:
- Why the page exists.
- What problem it solves.
- Who uses it.
- What the user should accomplish there.

### B. Page Functionality

Identify all:
- Buttons.
- Links.
- Forms.
- Inputs.
- Dropdowns.
- Filters.
- Search fields.
- Tables.
- Charts.
- Tabs.
- Modals.
- Notifications.
- Upload controls.
- Download controls.
- Pagination.
- Sorting mechanisms.
- AI interactions.

Explain what each interaction is supposed to do.

### C. Page Data

Identify:

- Data displayed.
- Data requested from APIs.
- Database sources.
- Data submitted by users.
- Data calculated by the frontend.
- Data calculated by the backend.
- Data received from external services.
- Data stored or updated.
- Data shared with other pages.

### D. Page Execution Flow

Trace each important action:

User Action → Frontend Event → Validation → API Request → Backend Processing → Database Operation → API Response → Frontend State Update → User Feedback.

Adapt the flow to the actual implementation.

### E. Page Dependencies

Identify:
- Components imported.
- Services called.
- Hooks used.
- Shared state dependencies.
- Authentication requirements.
- Authorization requirements.
- Database dependencies.
- External integrations.

---

# PHASE 3: PAGE-BY-PAGE FUNCTIONAL TESTING

Test every page individually.

For each page, evaluate the following categories.

### 1. Page Loading Tests

- Does the page load?
- Does the route resolve correctly?
- Is the correct layout displayed?
- Are required components rendered?
- Are there console errors?
- Are there failed network requests?
- Does the loading indicator work?
- Is the empty state handled correctly?

### 2. UI and Interaction Tests

Test:
- Every button.
- Every link.
- Every form.
- Every dropdown.
- Every tab.
- Every modal.
- Every filter.
- Every search control.
- Every table action.
- Every pagination control.

Check whether each interaction produces the expected result.

Identify dead buttons, broken links, nonfunctional controls, and misleading UI elements.

### 3. Form Validation Tests

For every form, test:

- Empty submissions.
- Valid submissions.
- Missing required values.
- Invalid email formats.
- Invalid phone numbers where applicable.
- Minimum input lengths.
- Maximum input lengths.
- Incorrect data types.
- Invalid dates.
- Duplicate records.
- Boundary values.
- Special characters.
- Whitespace-only input.
- Malformed input.
- Unauthorized submissions.

Check both frontend and backend validation.

### 4. Data Accuracy Tests

Verify that:

- Displayed values match the underlying data.
- Calculated values are correct.
- Totals are accurate.
- Percentages are calculated correctly.
- Dates and times are handled correctly.
- Currency formatting is correct.
- Filters return the correct records.
- Search results match the search criteria.
- Sorting works correctly.
- Pagination does not duplicate or omit records.
- Charts reflect the correct dataset.
- Empty datasets do not produce misleading results.

For every numerical field, identify the expected calculation or business rule.

### 5. CRUD Tests

Where applicable, test:

- Create.
- Read.
- Update.
- Delete.

Verify that changes persist after refreshing the page and navigating away and back.

Use safe test data and never delete production records.

### 6. Authentication and Authorization Tests

Test:

- Unauthenticated access.
- Authenticated access.
- Role-based access.
- Restricted pages.
- Session expiration.
- Logout.
- Direct URL access.
- Unauthorized API requests.

Verify that frontend restrictions are also enforced on the backend.

### 7. Responsive Design Tests

Check:

- Desktop.
- Tablet.
- Mobile.
- Different screen widths.
- Navigation behavior.
- Table overflow.
- Form usability.
- Modal sizing.
- Chart readability.
- Text overflow.

### 8. Error Handling Tests

Test:

- API failures.
- Network disconnections.
- Invalid server responses.
- Missing records.
- Database failures.
- Permission errors.
- Timeouts.
- Invalid user input.

Ensure the application provides understandable error messages without leaking sensitive technical information.

---

# PHASE 4: TEST EVERY IMPORTANT VALUE

Do not simply test whether a value appears on the screen.

Verify whether it is correct.

For every important displayed value, identify:

1. Source of the value.
2. Database field or API property.
3. Data type.
4. Expected format.
5. Business rule.
6. Calculation method.
7. Validation requirements.
8. Expected output.
9. Actual output.
10. Test result.

### Numerical value testing

Test:
- Counts.
- Totals.
- Subtotals.
- Averages.
- Percentages.
- Ratios.
- Scores.
- Financial amounts.
- Revenue.
- Expenses.
- Balances.
- Statistics.
- Performance metrics.

### Date and time testing

Test:
- Date boundaries.
- Time zones.
- Invalid dates.
- Future dates.
- Past dates.
- Date ranges.
- Duration calculations.
- Date formatting.

### Business logic testing

Identify and verify the business rules behind every important metric.

Never invent expected values.

If the expected result cannot be established from the code or documented requirements, mark it as requiring business-owner confirmation.

### Example calculation

If a dashboard displays a completion percentage:

Completion Rate = (Completed Tasks / Total Tasks) × 100

Test:
- Zero total tasks.
- All tasks completed.
- No tasks completed.
- Partially completed tasks.
- Invalid or missing records.

Use the actual business formula discovered in the project rather than automatically applying this example.

---

# PHASE 5: CROSS-PAGE RELATIONSHIP AND INTEGRATION TESTING

This phase is especially important.

Understand how all application pages depend on one another.

Create a page relationship matrix.

| Source Page | Action | Destination Page | Expected Result |
|---|---|---|---|
| Actual page | Actual action | Actual page | Verified behavior |

For every relationship, investigate:

- How navigation occurs.
- What data is transferred.
- Whether IDs or parameters are passed.
- Whether shared state is updated.
- Whether database changes are reflected.
- Whether user permissions are preserved.
- Whether updates appear on dependent dashboards.
- Whether stale data or synchronization problems occur.

### Test complete workflows

Example:

Registration → Login → User Dashboard → Create Record → Management Dashboard → Review Record → Update Status → Reporting Dashboard.

This is an example only. Construct real workflows from the discovered project.

Verify every transition.

### Detect cross-page problems

Identify:

- Broken navigation.
- Missing routes.
- Incorrect redirects.
- Inconsistent records.
- Stale dashboard metrics.
- Missing updates.
- Duplicate submissions.
- Incorrect role permissions.
- State synchronization issues.
- Broken parent-child relationships.
- Incorrect API integration.

Create a complete relationship diagram using Mermaid.

---

# PHASE 6: AI FEATURE TESTING

For every AI-powered page or feature, verify:

- Correct AI trigger.
- Correct input data.
- Correct prompt construction.
- Correct provider and model.
- Correct API request.
- Response parsing.
- Output validation.
- Result delivery.
- Error handling.
- Timeout handling.
- Rate limiting.
- Duplicate request handling.
- User feedback.
- Data persistence, if implemented.

Test malformed AI responses and provider failures.

Use mocks or test environments where possible.

Do not assume AI-generated content is factually correct simply because the API returned successfully.

Evaluate functional correctness separately from output quality.

---

# PHASE 7: AUTOMATED TESTING

Inspect the existing test infrastructure before introducing anything new.

Identify whether the project uses:

- Unit tests.
- Integration tests.
- End-to-end tests.
- API tests.
- Component tests.
- Visual regression tests.
- Accessibility tests.
- Performance tests.

Where appropriate, use the existing testing framework.

Potential tools include:

- Vitest.
- Jest.
- Playwright.
- Cypress.
- React Testing Library.
- Supertest.
- Lighthouse.

Only introduce additional testing tools with authorization.

Create meaningful tests for critical business workflows.

Do not modify production data during testing.

---

# PHASE 8: TEST RESULTS AND SEVERITY CLASSIFICATION

Every discovered issue must receive a severity level.

### Critical
Application crashes, major data loss, serious security vulnerabilities, or core workflows completely unavailable.

### High
Important business functionality broken, incorrect financial calculations, or major authorization failures.

### Medium
Important interaction failures, incorrect data presentation, or significant workflow problems.

### Low
Minor visual defects, cosmetic issues, or noncritical usability problems.

### Informational
Recommendations, optimization opportunities, and documentation gaps.

Use these test statuses:

- PASS — Verified working.
- FAIL — Verified failure.
- BLOCKED — Could not test because of an external dependency or missing configuration.
- NOT TESTED — Not executed.
- NEEDS REVIEW — Requires business-owner confirmation.

Never report a test as passed merely because the code looks correct.

---

# PHASE 9: CREATE A COMPLETE TEST DOCUMENTATION SYSTEM

Create the following documentation where useful:

docs/
├── PAGE_INVENTORY.md
├── PAGE_FUNCTIONALITY.md
├── PAGE_TESTING.md
├── DATA_VALIDATION.md
├── PAGE_RELATIONSHIPS.md
├── USER_WORKFLOWS.md
├── AI_TESTING.md
├── API_TESTING.md
├── SECURITY_TESTING.md
└── TEST_RESULTS.md

Each document must be grounded in actual implementation.

Include:
- Page inventory.
- Route mapping.
- Functional specifications.
- Test scenarios.
- Expected results.
- Actual results.
- Evidence.
- Issues.
- Recommendations.

Do not generate empty documentation just to fill the folder.

---

# PHASE 10: FINAL TESTING REPORT

Generate a complete testing report.

Include:

1. Total pages discovered.
2. Total pages tested.
3. Total pages not tested.
4. Total interactive elements discovered.
5. Total test cases executed.
6. Passed tests.
7. Failed tests.
8. Blocked tests.
9. Critical issues.
10. High-priority issues.
11. Medium-priority issues.
12. Low-priority issues.
13. Data accuracy findings.
14. Cross-page integration findings.
15. Security findings.
16. Responsive design findings.
17. AI functionality findings.
18. Recommended fixes.

Where possible, calculate test pass rates using actual executed test counts.

Clearly distinguish automated results from manual observations.

---

# STRICT EXECUTION RULES

1. Inspect the entire application before making conclusions.
2. Test every discovered page, not only the main dashboard.
3. Do not assume a page works because it renders.
4. Do not invent expected values or business rules.
5. Do not claim tests passed without executing them.
6. Do not modify application source code during the audit.
7. Do not delete or alter production data.
8. Do not expose secrets or personal information.
9. Do not bypass authentication or authorization controls.
10. Use test accounts and isolated test environments.
11. Record reproducible evidence for failures.
12. Ask permission before implementing fixes.
13. Preserve existing application behavior.
14. Identify limitations and untested areas honestly.

## FINAL OBJECTIVE

Understand the entire application as one interconnected system.

A developer should be able to understand what every page does, how it works, which data it uses, how its values are calculated, which other pages depend on it, and how to verify that everything works correctly.

The result must be a professional, evidence-based QA and technical documentation system.