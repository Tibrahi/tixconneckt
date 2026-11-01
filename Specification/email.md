# MASTER ENGINEERING TASK: COMPLETE EMAIL SYSTEM REFACTORING, NODEMAILER + SMTP INTEGRATION, AND PROFESSIONAL CORPORATE EMAIL DESIGN

Act as a senior backend engineer, email infrastructure specialist, and professional corporate email designer.

Your task is to audit, improve, and standardize the entire application's email system so that every email sent by the platform uses a reliable Nodemailer + SMTP architecture and follows a consistent, professional corporate communication standard.

**The objective is to make every email look like it comes from an established, trustworthy company, not an automated spam generator or an unfinished application.**

Focus exclusively on email infrastructure, email delivery, email content, templates, branding, security, and reliability.

Do not redesign unrelated application pages or introduce unrelated features.

---

# PART 1: CENTRALIZE ALL EMAIL DELIVERY THROUGH NODEMAILER + SMTP

Audit the entire codebase and identify every location where emails are sent.

Replace inconsistent, duplicated, unreliable, or unnecessary email-sending implementations with one centralized email service built using Nodemailer and the configured SMTP provider.

Requirements:

1. Use Nodemailer as the email transport library.
2. Use SMTP for actual email delivery.
3. Create one reusable email service responsible for sending all application emails.
4. Centralize SMTP configuration.
5. Centralize sender identity and reply-to configuration.
6. Centralize error handling and delivery logging.
7. Ensure all email-triggering operations use the centralized service.
8. Remove obsolete email implementations after verifying that they are no longer needed.
9. Avoid creating separate SMTP connections for every email when a reusable transporter is appropriate.
10. Support secure SMTP connections using the provider's recommended TLS configuration.

Use the existing SMTP credentials and deployment configuration where available.

Never invent credentials or hardcode passwords.

---

# PART 2: PROFESSIONAL CORPORATE EMAIL IDENTITY

Every email must follow a consistent company identity.

Configure a professional sender identity.

Use the existing verified company domain and email addresses.

Example format:

- Sender name: Company Name
- Sender address: no-reply@companydomain.com
- Reply-to: an appropriate monitored company email address.

Do not use fake or unverified sender domains.

Ensure SPF, DKIM, and DMARC are properly configured and aligned with the actual sending domain and SMTP provider.

Where DNS configuration is required, identify the exact records the administrator must publish.

Do not claim that domain authentication is complete until it has been verified.

---

# PART 3: CREATE ONE PROFESSIONAL EMAIL DESIGN SYSTEM

Create a reusable email template system.

Every email must use the same professional corporate layout while allowing different content depending on the purpose of the message.

## A. Header

Every email must include:

- Company logo.
- Company identity.
- Clean header layout.
- Appropriate brand colors.
- Professional spacing.

### Logo requirement

Use the existing `logo.png` asset.

Locate the actual logo file in the project.

Use it consistently in every email template.

Requirements:

- Use a publicly accessible HTTPS image URL for the logo in production.
- Ensure the image is compatible with common email clients.
- Provide appropriate alternative text.
- Set reasonable image dimensions.
- Preserve the correct aspect ratio.
- Do not use broken relative image paths.
- Do not assume that a local filesystem path is accessible to email recipients.

If necessary, configure an appropriate public asset URL using the application's verified domain.

## B. Email body

Use a clean, professional content layout.

Requirements:

- Clear subject line.
- Appropriate greeting.
- Short and meaningful introduction.
- Well-structured content.
- Clear primary action where needed.
- Appropriate secondary information.
- Professional closing.

Avoid:
- Excessive emojis.
- Excessive capitalization.
- Spam-like expressions.
- Unnecessary promotional language.
- Multiple competing call-to-action buttons.
- Unnecessary decorative elements.
- Overly long paragraphs.

## C. Professional footer

Every email must include a reusable company footer.

The footer should contain:

- Company logo or brand identity where appropriate.
- Company name.
- Official website.
- Official support/contact email.
- Copyright notice.
- Relevant company information.
- Privacy policy link where applicable.
- Terms of service link where applicable.

For marketing or promotional emails, include a working unsubscribe mechanism where legally required.

For transactional emails, do not insert misleading unsubscribe links that prevent essential account or security communications.

Do not invent company addresses, legal registrations, or contact information.

Only use verified company details already available in the project configuration.

---

# PART 4: AUDIT AND REWRITE EVERY EMAIL IN THE APPLICATION

Identify every existing email type and ensure it follows the new email design system.

This includes, where applicable:

### Authentication emails
- Account verification.
- Welcome email.
- Password reset.
- Password change confirmation.
- Login or security notifications.
- Account recovery.

### User activity emails
- Project successfully published.
- Project updates.
- Connection requests.
- Connection request accepted.
- Connection request rejected.
- New messages or relevant activity notifications.

### Provider emails
- Provider registration.
- Provider verification.
- Provider connection requests.
- Project opportunity notifications.
- Project interest notifications.
- Provider account updates.

### Administrative emails
- System notifications.
- Account-related administrative messages.
- Important platform announcements.

Do not create email types that do not correspond to actual application functionality.

For each existing email:

1. Review the current wording.
2. Correct grammar and spelling.
3. Improve clarity and professionalism.
4. Use an appropriate subject.
5. Make the message concise and useful.
6. Include relevant contextual information.
7. Add a clear action where necessary.
8. Use the shared corporate template.
9. Include the company footer.
10. Verify that all links work.

Each email must sound naturally written by a professional company.

Avoid robotic, repetitive, generic wording.

---

# PART 5: CREATE REUSABLE EMAIL TEMPLATES

Organize email templates into a maintainable structure.

For example:

- Email service.
- SMTP configuration.
- Shared base template.
- Header component.
- Footer component.
- Email layout.
- Authentication templates.
- Project templates.
- Connection templates.
- Provider templates.
- Notification templates.

Use the existing project's architecture and conventions rather than forcing this exact folder structure if another structure is more appropriate.

Templates must support:

- Dynamic recipient names.
- Dynamic project names.
- Dynamic connection information.
- Dynamic verification links.
- Dynamic notification content.
- Dynamic company information.

All dynamic values must be safely escaped to prevent HTML injection.

Keep HTML and plain-text versions of each email.

Do not duplicate the complete HTML layout inside every email implementation.

---

# PART 6: PROFESSIONAL EMAIL DESIGN STANDARDS

Use a corporate email design that works across Gmail, Outlook, Apple Mail, and mobile email clients.

Design requirements:

- Responsive layout.
- Table-based structure where necessary for email compatibility.
- Inline CSS for critical styling.
- Safe system font stacks.
- Clear typography hierarchy.
- Consistent spacing.
- Accessible color contrast.
- Proper image sizing.
- Simple professional buttons.
- Clean backgrounds.
- Limited decorative effects.

Avoid relying on JavaScript, external CSS files, complex animations, or unsupported modern CSS features.

The design should remain attractive even when images are blocked.

Use a restrained and consistent color palette that matches the existing company brand.

---

# PART 7: EMAIL DELIVERY RELIABILITY

Implement reliable email delivery.

Requirements:

1. Validate recipient addresses before sending.
2. Handle SMTP connection failures.
3. Handle authentication failures.
4. Handle temporary SMTP provider errors.
5. Apply controlled retries where appropriate.
6. Prevent duplicate email submissions.
7. Log delivery attempts.
8. Track message IDs where available.
9. Distinguish accepted SMTP delivery from confirmed inbox delivery.
10. Handle permanent and temporary delivery failures appropriately.

For important asynchronous emails, use a reliable background queue or transactional outbox pattern where supported.

Do not make users wait for noncritical emails to finish sending.

Do not silently discard failed emails.

Do not repeatedly send duplicate messages after application retries.

Implement idempotency protection for email-triggering events.

---

# PART 8: EMAIL SECURITY

Enforce strict email security.

- Keep SMTP credentials exclusively on the server.
- Store credentials in environment variables or the existing secret manager.
- Never expose SMTP passwords in frontend code.
- Never commit SMTP credentials to source control.
- Sanitize dynamic HTML content.
- Validate all email inputs.
- Protect password reset and verification links.
- Use secure, expiring tokens.
- Avoid leaking sensitive account information.
- Prevent email header injection.
- Protect email endpoints against abuse.
- Apply appropriate rate limits.
- Avoid logging passwords, tokens, or private email content.

Use secure SMTP/TLS settings appropriate to the provider.

---

# PART 9: EMAIL CONFIGURATION AND ENVIRONMENT VARIABLES

Centralize email configuration.

Use appropriate environment variables, for example:

SMTP_HOST=
SMTP_PORT=
SMTP_SECURE=
SMTP_USER=
SMTP_PASS=
MAIL_FROM_NAME=
MAIL_FROM_ADDRESS=
MAIL_REPLY_TO=
APP_BASE_URL=
EMAIL_LOGO_URL=
COMPANY_NAME=
COMPANY_WEBSITE=
SUPPORT_EMAIL=
PRIVACY_POLICY_URL=
TERMS_URL=

Adapt variable names to the existing application configuration.

Requirements:

- Validate mandatory configuration during startup or email-service initialization.
- Fail clearly when required configuration is missing.
- Never expose environment values to the browser.
- Avoid hardcoded URLs and credentials.
- Ensure development and production environments use appropriate SMTP settings.

---

# PART 10: TESTING AND VALIDATION

Test the complete email system before deployment.

### Infrastructure tests

- Verify SMTP connection.
- Verify SMTP authentication.
- Verify sender configuration.
- Verify TLS configuration.
- Verify the logo URL.
- Verify message IDs.
- Verify error handling.

### Template tests

- Verify every email includes the correct logo.
- Verify every email includes the footer.
- Verify dynamic values are correct.
- Verify links point to the correct application.
- Verify HTML and plain-text versions.
- Verify mobile responsiveness.
- Verify layout compatibility.

### Delivery tests

Send controlled test messages to authorized test addresses.

Verify:
- Messages are accepted by SMTP.
- Messages arrive at intended test inboxes.
- Links work.
- Images load.
- Formatting remains correct.
- Messages do not contain broken placeholders.
- Duplicate notifications are prevented.

### Deliverability checks

Check:
- SPF.
- DKIM.
- DMARC.
- Sender-domain alignment.
- SMTP provider restrictions.
- Bounce handling where supported.
- Reputation and deliverability configuration.

Do not claim that an email is delivered merely because Nodemailer successfully submitted it to SMTP.

---

# PART 11: FINAL ACCEPTANCE CRITERIA

The implementation is complete only when:

1. All application emails use the centralized Nodemailer + SMTP service.
2. All email templates follow a consistent professional company design.
3. Every email includes the actual `logo.png` branding.
4. Every email contains an appropriate corporate footer.
5. Every email has professionally written content.
6. All templates support dynamic application data safely.
7. HTML and plain-text versions are available.
8. SMTP credentials are secure.
9. Delivery errors are handled properly.
10. Duplicate emails are prevented.
11. Critical emails remain reliable.
12. Email layouts work on major email clients and mobile devices.
13. All existing email functionality remains operational.
14. Domain authentication and deliverability requirements are documented and verified where possible.

---

# FINAL DELIVERABLE

After implementation, provide:

1. All email types identified.
2. Email implementations replaced or improved.
3. Nodemailer and SMTP configuration.
4. Shared template architecture.
5. Logo integration details.
6. Footer implementation.
7. Email content improvements.
8. Security improvements.
9. Delivery and retry mechanisms.
10. DNS authentication requirements.
11. Testing results.
12. Remaining configuration requirements.

**FINAL DIRECTIVE:**

Every email must look and read like an official communication from a serious, established company.

Use Nodemailer + SMTP consistently, maintain one reusable email architecture, use the actual `logo.png`, include a professional footer, and ensure reliable, secure delivery.

Do not leave old email implementations operating alongside the new system without a documented technical reason.

Focus exclusively on completing this email-system improvement.