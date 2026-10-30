import nodemailer, { type Transporter } from "nodemailer";
import { emailConfigured } from "./config";

let cached: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (!emailConfigured()) return null;
  if (cached) return cached;
  cached = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT ?? 465),
    secure: Number(process.env.SMTP_PORT ?? 465) === 465,
    connectionTimeout: 5_000,
    greetingTimeout: 5_000,
    socketTimeout: 15_000,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  return cached;
}

export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface SendEmailResult {
  sent: boolean;
  pendingReason?: string;
  error?: string;
}

/**
 * Send a system email. When SMTP is not configured the call is recorded as
 * pending (never fake-sent) so business operations are not misrepresented.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const transporter = getTransporter();
  if (!transporter) {
    console.warn(
      `[email:pending] SMTP not configured; email to ${input.to} not sent: ${input.subject}`,
    );
    return { sent: false, pendingReason: "SMTP is not configured" };
  }
  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM ?? "TIXCONNECKT <no-reply@tixconneckt.com>",
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
    return { sent: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown email error";
    console.error(`[email:failed] to=${input.to} subject=${input.subject}: ${message}`);
    return { sent: false, error: message };
  }
}

export function otpEmail(code: string, purpose: string): { subject: string; text: string } {
  return {
    subject: `TIXCONNECKT verification code for ${purpose}`,
    text: `Your TIXCONNECKT verification code is: ${code}\n\nIt expires in 10 minutes. If you did not request this code, ignore this message.`,
  };
}

export function activationEmail(name: string): { subject: string; text: string } {
  return {
    subject: "Your TIXCONNECKT account is active",
    text: `Hello ${name},\n\nYour TIXCONNECKT account has been activated. You can now sign in and start connecting.`,
  };
}

export function securityAlertEmail(event: string, detail?: string): { subject: string; text: string } {
  return {
    subject: "TIXCONNECKT security notification",
    text: `Security event on your account: ${event}${detail ? `\n\n${detail}` : ""}\n\nIf this was not you, change your password immediately.`,
  };
}

export function passwordChangedEmail(name: string): { subject: string; text: string } {
  return {
    subject: "Your TIXCONNECKT password was changed",
    text: `Hello ${name},\n\nYour password was changed successfully. Existing sessions on other devices were revoked.`,
  };
}

export interface WalletEventEmailInput {
  memberName: string;
  amountMinor: number;
  currency: string;
  status: string;
  reference: string;
  reason?: string;
}

function formatMajor(amountMinor: number, currency: string): string {
  return `${(amountMinor / 100).toLocaleString("en-US")} ${currency}`;
}

/**
 * Wallet notifications carry only member, amount, status, and reference
 * (wallet.md §5) — never bank details or identity documents.
 */
export function depositDecisionEmail(input: WalletEventEmailInput): { subject: string; text: string } {
  const approved = input.status === "approved" || input.status === "credited";
  return {
    subject: approved
      ? `TIXCONNECKT deposit approved (${input.reference})`
      : `TIXCONNECKT deposit ${input.status} (${input.reference})`,
    text:
      `Hello ${input.memberName},\n\n` +
      `Your deposit of ${formatMajor(input.amountMinor, input.currency)} ` +
      `(${input.reference}) was ${input.status}.` +
      (input.reason ? `\n\nReason: ${input.reason}` : "") +
      `\n\nSign in to TIXCONNECKT to view your transaction history.`,
  };
}

export function evidenceRequestEmail(input: WalletEventEmailInput): { subject: string; text: string } {
  return {
    subject: `TIXCONNECKT needs more evidence (${input.reference})`,
    text:
      `Hello ${input.memberName},\n\n` +
      `Your deposit of ${formatMajor(input.amountMinor, input.currency)} ` +
      `(${input.reference}) needs additional evidence before it can be verified.` +
      (input.reason ? `\n\nWhat is needed: ${input.reason}` : "") +
      `\n\nSign in to TIXCONNECKT to provide it.`,
  };
}

export function actionResultEmail(input: {
  title: string;
  outcome: "completed" | "failed";
  detail: string;
}): { subject: string; text: string } {
  return {
    subject: `TIXCONNECKT scheduled action ${input.outcome}: ${input.title}`,
    text:
      `Your scheduled action "${input.title}" ${input.outcome}.\n\n` +
      `Result: ${input.detail}\n\n` +
      `Open Actions in TIXCONNECKT to review the full history.`,
  };
}

export function withdrawalEmail(input: WalletEventEmailInput): { subject: string; text: string } {
  return {
    subject: `TIXCONNECKT withdrawal ${input.status} (${input.reference})`,
    text:
      `Member: ${input.memberName}\n` +
      `Amount: ${formatMajor(input.amountMinor, input.currency)}\n` +
      `Status: ${input.status}\n` +
      `Reference: ${input.reference}` +
      (input.reason ? `\nNote: ${input.reason}` : ""),
  };
}
