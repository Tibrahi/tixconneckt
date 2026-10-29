"use client";

import { useState, type ReactNode } from "react";
import { Icon } from "./Icon";

export function Tabs({
  tabs,
  initial = 0,
  onChange,
}: {
  tabs: Array<{ id: string; label: string; icon?: string; content: ReactNode }>;
  initial?: number;
  onChange?: (id: string) => void;
}) {
  const [active, setActive] = useState(initial);
  return (
    <div>
      <div role="tablist" aria-label="Sections" className="flex flex-wrap gap-1 border-b border-neutral-200">
        {tabs.map((tab, i) => {
          const selected = i === active;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={selected}
              onClick={() => {
                setActive(i);
                onChange?.(tab.id);
              }}
              className={`inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium ${
                selected
                  ? "border-brand-600 text-brand-700"
                  : "border-transparent text-black hover:border-neutral-300"
              }`}
            >
              {tab.icon ? <Icon name={tab.icon} className={selected ? "text-brand-600" : ""} /> : null}
              {tab.label}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" className="pt-4">
        {tabs[active]?.content}
      </div>
    </div>
  );
}

export function Accordion({
  items,
}: {
  items: Array<{ id: string; title: string; content: ReactNode }>;
}) {
  const [open, setOpen] = useState<string | null>(items[0]?.id ?? null);
  return (
    <div className="flex flex-col gap-2">
      {items.map((item) => {
        const expanded = open === item.id;
        return (
          <div key={item.id} className="rounded-md border border-neutral-200 bg-white">
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => setOpen(expanded ? null : item.id)}
              className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-medium text-black"
            >
              {item.title}
              <Icon name="chevron-down" className={`transition-transform ${expanded ? "rotate-180" : ""}`} />
            </button>
            {expanded ? (
              <div className="border-t border-neutral-200 px-4 py-3 text-sm text-black">{item.content}</div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
