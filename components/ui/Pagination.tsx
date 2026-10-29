"use client";

import { Button } from "./Button";
import { Icon } from "./Icon";

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-2 pt-3">
      <p className="text-sm text-neutral-600">
        Page <span className="font-mono">{page}</span> of{" "}
        <span className="font-mono">{totalPages}</span> ·{" "}
        <span className="font-mono">{total}</span> records
      </p>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          icon="chevron-left"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          Previous
        </Button>
        <Button
          variant="secondary"
          size="sm"
          icon="chevron-right"
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
        >
          Next
        </Button>
      </div>
    </nav>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Search",
  label = "Search",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true">
        <Icon name="search" />
      </span>
      <input
        type="search"
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border border-neutral-300 bg-white py-2 pl-9 pr-3 text-sm text-black placeholder:text-neutral-500 focus:border-brand-600 focus:outline-none"
      />
    </div>
  );
}
