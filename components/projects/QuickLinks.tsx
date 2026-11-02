"use client";

import { Icon } from "@/components/ui/Icon";

export interface QuickLink {
  id: string;
  label: string;
  icon: string;
  onClick: () => void;
  disabled?: boolean;
}

export function QuickLinks({ links }: { links: QuickLink[] }) {
  return (
    <nav aria-label="Project quick actions" className="grid grid-cols-2 gap-1.5">
      {links.map((l) => (
        <button
          key={l.id}
          type="button"
          onClick={l.onClick}
          disabled={l.disabled}
          title={l.label}
          className="flex min-h-10 min-w-0 items-center gap-2 rounded-lg border border-neutral-200 bg-white px-2.5 py-2 text-left text-xs font-medium text-neutral-800 transition-colors hover:border-brand-400 hover:bg-brand-50 hover:text-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Icon name={l.icon} className="shrink-0 text-brand-600" />
          <span className="min-w-0 leading-tight">{l.label}</span>
        </button>
      ))}
    </nav>
  );
}
