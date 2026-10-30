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
    <nav aria-label="Project quick links" className="flex gap-1.5 overflow-x-auto pb-1">
      {links.map((l) => (
        <button
          key={l.id}
          type="button"
          onClick={l.onClick}
          disabled={l.disabled}
          title={l.label}
          className="flex shrink-0 items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-black hover:border-brand-400 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Icon name={l.icon} className="text-brand-600" />
          {l.label}
        </button>
      ))}
    </nav>
  );
}
