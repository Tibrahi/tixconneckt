import nodemailer, { type Transporter } from "nodemailer";
import { emailConfigured } from "./config";

export {
  actionResultEmail,
  activationEmail,
  depositDecisionEmail,
  escapeHtml,
  evidenceRequestEmail,
  notificationEmail,
  otpEmail,
  passwordChangedEmail,
  securityAlertEmail,
  upcomingActionEmail,
  withdrawalEmail,
  type BuiltEmail,
  type WalletEventEmailInput,
} from "./email-templates";

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
  /** SMTP message id when the provider accepted the mail (accepted ≠ inbox). */
  messageId?: string;
}

/** Reject malformed recipients and header-injection payloads before sending. */
export function validateRecipient(to: string): string | null {
  if (to.includes("\r") || to.includes("\n")) return "Invalid recipient address.";
  if (to.length === 0 || to.length > 254) return "Invalid recipient address.";
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(to)) return "Invalid recipient address.";
  return null;
}

function hasHeaderInjection(value: string): boolean {
  return value.includes("\r") || value.includes("\n");
}

/** True for transient SMTP failures worth a single retry (4xx, timeouts). */
export function isTransientSmtpError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; responseCode?: unknown };
  if (typeof candidate.responseCode === "number") {
    return candidate.responseCode >= 400 && candidate.responseCode < 500;
  }
  return (
    typeof candidate.code === "string" &&
    ["ECONNRESET", "ETIMEDOUT", "EPIPE", "ESOCKET", "EAI_AGAIN"].includes(candidate.code)
  );
}

const RETRY_DELAY_MS = 1_000;

async function attempt(
  transporter: Transporter,
  input: SendEmailInput,
): Promise<{ messageId?: string }> {
  const info = await transporter.sendMail({
    from: process.env.SMTP_FROM ?? "TIXCONNECKT <no-reply@tixconneckt.com>",
    replyTo: process.env.MAIL_REPLY_TO?.trim() || undefined,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
  });
  return { messageId: typeof info?.messageId === "string" ? info.messageId : undefined };
}

/**
 * Send a system email through the centralized Nodemailer + SMTP service.
 * When SMTP is not configured the call is recorded as pending (never
 * fake-sent). Transient SMTP failures get one retry; `sent` means the
 * provider accepted the message, not confirmed inbox delivery.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const badRecipient = validateRecipient(input.to);
  if (badRecipient) return { sent: false, error: badRecipient };
  if (hasHeaderInjection(input.subject)) return { sent: false, error: "Invalid subject." };
  const transporter = getTransporter();
  if (!transporter) {
    console.warn(
      `[email:pending] SMTP not configured; email to ${input.to} not sent: ${input.subject}`,
    );
    return { sent: false, pendingReason: "SMTP is not configured" };
  }
  try {
    const { messageId } = await attempt(transporter, input);
    console.log(`[email:sent] to=${input.to} messageId=${messageId ?? "unknown"} subject=${input.subject}`);
    return { sent: true, messageId };
  } catch (firstError) {
    if (isTransientSmtpError(firstError)) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      try {
        const { messageId } = await attempt(transporter, input);
        console.log(
          `[email:sent-retry] to=${input.to} messageId=${messageId ?? "unknown"} subject=${input.subject}`,
        );
        return { sent: true, messageId };
      } catch {
        // Fall through to the honest failure below.
      }
    }
    const message = firstError instanceof Error ? firstError.message : "Unknown email error";
    console.error(`[email:failed] to=${input.to} subject=${input.subject}: ${message}`);
    return { sent: false, error: message };
  }
}
