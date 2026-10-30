"use client";

import { useState } from "react";
import { IconButton } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import type { WorkspaceData, WorkspaceFileItem } from "./types";

interface SidebarProps {
  data: WorkspaceData;
  folderId: string;
  recent: WorkspaceFileItem[];
  onFolder: (id: string) => void;
  onOpenFile: (id: string) => void;
  onNewFolder: () => void;
  onNewFile: () => void;
  onUpload: () => void;
  onRenameFolder: (id: string, name: string) => void;
  onDeleteFolder: (id: string, name: string) => void;
  onProviderResponses: () => void;
  onAgreements: () => void;
  onSettings: () => void;
}

export function WorkspaceSidebar(props: SidebarProps) {
  const { data } = props;
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([data.rootFolderId]));
  const childrenOf = (parentId: string | null) =>
    data.folders.filter((f) => f.parentFolderId === parentId);
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const renderTree = (parentId: string | null, depth: number): React.ReactNode => {
    const kids = childrenOf(parentId);
    if (kids.length === 0) return null;
    return (
      <ul className={depth === 0 ? "flex flex-col gap-0.5" : "ml-3 flex flex-col gap-0.5 border-l border-neutral-200 pl-2"}>
        {kids.map((f) => {
          const hasKids = childrenOf(f.id).length > 0;
          const open = expanded.has(f.id);
          const active = props.folderId === f.id;
          const isRoot = f.id === data.rootFolderId;
          return (
            <li key={f.id}>
              <div
                className={`group flex items-center gap-1 rounded-md px-2 py-1.5 text-sm ${
                  active ? "bg-brand-50 font-medium text-brand-800" : "text-black hover:bg-neutral-100"
                }`}
              >
                {hasKids ? (
                  <button
                    type="button"
                    aria-label={open ? `Collapse ${f.name}` : `Expand ${f.name}`}
                    onClick={() => toggle(f.id)}
                    className="rounded p-0.5 text-neutral-500 hover:bg-neutral-200"
                  >
                    <Icon name="chevron-down" className={open ? "" : "-rotate-90"} />
                  </button>
                ) : (
                  <span className="w-5 shrink-0 text-center text-neutral-300">·</span>
                )}
                <button
                  type="button"
                  onClick={() => props.onFolder(f.id)}
                  className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                >
                  <Icon name="folder" className="shrink-0 text-brand-500" />
                  <span className="truncate">{f.name}</span>
                </button>
                {!isRoot && data.access.canEdit ? (
                  <span className="hidden shrink-0 gap-0.5 group-hover:flex">
                    <IconButton
                      label={`Rename ${f.name}`}
                      icon="pen"
                      size="sm"
                      onClick={() => props.onRenameFolder(f.id, f.name)}
                    />
                    <IconButton
                      label={`Delete ${f.name}`}
                      icon="trash"
                      size="sm"
                      onClick={() => props.onDeleteFolder(f.id, f.name)}
                    />
                  </span>
                ) : null}
              </div>
              {open ? renderTree(f.id, depth + 1) : null}
            </li>
          );
        })}
      </ul>
    );
  };

  const responsesFolder = data.folders.find((f) => f.name === "Provider Responses");

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto">
      <div>
        <h2 className="truncate text-sm font-semibold text-black" title={data.project.title}>
          {data.project.title}
        </h2>
        <p className="mt-0.5 text-xs text-neutral-600">
          {data.project.groupId ? "Group project" : "Individual project"} · {data.access.role}
        </p>
      </div>

      {data.access.canEdit ? (
        <div className="grid grid-cols-3 gap-1.5">
          <button
            type="button"
            onClick={props.onNewFolder}
            className="flex flex-col items-center gap-1 rounded-md border border-neutral-200 px-1 py-2 text-[11px] font-medium text-black hover:border-brand-400 hover:text-brand-700"
          >
            <Icon name="folder-plus" className="text-brand-600" />
            Folder
          </button>
          <button
            type="button"
            onClick={props.onNewFile}
            className="flex flex-col items-center gap-1 rounded-md border border-neutral-200 px-1 py-2 text-[11px] font-medium text-black hover:border-brand-400 hover:text-brand-700"
          >
            <Icon name="file-plus" className="text-brand-600" />
            File
          </button>
          <button
            type="button"
            onClick={props.onUpload}
            className="flex flex-col items-center gap-1 rounded-md border border-neutral-200 px-1 py-2 text-[11px] font-medium text-black hover:border-brand-400 hover:text-brand-700"
          >
            <Icon name="upload" className="text-brand-600" />
            Upload
          </button>
        </div>
      ) : null}

      <nav aria-label="Project folders">
        <h3 className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Folders</h3>
        {renderTree(null, 0)}
      </nav>

      {props.recent.length > 0 ? (
        <div>
          <h3 className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Recent files</h3>
          <ul className="flex flex-col gap-0.5">
            {props.recent.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => props.onOpenFile(f.id)}
                  className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm text-black hover:bg-neutral-100"
                >
                  <Icon name={f.isResponse ? "reply" : "file-lines"} className="shrink-0 text-neutral-500" />
                  <span className="truncate">{f.title}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-auto flex flex-col gap-1 border-t border-neutral-200 pt-3">
        {responsesFolder ? (
          <button
            type="button"
            onClick={props.onProviderResponses}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-black hover:bg-neutral-100"
          >
            <Icon name="inbox" className="text-neutral-500" />
            Provider documents
          </button>
        ) : null}
        {data.access.role !== "provider" ? (
          <button
            type="button"
            onClick={props.onAgreements}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-black hover:bg-neutral-100"
          >
            <Icon name="file-signature" className="text-neutral-500" />
            Agreements
          </button>
        ) : null}
        {data.access.canManage ? (
          <button
            type="button"
            onClick={props.onSettings}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-black hover:bg-neutral-100"
          >
            <Icon name="gear" className="text-neutral-500" />
            Project settings
          </button>
        ) : null}
      </div>
    </div>
  );
}
