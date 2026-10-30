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

export function otpEmail(code: string, purpose: string): { subject: string; text: string; html: string } {
  const purposeLabel = ({ register: "creating your account", login: "signing in", recovery: "resetting your password" } as Record<string, string>)[purpose] ?? "verifying your account";
  const digits = [...code].map((digit) => `<td style="width:42px;height:48px;border:1px solid #d8dee8;border-radius:8px;background:#f8fafc;text-align:center;font:700 22px Arial,sans-serif;color:#172033">${digit}</td>`).join("<td style=\"width:6px\"></td>");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  const logo = appUrl?.startsWith("https://") ? `<img src="${appUrl}/logo.png" width="40" height="40" alt="TIXCONNECKT" style="display:block;border:0">` : "";
  const html = `<!doctype html><html><body style="margin:0;background:#f3f5f8;font-family:Arial,Helvetica,sans-serif;color:#172033"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 12px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fff;border:1px solid #e5e9f0;border-radius:14px"><tr><td style="padding:28px 32px 12px"><table role="presentation"><tr><td style="padding-right:12px">${logo}</td><td style="font-size:17px;font-weight:700;letter-spacing:.3px">TIXCONNECKT</td></tr></table></td></tr><tr><td style="padding:18px 32px 32px"><p style="margin:0 0 8px;color:#526078;font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase">Security verification</p><h1 style="margin:0 0 14px;font-size:24px;line-height:1.3">Confirm it’s you</h1><p style="margin:0 0 22px;color:#526078;font-size:15px;line-height:1.6">Use this code to continue ${purposeLabel}. Enter each digit on the verification screen.</p><table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 auto 22px"><tr>${digits}</tr></table><p style="margin:0 0 18px;text-align:center;color:#68758b;font-size:13px">The code expires in <strong>10 minutes</strong>.</p><div style="padding:14px 16px;background:#f6f8fb;border-radius:8px;color:#526078;font-size:13px;line-height:1.5">If you did not request this code, you can safely ignore this email. Never share a verification code with anyone.</div></td></tr><tr><td style="padding:18px 32px;border-top:1px solid #e9edf2;color:#788397;font-size:12px;line-height:1.5">This is an automated account security email from TIXCONNECKT. Please do not reply. Keep your account secure by never forwarding this message.</td></tr></table><p style="margin:14px 0 0;color:#8a94a6;font-size:11px">© ${new Date().getFullYear()} TIXCONNECKT</p></td></tr></table></body></html>`;
  return {
    subject: "Your TIXCONNECKT verification code",
    text: `Confirm it’s you\n\nUse this code to continue ${purposeLabel}: ${code}\n\nIt expires in 10 minutes. If you did not request this code, ignore this email. Never share a verification code with anyone.`,
    html,
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
