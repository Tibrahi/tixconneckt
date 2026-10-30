"use client";

import { Badge } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/Feedback";
import { Icon } from "@/components/ui/Icon";
import type { WorkspaceData } from "./types";
import { formatDate } from "./types";

interface ListingProps {
  data: WorkspaceData;
  q: string;
  type: string;
  owner: string;
  sort: string;
  onQ: (v: string) => void;
  onType: (v: string) => void;
  onOwner: (v: string) => void;
  onSort: (v: string) => void;
  onFolder: (id: string) => void;
  onOpenFile: (id: string) => void;
  onNextPage: () => void;
}

function typeIcon(documentType: string): string {
  switch (documentType) {
    case "image":
      return "image";
    case "pdf":
      return "file-contract";
    case "spreadsheet":
      return "table";
    case "word":
      return "file-lines";
    case "response":
      return "reply";
    default:
      return "file-lines";
  }
}

export function WorkspaceListing(props: ListingProps) {
  const { data } = props;
  const subfolders = data.folders.filter(
    (f) => f.parentFolderId === data.activeFolderId && f.id !== data.activeFolderId,
  );
  const searching = props.q.trim().length > 0;

  return (
    <div className="flex flex-col gap-3">
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-sm">
        {data.breadcrumb.map((crumb, i) => (
          <span key={crumb.id} className="flex items-center gap-1">
            {i > 0 ? <Icon name="chevron-right" className="text-xs text-neutral-400" /> : null}
            <button
              type="button"
              onClick={() => props.onFolder(crumb.id)}
              className={`rounded px-1 py-0.5 hover:bg-neutral-100 ${
                i === data.breadcrumb.length - 1 ? "font-semibold text-black" : "text-brand-700"
              }`}
            >
              {crumb.name}
            </button>
          </span>
        ))}
      </nav>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Icon name="search" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            type="search"
            aria-label="Search files"
            placeholder="Search titles and content…"
            value={props.q}
            onChange={(e) => props.onQ(e.target.value)}
            className="w-full rounded-md border border-neutral-300 py-1.5 pl-8 pr-2 text-sm text-black placeholder:text-neutral-400"
          />
        </div>
        <select
          aria-label="Filter by file type"
          value={props.type}
          onChange={(e) => props.onType(e.target.value)}
          className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm text-black"
        >
          <option value="">All types</option>
          {data.documentTypes.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by creator"
          value={props.owner}
          onChange={(e) => props.onOwner(e.target.value)}
          className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm text-black"
        >
          <option value="">All creators</option>
          {data.members.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Sort files"
          value={props.sort}
          onChange={(e) => props.onSort(e.target.value)}
          className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm text-black"
        >
          <option value="updated">Recently modified</option>
          <option value="created">Recently created</option>
          <option value="title">Title A–Z</option>
        </select>
      </div>

      {!searching && subfolders.length > 0 ? (
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {subfolders.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                onClick={() => props.onFolder(f.id)}
                className="flex w-full items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2.5 text-left hover:border-brand-400"
              >
                <Icon name="folder" className="shrink-0 text-brand-500" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-black">{f.name}</span>
                  <span className="block text-xs text-neutral-500">Modified {formatDate(f.updatedAt)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {data.files.length === 0 ? (
        <EmptyState
          icon="file-lines"
          title={searching ? "No matches" : "Empty folder"}
          message={
            searching
              ? "Nothing matches this search. Try different keywords or clear the filters."
              : "Create a document or upload a file to get started."
          }
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {data.files.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                onClick={() => props.onOpenFile(f.id)}
                className="flex w-full items-start gap-3 rounded-lg border border-neutral-200 px-3 py-2.5 text-left hover:border-brand-400"
              >
                <Icon name={typeIcon(f.documentType)} className="mt-0.5 shrink-0 text-neutral-500" />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-sm font-medium text-black">{f.title}</span>
                    {f.isResponse ? <Badge tone="info">response</Badge> : null}
                    {f.hasAttachment ? <Badge tone="neutral">file</Badge> : null}
                  </span>
                  {f.preview ? (
                    <span className="mt-0.5 line-clamp-2 block text-xs text-neutral-600">{f.preview}</span>
                  ) : null}
                  <span className="mt-1 block text-xs text-neutral-500">
                    v{f.versionNumber} · {f.creatorName ?? "Unknown"} · Modified {formatDate(f.updatedAt)}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1 pt-0.5 text-xs text-neutral-500">
                  <Icon name={data.access.canEdit ? "pen" : "eye"} />
                  {data.access.role}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {data.hasMore ? (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={props.onNextPage}
            className="rounded-md border border-neutral-300 px-4 py-1.5 text-sm font-medium text-black hover:border-brand-400 hover:text-brand-700"
          >
            Load more
          </button>
        </div>
      ) : null}
    </div>
  );
}
