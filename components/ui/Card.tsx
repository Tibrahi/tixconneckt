import type { ReactNode } from "react";

export function Card({
  title,
  subtitle,
  actions,
  children,
  className = "",
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-lg border border-neutral-200 bg-white p-4 sm:p-5 ${className}`}>
      {title || actions ? (
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            {title ? <h2 className="text-base font-semibold text-black">{title}</h2> : null}
            {subtitle ? <p className="mt-0.5 text-sm text-neutral-600">{subtitle}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger";

const TONES: Record<BadgeTone, string> = {
  neutral: "bg-neutral-100 text-black border-neutral-300",
  info: "bg-brand-50 text-brand-800 border-brand-200",
  success: "bg-green-50 text-green-800 border-green-200",
  warning: "bg-amber-50 text-amber-800 border-amber-200",
  danger: "bg-red-50 text-red-800 border-red-200",
};

export function Badge({
  tone = "neutral",
  children,
  className = "",
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/** Status text is never color-alone: label text always accompanies the tone. */
export function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase().replace(/_/g, " ");
  const tone: BadgeTone =
    /active|accepted|approved|completed|success|verified|sent|funded/i.test(status)
      ? "success"
      : /pending|progress|review|scheduled|confirmed|processing/i.test(status)
        ? "info"
        : /draft|cancelled|expired|dismissed/i.test(status)
          ? "neutral"
          : /fail|reject|error|deactiv|delet|block/i.test(status)
            ? "danger"
            : "warning";
  return <Badge tone={tone}>{normalized}</Badge>;
}
