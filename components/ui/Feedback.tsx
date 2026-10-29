import type { ReactNode } from "react";
import { Button } from "./Button";
import { Icon } from "./Icon";

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <span role="status" aria-label={label} className="inline-flex items-center gap-2 text-sm text-black">
      <Icon name="spinner" spin />
      <span>{label}…</span>
    </span>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-md bg-neutral-200 ${className}`}
    />
  );
}

export function SkeletonList({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2" aria-label="Loading content">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  );
}

export function EmptyState({
  icon = "circle-info",
  title,
  message,
  action,
}: {
  icon?: string;
  title: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-neutral-300 bg-white px-4 py-10 text-center">
      <span className="text-2xl" aria-hidden="true">
        <Icon name={icon} />
      </span>
      <h3 className="text-base font-semibold text-black">{title}</h3>
      <p className="max-w-md text-sm text-neutral-600">{message}</p>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function LoadError({
  message = "We couldn't load this content. Please try again.",
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-neutral-200 bg-white px-4 py-8 text-center">
      <span className="text-2xl" aria-hidden="true">
        <Icon name="warning" />
      </span>
      <p className="text-sm text-black">{message}</p>
      {onRetry ? (
        <Button variant="secondary" size="sm" icon="refresh" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </div>
  );
}

/** Banner for integrations that are not configured — pending, never fake. */
export function PendingIntegration({ name, detail }: { name: string; detail?: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
      <span className="mt-0.5" aria-hidden="true">
        <Icon name="hourglass" />
      </span>
      <div>
        <p className="text-sm font-semibold text-black">{name} is pending configuration</p>
        <p className="mt-0.5 text-sm text-neutral-700">
          {detail ?? "This integration is not connected yet. Your data is saved; the automated step will run once it is configured."}
        </p>
      </div>
    </div>
  );
}
