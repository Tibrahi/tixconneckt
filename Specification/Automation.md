# Implementation Plan: Voice Profile Configuration + Scheduled Actions Automation

The system will have two connected features:

1. Voice Profile Builder — the user speaks, the system transcribes the voice, extracts the details, and prepares the profile automatically.
    
2. Scheduled Actions Automation — the user tells the system what to do, on which page, and at what time. The server executes the saved action automatically, even when the user is logged out or their phone is switched off.
    

Both features will use one centralized notification system, with notifications displayed inside the platform and delivered by email.

## Phase 1 — Voice Profile Configuration

Step 1: Open Profile Configuration

The user opens a dedicated page, such as `/dashboard/profile/configure`, and selects Configure with Voice.

Step 2: Record and Transcribe

The user speaks naturally. Speech-to-text converts the voice into written text, which is displayed so the user can review it.

Step 3: Automatically Parse Details

The system identifies information such as name, biography, occupation, contact details, skills, preferences, and other supported profile fields. It maps the extracted information to the correct fields.

Step 4: Review and Confirm

The user reviews the generated profile, edits mistakes, and confirms the changes. The system must not silently save uncertain or incorrectly interpreted details.

Step 5: Save and Report

The server validates and saves the confirmed details in the database, then shows a success notification and records the change in the user's activity history.

The user must also be able to configure the profile manually. Voice should accelerate configuration, not become a requirement.

## Phase 2 — Scheduled Action Configuration

Create a separate dashboard page, such as `/dashboard/automations/new`, where the user can create a scheduled command using voice or a form.

### Example command

> “At 8:00 AM every Monday, open my scheduled report page, generate my weekly report, save it, and notify me by email when it is complete.”

The system converts that sentence into a structured automation:

|Setting|Example|
|---|---|
|Automation name|Weekly report|
|Target page|`/dashboard/reports/weekly`|
|Action|Generate and save report|
|Schedule|Every Monday at 8:00 AM|
|Time zone|User's configured time zone|
|Before-action notification|Enabled|
|After-action notification|Enabled|
|Email notification|Enabled|
|Status|Awaiting confirmation|

The user can also specify a one-time execution, a recurring schedule, or a particular date and time.

### Required workflow

1. Capture command: Record the spoken instruction and transcribe it.
    
2. Parse command: Extract the intended page, action, date, time, recurrence, and notification preferences.
    
3. Validate: Check that the requested page exists, that the action is supported, and that the user has permission to perform it.
    
4. Preview: Show an understandable report explaining exactly what will happen, where it will happen, and when it will happen.
    
5. Confirm and schedule: The user approves the action. The server saves the schedule and execution instructions permanently in the database.
    
6. Manage automation: The user can view, edit, pause, resume, execute manually, or cancel scheduled actions.
    

Important: The system should not execute a newly parsed voice command until the user has reviewed and confirmed it, especially if it changes, sends, publishes, or deletes data.

## Phase 3 — Background Execution Engine

This is the most important technical phase because you want actions to execute even after logout or when the phone is switched off.

Persistent Database

Automation, schedule, target page, action, status and execution history

Server-Side Scheduler

Finds actions whose execution time has arrived

Persistent Job Queue + Worker

Claims jobs, executes supported operations and handles retries

Action Result

Succeeded, failed, partially completed or awaiting review

Notification Center + Email

Report the result and preserve the notification history

### How automatic page actions should work

There is an important distinction between two kinds of actions:

- Internal platform actions: For example, generate a report, update profile information, create a record, or submit a supported form. These should execute through secure server-side application services or APIs wherever possible.
    
- Actions requiring a real browser: For example, opening a page that depends on JavaScript rendering and interacting with specific page elements. These may require a persistent server-side browser automation worker, such as a Playwright-based service.
    

The system should not depend on the user's open browser, phone, or login session to execute a scheduled task.

Guarantee boundary: Logout and a switched-off phone will not stop a correctly scheduled task, provided the hosted server, scheduler, database, and workers remain operational. If the server or hosting environment is down at the scheduled time, the system needs a recovery policy to resume missed jobs when service returns.

## Phase 4 — Pre-Action Reports and Notifications

The platform needs a central notification system with two destinations: the internal notification center and email.

|Event|In-platform notification|Email|
|---|---|---|
|Automation created|Confirmation|Confirmation|
|Upcoming action|Reminder containing the planned action|Reminder containing the planned action|
|Action starting|Execution status, where appropriate|Optional start alert|
|Action succeeded|Success and result summary|Success report|
|Action failed|Failure reason and next steps|Failure report|
|Action skipped or missed|Explanation of the status|Status report|
|Automation edited or cancelled|Confirmation|Confirmation|

The user should configure how early to receive reminders—for example, 24 hours, 1 hour, or 5 minutes before execution.

### What the report should contain

Before execution, show the action name, target page, planned time and time zone, exact operations, affected records where relevant, expected result, and any required user approval.

After execution, show the actual result, completion time, affected items, errors, retry information, and a link to the relevant page or report.

Do not tell the user that an action succeeded merely because a job started. The success notification must depend on the worker's verified execution result.

## Phase 5 — Email Notification System

Use Nodemailer + Gmail SMTP as the initial email delivery method.

1. Email service configuration

Configure a sender account, SMTP connection, sender identity, and secure credentials using server-side environment variables.

2. Notification templates

Create reusable templates for upcoming actions, success, failure, cancellation, and execution reports.

3. Notification queue and history

Store each notification's status, recipient, event type, attempt count, and delivery error where applicable. Retry transient email failures and retain failed deliveries for inspection.

4. Central notification center

Maintain an in-app inbox with read/unread state, filters, timestamps, linked actions, and the corresponding execution report. Email and in-app notifications should be generated from the same recorded event.

### Gmail credentials requirement

You mentioned email and password only. For Gmail, do not use the normal Google account password as the application's SMTP password. The practical password-based setup is a Google App Password, which requires two-step verification. OAuth 2.0 is Google's recommended approach for new integrations, and Gmail may restrict automated sending or impose delivery limits.

Gmail Help+2

For initial development, Nodemailer with Gmail and an App Password is a reasonable starting point. For a production automation platform with significant email volume, plan for a dedicated transactional email provider if needed.

## Phase 6 — Recommended Technical Architecture

Assuming the platform uses Next.js and PostgreSQL:

|Component|Responsibility|
|---|---|
|Next.js|Profile configuration, voice interface, automation forms, dashboards and notification UI|
|Speech-to-text service|Convert voice recordings into text|
|Command parser|Turn transcripts into validated, structured profile fields or actions|
|PostgreSQL|Persist profiles, schedules, action definitions, executions and notification history|
|Redis + persistent job queue|Queue and coordinate background tasks|
|Scheduler service|Detect due actions and enqueue execution jobs|
|Background worker|Execute supported internal actions or controlled browser automation|
|Nodemailer + Gmail SMTP|Send email notifications and reports|
|Hosting platform|Keep the database, scheduler and workers available independently of user devices|

Redis alone is not the authoritative record of a schedule. Store the schedule in PostgreSQL and use a durable queue and recovery process so jobs can be reconstructed after restarts.

## Phase 7 — Security, Reliability and Testing

Before release, the system must enforce the following:

- Authentication and ownership: A user can manage only their own automations and permitted data.
    
- Permission checks: Every action is authorized again when executed—not only when created.
    
- Safe command execution: Voice instructions must resolve to supported operations rather than arbitrary code or unrestricted server commands.
    
- Duplicate prevention: Retried jobs must not create duplicate reports, payments, emails, or records.
    
- Timezone and daylight-saving handling: Schedules must use a clearly defined time zone and recurrence policy.
    
- Failure recovery: The system must record missed schedules, retry appropriate failures, and alert the user if the action cannot complete.
    
- Sensitive operations: Destructive, external, financial, or otherwise high-impact actions must have appropriate confirmation and safeguards.
    
- Email security: Credentials stay on the server; the system must never expose SMTP secrets to the browser or logs.
    

Test each workflow with the user logged in, logged out, on a switched-off phone, during a worker restart, during a missed scheduled time, with a duplicate job, and with Gmail delivery failure.

## Phase 8 — Final Implementation Sequence

### 1

Profile voice configuration

Recording, transcription, field extraction, review and save.

### 2

Automation command builder

Voice or form input, parsing, validation and action preview.

### 3

Schedule persistence

One-time and recurring schedules, time zones, editing and cancellation.

### 4

Background execution

Server scheduler, durable queue, worker, retries and duplicate prevention.

### 5

Notification center

Notification records, read/unread controls, event history and report pages.

### 6

Gmail delivery

Nodemailer SMTP setup, templates, delivery tracking and retry processing.

### 7

Security and recovery

Permissions, audit history, server restarts, missed jobs and failure alerts.

### 8

Production deployment

Host the application and workers, secure environment variables, monitor the system and test end-to-end.

Final design principle: Voice is the interface for creating instructions; PostgreSQL stores the agreed instructions; the server scheduler determines when to run them; background workers perform the work; and the notification center and email communicate what was planned and what actually happened.

This separates the user's device from the execution process and makes the feature reliable, manageable, and expandable.