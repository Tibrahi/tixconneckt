/**
 * Versioned legal documents. Current versions are seeded into legal_documents
 * and served on /legal/*; consent records pin the accepted version.
 */

export const LEGAL_VERSION = "1.0.0";

export interface LegalDoc {
  type: "privacy" | "terms" | "agreement";
  version: string;
  title: string;
  body: string;
}

export const LEGAL_DOCUMENTS: LegalDoc[] = [
  {
    type: "privacy",
    version: LEGAL_VERSION,
    title: "TIXCONNECKT Privacy Policy",
    body: `TIXCONNECKT PRIVACY POLICY (Version ${LEGAL_VERSION})

1. What we collect
We collect your name, email address, phone number, country, profile details you provide (education, objectives, skills), project content, messages, transaction records, and security metadata such as login times, IP addresses, and device identifiers.

2. How we use your data
We use your data to operate your account, connect you with collaborators and providers, process funding workflows, send security and workflow notifications, prevent fraud, and comply with legal obligations.

3. AI and cloud processing
Profile interpretation, matching assistance, project analysis, document parsing, and voice transcription are processed through our configured AI providers (Muse Spark and Muse Voice) and cloud infrastructure. Only the data required for the requested operation is transmitted.

4. What we share
We share profile information according to your visibility settings. Providers see only the project summaries permitted at each request stage. We never sell your personal data.

5. Your responsibilities
You are responsible for keeping your credentials secret, for links and files you share, and for the accuracy of documents you upload. Malicious links, credential sharing, and misrepresentation may lead to suspension.

6. Retention and deletion
Financial, agreement, and audit records required by law are retained for the legally required period. On account deletion, eligible personal information is removed or anonymized as described in Settings.

7. Contact
For privacy questions, contact the system administrator through the official support channel published in the application.`,
  },
  {
    type: "terms",
    version: LEGAL_VERSION,
    title: "TIXCONNECKT Terms of Service",
    body: `TIXCONNECKT TERMS OF SERVICE (Version ${LEGAL_VERSION})

1. The service
TIXCONNECKT connects individuals, groups, universities, governments, and funding or support providers to collaborate on projects and funding opportunities.

2. Eligibility and accounts
You must provide accurate registration information and keep your account secure. One account per person unless an organization account is authorized by an administrator.

3. Acceptable use
You must not upload malicious content, misrepresent transactions, impersonate others, scrape private data, bypass access controls, or use the platform for unlawful purposes.

4. Projects and funding
Project content you submit remains yours. Funding, loans, and agreements arranged through the platform are between you and the other parties; TIXCONNECKT provides the workflow, records, and audit trail but is not a party to your agreements unless explicitly stated in writing.

5. AI-assisted features
AI outputs (matching suggestions, transcriptions, document extraction, project analysis) are proposals that may contain errors. You must review consequential results before relying on them.

6. Plans and payments
Paid plans are activated only after a verified payment event or an authorized administrative action. Plan benefits are defined on the Plans page for your account category.

7. Suspension and termination
We may suspend accounts that violate these terms, threaten security, or abuse the platform, with audit records of administrative actions.

8. Changes
Material changes to these terms will be published with a new version. Continued use after a new version takes effect constitutes acceptance.`,
  },
  {
    type: "agreement",
    version: LEGAL_VERSION,
    title: "TIXCONNECKT User Agreement",
    body: `TIXCONNECKT USER AGREEMENT (Version ${LEGAL_VERSION})

1. Your commitments
You agree to provide truthful information, protect your password and verification codes, review AI-assisted changes before saving them, and honor the agreements you accept with other users and providers.

2. Funding honesty
You agree that uploaded transaction evidence and funding requests are genuine. Fabricated proofs, duplicate claims, and double spending are prohibited and are recorded in the audit trail.

3. Confidentiality
Private projects, private messages, and financial records visible to you through the platform must not be disclosed outside the platform without authorization.

4. Provider interactions
Providers evaluate projects based on the summaries and agreements exchanged in the Request module. Acceptance of an agreement is recorded with its version, parties, and timestamps.

5. Liability
To the maximum extent permitted by law, TIXCONNECKT is not liable for collaboration outcomes, funding decisions, or third-party conduct. Nothing here limits liability that cannot be limited by law.

6. Acceptance
By checking the acceptance box after reading these documents, you confirm that you have read and agree to the Privacy Policy, Terms of Service, and this User Agreement (Version ${LEGAL_VERSION}). Your acceptance version and timestamp are stored with your account.`,
  },
];
