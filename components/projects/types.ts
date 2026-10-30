"use client";

export interface WorkspaceFileItem {
  id: string;
  folderId: string;
  title: string;
  documentType: string;
  versionNumber: number;
  hasAttachment: boolean;
  preview: string;
  createdBy: string | null;
  creatorName: string | null;
  updatedBy: string | null;
  updatedAt: string;
  createdAt: string;
  isResponse: boolean;
}

export interface WorkspaceFolderItem {
  id: string;
  parentFolderId: string | null;
  name: string;
  description: string | null;
  updatedAt: string;
}

export interface WorkspaceMember {
  userId: string;
  role: string;
  name: string;
  shortId: string;
}

export interface WorkspaceActivity {
  id: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  details: Record<string, unknown>;
  createdAt: string;
  actorName: string | null;
}

export interface WorkspaceRequest {
  id: string;
  status: string;
  amountMinor: number;
  currency: string;
}

export interface WorkspaceData {
  project: {
    id: string;
    title: string;
    summary: string;
    visibility: string;
    stage: string;
    groupId: string | null;
    ownerId: string;
  };
  access: { role: string; canEdit: boolean; canManage: boolean; via: string };
  rootFolderId: string;
  activeFolderId: string;
  breadcrumb: Array<{ id: string; name: string }>;
  folders: WorkspaceFolderItem[];
  files: WorkspaceFileItem[];
  page: number;
  pageSize: number;
  hasMore: boolean;
  documentTypes: string[];
  members: WorkspaceMember[];
  activity: WorkspaceActivity[];
  requests: WorkspaceRequest[];
}

export interface FileDetail {
  file: {
    id: string;
    folderId: string;
    title: string;
    documentType: string;
    contentJson: Record<string, unknown>;
    metadata: Record<string, unknown>;
    attachmentId: string | null;
    versionNumber: number;
    updatedAt: string;
    updatedByName: string | null;
  };
  editable: boolean;
  imageRefs: Record<string, string>;
  breadcrumb: Array<{ id: string }>;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { cache: "no-store", ...init });
  const body = (await res.json().catch(() => null)) as { ok?: boolean; data?: T; error?: string } | null;
  if (!res.ok || !body?.ok) {
    throw new Error(body?.error ?? "Something went wrong. Please try again.");
  }
  return body.data as T;
}

export function formatDate(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function describeAction(action: string, details: Record<string, unknown>): string {
  const title = (details.title ?? details.name) as string | undefined;
  switch (action) {
    case "project.created":
      return `created the project${title ? ` "${title}"` : ""}`;
    case "project.settings":
      return `changed project settings (${((details.fields as string[]) ?? []).join(", ") || "details"})`;
    case "folder.created":
      return `created folder${title ? ` "${title}"` : ""}`;
    case "folder.renamed":
      return `renamed a folder${title ? ` to "${title}"` : ""}`;
    case "folder.deleted":
      return "deleted a folder";
    case "file.created":
      return `created "${title ?? "a document"}"`;
    case "file.uploaded":
      return `uploaded "${title ?? "a file"}"`;
    case "file.saved":
      return `saved "${title ?? "a document"}" (v${String(details.version ?? "?")})`;
    case "file.restored":
      return `restored "${title ?? "a document"}" from v${String(details.fromVersion ?? "?")}`;
    case "file.deleted":
      return `deleted "${title ?? "a document"}"`;
    case "file.opened":
      return `opened "${title ?? "a shared document"}"`;
    case "member.upserted":
      return `set a collaborator as ${String(details.role ?? "member")}`;
    case "member.removed":
      return "removed a collaborator";
    case "share.granted":
      return `shared ${String(details.files ?? 0)} file(s) and ${String(details.folders ?? 0)} folder(s) with a provider`;
    case "share.revoked":
      return "revoked a provider share";
    case "request.submitted":
      return "submitted a funding request";
    case "response.created":
      return `${(details.submitted as boolean) ? "submitted" : "drafted"} response "${title ?? "Untitled"}"`;
    case "ai.proposed":
      return `asked the assistant (${String(details.task ?? "task")})`;
    default:
      return action.replace(/[._]/g, " ");
  }
}
