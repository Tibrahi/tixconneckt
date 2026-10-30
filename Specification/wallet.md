# TixConneckt — Account & Transaction Verification System

1. AI transaction proof

Members can upload a screenshot, image, PDF, receipt, or transaction document, or paste a transaction message. The AI extracts only the required fields and prepares a transaction for verification.

2. Member approval

The designated reviewer checks the evidence and either approves or rejects it. A rejection must include a reason. Pending deposits do not increase the available balance.

3. Automatic account updates

When a transaction is approved, the system records it in the ledger, credits the correct member's account, and updates the savings progress without requiring manual re-entry.

4. Secure withdrawals and notifications

Members can withdraw only their own eligible assets. A successful withdrawal triggers an account notification and an email to the system administrators, with appropriate privacy controls.

## 1. Account page concept

## TixConneckt Wallet

Personal assets · Shared savings group

Protected

My available balance

# RWF 250,000

Pending approval: RWF 30,000

Illustrative amounts — not real account data.

Deposit

Withdraw

### My savings target

RWF 250,000 of RWF 500,000

50%

Target date: 31 December 2026

### Recent transactions

Savings contribution

TX-10024 · 24 Oct 2026

+ RWF 50,000

Approved

Bank transfer proof

TX-10025 · Awaiting review

RWF 30,000

Pending

Account settings

Goals, minimum contribution, period and privacy

This is a conceptual preview of the account experience, not a live connection to TixConneckt or TixlPay.

## 2. How the AI transaction-proof workflow should work

Step 1 — Upload or paste

The member submits a screenshot, PDF, image, receipt, or copied payment message.

### Try the transaction intake preview

Paste messageUpload proof

Demo only: pasted content is not processed by an actual AI service here.

#### Step 2 — Extracted fields preview

In production, these fields are filled by the parser and remain read-only for the member.

Transaction amount (RWF)

Transaction reference

Sender

Recipient

Verification status

Awaiting proof verification

Submit for verification

Step 3 — AI extraction and validation

Extract the amount, currency, sender, recipient, transaction reference, date and payment status. Store the original evidence and extraction confidence. Reject incomplete or ambiguous data for manual review.

Step 4 — Independent review

An authorized reviewer sees the proof, parsed fields and transaction history. The reviewer approves or rejects with a reason. The uploader cannot approve their own transaction.

Step 5 — Record and credit

On approval, the server verifies that the transaction is genuine and not already credited, records the ledger entry and updates the available balance atomically.

Important security rule: AI reading a receipt is not proof that a payment actually happened. The system should verify against a trusted payment-provider transaction record or another reliable confirmation method. Otherwise, forged screenshots could create false balances.

## 3. Account configuration

Each member should have an independently configurable savings account.

|Setting|Purpose|
|---|---|
|Minimum contribution|Lowest permitted contribution per transaction or period|
|Maximum contribution|Optional upper limit for contributions|
|Savings target|Amount the member wants to save|
|Savings period|Start date, target date and contribution frequency|
|Withdrawal rules|Allowed amounts, fees, cooldowns or approval requirements|
|Notification preferences|Email and in-app alerts|
|Privacy|Personal balance, transaction and proof visibility|
|Account status|Active, restricted, locked or closed|

The system should distinguish the minimum contribution, maximum contribution, and minimum withdrawal. These are different rules and should not be confused with the savings target.

## 4. Member privacy and asset ownership

Your requirement that each person is responsible for their own assets is fundamental.

- A member can see and manage their own balance, proofs, transactions and savings settings.
    
- Other members cannot access their personal balances or transaction details by default.
    
- Authorized reviewers can see only the information needed to verify transactions assigned to them.
    
- Administrators can manage system operations and audit events, but sensitive financial information should be restricted by role.
    
- Shared group totals should only be visible when the group rules explicitly allow them.
    

A withdrawal should reduce the member's available balance only when the withdrawal is confirmed under the chosen payment-provider workflow. A pending withdrawal should reserve the relevant funds to prevent double spending.

## 5. TixlPay withdrawal and notification flow

The intended flow is:

Member requests withdrawal

Validate identity, ownership and available balance

Create withdrawal request

Reserve funds and submit to the verified TixlPay integration

Verify provider confirmation

Use an authenticated callback or provider status check

Record final transaction

Update ledger and notify the member and administrators by email

For security, emails should normally state the member, amount, status and transaction reference without exposing unnecessary bank details or identity documents. Failed withdrawals should release reserved funds when the provider confirms failure.

The exact TixlPay integration depends on its actual API, supported currencies, withdrawal methods, authentication and webhook documentation. These capabilities need to be verified before implementation.

## 6. Suggested technical architecture

- Frontend: TixConneckt account dashboard, transaction upload, review queue, savings configuration and notification center.
    
- Backend: Authenticated APIs for transaction submission, approvals, account balances, withdrawals and audit logs.
    
- AI/document service: OCR and language-model extraction into a strict structured schema, with confidence checks and validation.
    
- Database: Users, accounts, transaction evidence, transactions, approval records, ledger entries, savings goals, withdrawals and notifications.
    
- Payment integration: Provider API, authenticated callbacks, idempotency keys and reconciliation.
    
- Email service: Approval, rejection and withdrawal notifications.
    

The balance must never be calculated from AI output alone. A secure ledger should be the source of truth, with every credit and debit linked to a unique transaction and an audit trail.

## 7. Formal system requirements document

I recommend using the following as the initial product requirements document for the TixConneckt development team.

# TixConneckt Personal Assets & Transaction Verification System

**Document type:** Initial Product Requirements Specification  
**Version:** 1.0  
**Status:** Proposed

## 1. Objective

Develop an integrated account-management and transaction-verification system within TixConneckt that enables members to manage their own assets, submit transaction evidence, configure savings goals, verify contributions and request withdrawals securely.

## 2. Functional requirements

### FR-01: Transaction evidence submission

Members shall be able to submit transaction evidence using:

- Image or screenshot uploads.
    
- PDF documents and supported receipts.
    
- Pasted transaction messages.
    
- Other explicitly supported file formats.
    

The system shall validate file types and sizes, securely store the original evidence and associate each submission with the authenticated member.

### FR-02: AI-powered field extraction

The document-processing service shall extract available fields, including:

- Transaction amount and currency.
    
- Transaction date and time.
    
- Sender and recipient.
    
- Transaction reference.
    
- Payment provider.
    
- Payment status, where supported.
    

Extracted fields shall automatically populate a read-only review form. Members shall not be able to edit extracted values directly. Incorrect extractions shall be corrected through a controlled reprocessing or authorized correction workflow.

### FR-03: Transaction validation

The system shall check required fields, supported currencies, transaction references, duplicate submissions and evidence quality. Where available, the system shall verify the transaction against a trusted provider record.

Unverified transactions shall not increase the member's available balance.

### FR-04: Approval and rejection

Each submitted transaction shall be assigned to an authorized reviewer or approval queue.

Reviewers shall be able to:

- Inspect original evidence and extracted fields.
    
- Approve valid transactions.
    
- Reject invalid or insufficient evidence with a mandatory reason.
    
- Request additional evidence where necessary.
    

A member shall not approve their own submission. All review decisions shall be recorded with the reviewer, timestamp and reason.

### FR-05: Ledger and account balance

Once approval and payment verification requirements are satisfied, the system shall record the transaction in the financial ledger and update the appropriate account balance.

Balance changes shall be atomic, traceable and protected against duplicate processing. Pending transactions shall not count as available funds.

### FR-06: Personal account configuration

Each member shall be able to configure permitted account settings, including:

- Savings target.
    
- Minimum and maximum contribution limits.
    
- Savings start date and target date.
    
- Contribution frequency.
    
- Applicable withdrawal rules.
    
- Notification preferences.
    

The system shall validate configurations against group policies and administrator-defined limits.

### FR-07: Asset ownership and privacy

Each member shall have access to their own account details and assets. Other members shall not be able to access another member's personal balance, transaction evidence or private transaction history unless explicitly authorized by a defined policy.

Role-based access controls shall distinguish members, reviewers and administrators. Administrative access shall be limited and auditable.

### FR-08: Withdrawals and TixlPay integration

The system shall support a withdrawal workflow through a verified TixlPay integration, subject to provider capabilities.

Before initiating a withdrawal, the system shall verify account ownership, available funds, applicable limits and required authorization.

The system shall reserve funds while a withdrawal is pending, prevent duplicate requests and reconcile the final status with the payment provider.

### FR-09: Notifications

The system shall provide appropriate in-app and email notifications for:

- Transaction submission.
    
- Approval.
    
- Rejection and its reason.
    
- Requests for additional evidence.
    
- Withdrawal initiation.
    
- Successful or failed withdrawals.
    

A successful withdrawal shall trigger an email to designated system administrators. Notifications shall not expose unnecessary sensitive financial information.

### FR-10: Audit and security

The system shall maintain an auditable record of submissions, approvals, rejections, balance changes, withdrawals and administrative actions.

Security controls shall include authentication, authorization, encrypted transport, protected file storage, rate limiting, duplicate detection, secure payment callbacks and appropriate retention policies.

## 3. Transaction statuses

The proposed statuses are:

- Draft.
    
- Submitted.
    
- Processing.
    
- Awaiting review.
    
- Additional evidence required.
    
- Rejected.
    
- Approved.
    
- Credited.
    
- Withdrawal pending.
    
- Withdrawal completed.
    
- Withdrawal failed.
    
- Cancelled, where permitted.
    

Approval and actual ledger credit should be represented separately so that failed processing can be detected and reconciled.

## 4. Core acceptance criteria

1. A member can submit a supported transaction document or paste a transaction message.
    
2. Extracted fields populate a read-only form.
    
3. Invalid or incomplete evidence is flagged.
    
4. Pending transactions do not increase available balances.
    
5. Rejected transactions display the recorded reason.
    
6. An approved and verified contribution is credited exactly once.
    
7. Members cannot access or withdraw another member's assets.
    
8. Withdrawal requests cannot exceed available eligible funds.
    
9. Confirmed withdrawals generate the required member and administrator notifications.
    
10. Every financial balance change can be traced to an authorized ledger entry.
    

## 5. Implementation dependencies

Before release, the development team must confirm the TixConneckt application architecture, identity and authorization model, database schema, available email service, AI/OCR provider, and TixlPay integration documentation.

## 6. Definition of success

The system is successful when members can submit transaction evidence without manually re-entering its fields, authorized reviewers can verify or reject submissions, approved contributions are credited exactly once, and personal assets remain isolated from other members while all financial actions remain auditable.

## What should we build first?

To turn this into the actual TixConneckt system, I need one key detail: is TixConneckt already an existing website or application, or are you building it from scratch?

That determines whether the next step should be integrating these features into the existing account page or creating the full application, database and transaction-verification backend.