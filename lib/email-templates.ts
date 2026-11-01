/**
 * Corporate email design system: one shared table-based layout (Gmail /
 * Outlook / Apple Mail compatible, inline CSS only, no media queries) with
 * per-purpose content builders. Every dynamic value is HTML-escaped.
 *
 * Absolute URLs (logo, buttons, links) render only when the app URL is
 * https — never localhost or relative paths — so production emails work and
 * development emails degrade to clean text guidance.
 */

export interface BuiltEmail {
  subject: string;
  text: string;
  html: string;
}

const INK = "#172033";
const MUTED = "#526078";
const FAINT = "#788397";
const BORDER = "#e5e9f0";
const CANVAS = "#f3f5f8";
const BRAND = "#1d4ed8";
const SUCCESS_BG = "#f0fdf4";
const SUCCESS_BD = "#bbf7d0";
const SUCCESS_TX = "#15803d";
const WARN_BG = "#fffbeb";
const WARN_BD = "#fde68a";
const WARN_TX = "#b45309";
const DANGER_BG = "#fef2f2";
const DANGER_BD = "#fecaca";
const DANGER_TX = "#b91c1c";

/** Escape every dynamic value interpolated into email HTML. */
export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** https app base URL, or null when not production-configured. */
export function appBaseUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  return raw?.startsWith("https://") ? raw : null;
}

function logoBlock(): string {
  const base = appBaseUrl();
  const img = base
    ? `<img src="${base}/logo.png" width="40" height="40" alt="TIXCONNECKT" style="display:block;border:0;width:40px;height:40px">`
    : "";
  return `<table role="presentation" cellspacing="0" cellpadding="0"><tr>${
    img ? `<td style="padding-right:12px">${img}</td>` : ""
  }<td style="font-size:17px;font-weight:700;letter-spacing:.3px;color:${INK};font-family:Arial,Helvetica,sans-serif">TIXCONNECKT</td></tr></table>`;
}

function footerBlock(): string {
  const base = appBaseUrl();
  const replyTo = process.env.MAIL_REPLY_TO?.trim();
  const site = base
    ? `<a href="${base}" style="color:${BRAND};text-decoration:underline">our website</a>`
    : "our website";
  const contact = replyTo
    ? `Questions? Contact us at ${escapeHtml(replyTo)}.`
    : "This is an automated message. Please do not reply to this email.";
  return (
    `<div style="padding:18px 32px;border-top:1px solid #e9edf2;color:${FAINT};font-size:12px;line-height:1.6;font-family:Arial,Helvetica,sans-serif">` +
    `TIXCONNECKT · ${site}<br>${contact}<br>© ${new Date().getFullYear()} TIXCONNECKT. All rights reserved.` +
    `</div>`
  );
}

function button(href: string, label: string): string {
  return (
    `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:6px 0 20px"><tr><td>` +
    `<a href="${href}" style="display:inline-block;padding:12px 24px;background:${BRAND};color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;border-radius:8px;font-family:Arial,Helvetica,sans-serif">${label}</a>` +
    `</td></tr></table>`
  );
}

function panel(bg: string, border: string, html: string): string {
  return `<div style="padding:14px 16px;background:${bg};border:1px solid ${border};border-radius:8px;color:${MUTED};font-size:14px;line-height:1.6;font-family:Arial,Helvetica,sans-serif">${html}</div>`;
}

function baseEmail(opts: {
  eyebrow: string;
  heading: string;
  introHtml: string;
  bodyHtml: string;
  preheader?: string;
}): string {
  return (
    `<!doctype html><html><body style="margin:0;background:${CANVAS};font-family:Arial,Helvetica,sans-serif;color:${INK}">` +
    (opts.preheader
      ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(opts.preheader)}</div>`
      : "") +
    `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 12px"><tr><td align="center">` +
    `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid ${BORDER};border-radius:14px">` +
    `<tr><td style="padding:28px 32px 12px">${logoBlock()}</td></tr>` +
    `<tr><td style="padding:18px 32px 32px">` +
    `<p style="margin:0 0 8px;color:${MUTED};font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase">${escapeHtml(opts.eyebrow)}</p>` +
    `<h1 style="margin:0 0 14px;font-size:24px;line-height:1.3;color:${INK}">${escapeHtml(opts.heading)}</h1>` +
    `<p style="margin:0 0 22px;color:${MUTED};font-size:15px;line-height:1.6">${opts.introHtml}</p>` +
    opts.bodyHtml +
    `</td></tr><tr><td>${footerBlock()}</td></tr></table>` +
    `<p style="margin:14px 0 0;color:#8a94a6;font-size:11px;font-family:Arial,Helvetica,sans-serif">© ${new Date().getFullYear()} TIXCONNECKT</p>` +
    `</td></tr></table></body></html>`
  );
}

function signInButton(): string {
  const base = appBaseUrl();
  return base ? button(`${base}/login`, "Sign in to TIXCONNECKT") : "";
}

function appLink(path: string, label: string): string {
  const base = appBaseUrl();
  return base
    ? `<a href="${base}${path}" style="color:${BRAND};text-decoration:underline">${escapeHtml(label)}</a>`
    : escapeHtml(label);
}

// ---------------------------------------------------------------------------
// Per-purpose emails. Subjects keep their established keywords; text keeps
// every operational token (names, references, statuses, reasons).
// ---------------------------------------------------------------------------

const PURPOSE_LABELS: Record<string, string> = {
  register: "creating your account",
  login: "signing in",
  recovery: "resetting your password",
};

export function otpEmail(code: string, purpose: string): BuiltEmail {
  const purposeLabel = PURPOSE_LABELS[purpose] ?? "verifying your account";
  const digits = [...code]
    .map(
      (digit) =>
        `<td style="width:42px;height:48px;border:1px solid #d8dee8;border-radius:8px;background:#f8fafc;text-align:center;font:700 22px Arial,sans-serif;color:${INK}">${escapeHtml(digit)}</td>`,
    )
    .join('<td style="width:6px"></td>');
  const warn = panel(WARN_BG, WARN_BD, "If you did not request this code, you can safely ignore this email. Never share a verification code with anyone.");
  const html = baseEmail({
    eyebrow: "Security verification",
    heading: "Confirm it’s you",
    introHtml: `Use this code to continue ${escapeHtml(purposeLabel)}. Enter each digit on the verification screen.`,
    bodyHtml:
      `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 auto 22px"><tr>${digits}</tr></table>` +
      `<p style="margin:0 0 18px;text-align:center;color:#68758b;font-size:13px;font-family:Arial,Helvetica,sans-serif">The code expires in <strong>10 minutes</strong>.</p>` +
      warn,
    preheader: `Your verification code: ${code}`,
  });
  return {
    subject: "Your TIXCONNECKT verification code",
    text: `Confirm it’s you\n\nUse this code to continue ${purposeLabel}: ${code}\n\nIt expires in 10 minutes. If you did not request this code, ignore this email. Never share a verification code with anyone.`,
    html,
  };
}

export function activationEmail(name: string): BuiltEmail {
  const html = baseEmail({
    eyebrow: "Welcome",
    heading: `Your account is active${name ? `, ${name}` : ""}`,
    introHtml: "Thanks for joining TIXCONNECKT. Your account is ready — here is what you can do first.",
    bodyHtml:
      `<ul style="margin:0 0 22px;padding-left:20px;color:${MUTED};font-size:15px;line-height:1.8;font-family:Arial,Helvetica,sans-serif">` +
      `<li>Complete your profile so others can find and trust you.</li>` +
      `<li>Publish a project or browse providers and opportunities.</li>` +
      `<li>Connect with members and follow up in real time.</li></ul>` +
      signInButton(),
    preheader: "Your TIXCONNECKT account is ready.",
  });
  return {
    subject: "Your TIXCONNECKT account is active",
    text: `Hello ${name},\n\nYour TIXCONNECKT account has been activated. You can now sign in, complete your profile, and start connecting.`,
    html,
  };
}

export function securityAlertEmail(event: string, detail?: string): BuiltEmail {
  const alert = panel(
    WARN_BG,
    WARN_BD,
    `<strong style="color:${WARN_TX}">Security event:</strong> ${escapeHtml(event)}${detail ? `<br><br>${escapeHtml(detail)}` : ""}`,
  );
  const html = baseEmail({
    eyebrow: "Security notification",
    heading: "Activity on your account",
    introHtml: "We noticed the following activity. If this was you, no action is needed.",
    bodyHtml:
      alert +
      `<p style="margin:18px 0 0;color:${MUTED};font-size:14px;line-height:1.6;font-family:Arial,Helvetica,sans-serif">If this was <strong>not</strong> you, change your password immediately from your ${appLink("/settings", "account settings")}.</p>`,
    preheader: `Security event: ${event}`,
  });
  return {
    subject: "TIXCONNECKT security notification",
    text: `Activity on your TIXCONNECKT account: ${event}${detail ? `\n\n${detail}` : ""}\n\nIf this was not you, change your password immediately.`,
    html,
  };
}

export function passwordChangedEmail(name: string): BuiltEmail {
  const ok = panel(SUCCESS_BG, SUCCESS_BD, "Your password was changed successfully. Existing sessions on other devices were revoked.");
  const html = baseEmail({
    eyebrow: "Security confirmation",
    heading: "Password changed",
    introHtml: `Hello ${escapeHtml(name)} — this email confirms a recent change to your account.`,
    bodyHtml:
      ok +
      `<p style="margin:18px 0 0;color:${MUTED};font-size:14px;line-height:1.6;font-family:Arial,Helvetica,sans-serif">If you did not make this change, start ${appLink("/forgot-password", "password recovery")} right away.</p>`,
    preheader: "Your password was changed.",
  });
  return {
    subject: "Your TIXCONNECKT password was changed",
    text: `Hello ${name},\n\nYour password was changed successfully. Existing sessions on other devices were revoked.\n\nIf this was not you, start password recovery immediately.`,
    html,
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

function receiptTable(rows: Array<[string, string]>): string {
  const cells = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:8px 16px 8px 0;color:${FAINT};font-size:14px;white-space:nowrap">${escapeHtml(k)}</td>` +
        `<td style="padding:8px 0;color:${INK};font-size:14px;font-weight:600">${escapeHtml(v)}</td></tr>`,
    )
    .join("");
  return `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 20px">${cells}</table>`;
}

/**
 * Wallet notifications carry only member, amount, status, and reference
 * (wallet.md §5) — never bank details or identity documents.
 */
export function depositDecisionEmail(input: WalletEventEmailInput): BuiltEmail {
  const approved = input.status === "approved" || input.status === "credited";
  const amount = formatMajor(input.amountMinor, input.currency);
  const statusPanel = approved
    ? panel(SUCCESS_BG, SUCCESS_BD, `<strong style="color:${SUCCESS_TX}">Approved.</strong> The funds were credited to the wallet.`)
    : panel(DANGER_BG, DANGER_BD, `This deposit was <strong style="color:${DANGER_TX}">${escapeHtml(input.status)}</strong>. Reserved funds were released.`);
  const reasonBlock = input.reason
    ? panel(WARN_BG, WARN_BD, `<strong>Reason:</strong> ${escapeHtml(input.reason)}`)
    : "";
  const html = baseEmail({
    eyebrow: approved ? "Deposit approved" : "Deposit update",
    heading: `Deposit ${approved ? "approved" : input.status}`,
    introHtml: `Hello ${escapeHtml(input.memberName)} — here is the decision on your deposit.`,
    bodyHtml:
      receiptTable([
        ["Amount", amount],
        ["Reference", input.reference],
        ["Status", input.status],
      ]) +
      statusPanel +
      (reasonBlock ? `<div style="margin-top:14px">${reasonBlock}</div>` : "") +
      `<p style="margin:18px 0 0;color:${MUTED};font-size:14px;font-family:Arial,Helvetica,sans-serif">View the full history in your ${appLink("/dashboard/wallet", "wallet")}.</p>`,
    preheader: `Deposit ${input.reference}: ${input.status}.`,
  });
  return {
    subject: approved
      ? `TIXCONNECKT deposit approved (${input.reference})`
      : `TIXCONNECKT deposit ${input.status} (${input.reference})`,
    text:
      `Hello ${input.memberName},\n\n` +
      `Your deposit of ${amount} (${input.reference}) was ${input.status}.` +
      (input.reason ? `\n\nReason: ${input.reason}` : "") +
      `\n\nSign in to TIXCONNECKT to view your transaction history.`,
    html,
  };
}

export function evidenceRequestEmail(input: WalletEventEmailInput): BuiltEmail {
  const amount = formatMajor(input.amountMinor, input.currency);
  const need = panel(
    WARN_BG,
    WARN_BD,
    `<strong style="color:${WARN_TX}">Action needed.</strong> Your deposit cannot be verified until you provide additional evidence.` +
      (input.reason ? `<br><br><strong>What is needed:</strong> ${escapeHtml(input.reason)}` : ""),
  );
  const html = baseEmail({
    eyebrow: "Action needed",
    heading: "More evidence needed",
    introHtml: `Hello ${escapeHtml(input.memberName)} — your deposit of ${escapeHtml(amount)} (${escapeHtml(input.reference)}) is waiting on you.`,
    bodyHtml:
      need +
      `<p style="margin:18px 0 0;color:${MUTED};font-size:14px;font-family:Arial,Helvetica,sans-serif">Provide it from your ${appLink("/dashboard/wallet", "wallet")} to continue verification.</p>`,
    preheader: `Deposit ${input.reference} needs evidence.`,
  });
  return {
    subject: `TIXCONNECKT needs more evidence (${input.reference})`,
    text:
      `Hello ${input.memberName},\n\n` +
      `Your deposit of ${amount} (${input.reference}) needs additional evidence before it can be verified.` +
      (input.reason ? `\n\nWhat is needed: ${input.reason}` : "") +
      `\n\nSign in to TIXCONNECKT to provide it.`,
    html,
  };
}

export function actionResultEmail(input: {
  title: string;
  outcome: "completed" | "failed";
  detail: string;
}): BuiltEmail {
  const ok = input.outcome === "completed";
  const result = ok
    ? panel(SUCCESS_BG, SUCCESS_BD, `<strong style="color:${SUCCESS_TX}">Completed.</strong> ${escapeHtml(input.detail)}`)
    : panel(DANGER_BG, DANGER_BD, `<strong style="color:${DANGER_TX}">Failed.</strong> ${escapeHtml(input.detail)}`);
  const html = baseEmail({
    eyebrow: ok ? "Scheduled action completed" : "Scheduled action failed",
    heading: input.title,
    introHtml: `Your scheduled action finished with the following result.`,
    bodyHtml:
      result +
      `<p style="margin:18px 0 0;color:${MUTED};font-size:14px;font-family:Arial,Helvetica,sans-serif">Open ${appLink("/dashboard/actions", "Actions")} to review the full history.</p>`,
    preheader: `${input.title}: ${input.outcome}.`,
  });
  return {
    subject: `TIXCONNECKT scheduled action ${input.outcome}: ${input.title}`,
    text:
      `Your scheduled action "${input.title}" ${input.outcome}.\n\n` +
      `Result: ${input.detail}\n\n` +
      `Open Actions in TIXCONNECKT to review the full history.`,
    html,
  };
}

export function upcomingActionEmail(input: { title: string; when: string }): BuiltEmail {
  const remind = panel(WARN_BG, WARN_BD, `Runs at <strong>${escapeHtml(input.when)}</strong>.`);
  const html = baseEmail({
    eyebrow: "Reminder",
    heading: input.title,
    introHtml: "Your scheduled action is coming up soon.",
    bodyHtml:
      remind +
      `<p style="margin:18px 0 0;color:${MUTED};font-size:14px;font-family:Arial,Helvetica,sans-serif">Open ${appLink("/dashboard/actions", "Actions")} to edit or cancel it.</p>`,
    preheader: `${input.title} runs at ${input.when}.`,
  });
  return {
    subject: `Upcoming scheduled action: ${input.title}`,
    text: `Your scheduled action "${input.title}" runs at ${input.when}. Open Actions in TIXCONNECKT to edit or cancel it.`,
    html,
  };
}

export function withdrawalEmail(input: WalletEventEmailInput): BuiltEmail {
  const amount = formatMajor(input.amountMinor, input.currency);
  const html = baseEmail({
    eyebrow: "Withdrawal update",
    heading: `Withdrawal ${input.status}`,
    introHtml: `Hello ${escapeHtml(input.memberName)} — here is the latest on your withdrawal.`,
    bodyHtml:
      receiptTable([
        ["Amount", amount],
        ["Status", input.status],
        ["Reference", input.reference],
      ]) +
      (input.reason ? panel(WARN_BG, WARN_BD, `<strong>Note:</strong> ${escapeHtml(input.reason)}`) : "") +
      `<p style="margin:18px 0 0;color:${MUTED};font-size:14px;font-family:Arial,Helvetica,sans-serif">View the full history in your ${appLink("/dashboard/wallet", "wallet")}.</p>`,
    preheader: `Withdrawal ${input.reference}: ${input.status}.`,
  });
  return {
    subject: `TIXCONNECKT withdrawal ${input.status} (${input.reference})`,
    text:
      `Member: ${input.memberName}\n` +
      `Amount: ${amount}\n` +
      `Status: ${input.status}\n` +
      `Reference: ${input.reference}` +
      (input.reason ? `\nNote: ${input.reason}` : ""),
    html,
  };
}

export function notificationEmail(input: { title: string; body?: string }): BuiltEmail {
  const html = baseEmail({
    eyebrow: "Notification",
    heading: input.title,
    introHtml: input.body ? escapeHtml(input.body) : "You have a new notification.",
    bodyHtml: signInButton(),
    preheader: input.body ?? input.title,
  });
  return {
    subject: `TIXCONNECKT: ${input.title}`,
    text: input.body ?? input.title,
    html,
  };
}
