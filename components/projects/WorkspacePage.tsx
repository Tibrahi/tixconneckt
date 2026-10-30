"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Card";
import { EmptyState, LoadError, SkeletonList } from "@/components/ui/Feedback";
import { Icon } from "@/components/ui/Icon";
import { ConfirmDialog, ErrorDialog } from "@/components/ui/Modal";
import { ROUTES } from "@/lib/routes";
import { DocEditor } from "./DocEditor";
import { ProjectOverview } from "./ProjectOverview";
import { QuickLinks } from "./QuickLinks";
import { RequestDialog } from "./RequestDialog";
import { ShareDialog } from "./ShareDialog";
import { api } from "./types";
import type { WorkspaceData, WorkspaceFileItem } from "./types";
import { WorkspaceInfo } from "./WorkspaceInfo";
import { WorkspaceListing } from "./WorkspaceListing";
import { WorkspaceSidebar } from "./WorkspaceSidebar";
import {
  FileDialog,
  FolderDialog,
  MembersDialog,
  RenameFolderDialog,
  SettingsDialog,
  UploadDialog,
} from "./WorkspaceDialogs";

type TabId = "workspace" | "overview" | "requests" | "conversations" | "agreements";

interface Thread {
  requestId: string;
  status: string;
  amountMinor: number;
  currency: string;
  createdAt: string;
  providerName: string | null;
  conversationId: string | null;
  conversationTitle: string | null;
}

interface AgreementRow {
  id: string;
  requestId: string;
  version: number;
  title: string;
  status: string;
  createdAt: string;
  decidedAt: string | null;
}

export function WorkspacePage({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<TabId>("workspace");
  const [data, setData] = useState<WorkspaceData | null>(null);
  const [failed, setFailed] = useState(false);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [owner, setOwner] = useState("");
  const [sort, setSort] = useState("updated");
  const [page, setPage] = useState(1);
  const [recent, setRecent] = useState<WorkspaceFileItem[]>([]);
  const [openFileId, setOpenFileId] = useState<string | null>(null);
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [agreements, setAgreements] = useState<AgreementRow[] | null>(null);
  const [ownerName, setOwnerName] = useState<string | null>(null);
  const [groupName, setGroupName] = useState<string | null>(null);
  const [dialog, setDialog] = useState<
    | null
    | "folder"
    | "file"
    | "upload"
    | "rename"
    | "members"
    | "settings"
    | "share"
    | "request-loan"
    | "request-support"
  >(null);
  const [renameTarget, setRenameTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [shareFileIds, setShareFileIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(true);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const params = new URLSearchParams();
      if (folderId) params.set("folderId", folderId);
      if (q.trim()) params.set("q", q.trim());
      if (type) params.set("type", type);
      if (owner) params.set("owner", owner);
      if (sort !== "updated") params.set("sort", sort);
      params.set("page", String(page));
      const workspace = await api<WorkspaceData>(
        `/api/projects/${projectId}/workspace?${params.toString()}`,
      );
      setData((prev) =>
        page > 1 && prev && prev.activeFolderId === workspace.activeFolderId
          ? { ...workspace, files: [...prev.files, ...workspace.files] }
          : workspace,
      );
      if (!folderId) setFolderId(workspace.activeFolderId);
    } catch {
      setFailed(true);
    }
  }, [projectId, folderId, q, type, owner, sort, page]);

  const loadRecent = useCallback(async () => {
    try {
      const workspace = await api<WorkspaceData>(`/api/projects/${projectId}/workspace?recent=1`);
      setRecent(workspace.files);
    } catch {
      setRecent([]);
    }
  }, [projectId]);

  const loadThreads = useCallback(async () => {
    try {
      const res = await api<{ threads: Thread[]; agreements: AgreementRow[] }>(
        `/api/projects/${projectId}/conversations`,
      );
      setThreads(res.threads);
      setAgreements(res.agreements);
    } catch {
      setThreads([]);
      setAgreements([]);
    }
  }, [projectId]);

  const loadPeople = useCallback(async () => {
    try {
      const res = await api<{ owner: { name: string; shortId: string } | null }>(
        `/api/projects/${projectId}/members`,
      );
      setOwnerName(res.owner?.name ?? null);
    } catch {
      setOwnerName(null);
    }
  }, [projectId]);

  // Debounced search.
  const [qInput, setQInput] = useState("");
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(qInput);
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [qInput]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadRecent();
    loadPeople();
  }, [loadRecent, loadPeople]);

  useEffect(() => {
    if ((tab === "requests" || tab === "conversations" || tab === "agreements") && threads === null) {
      loadThreads();
    }
  }, [tab, threads, loadThreads]);

  useEffect(() => {
    if (data?.project.groupId) {
      api<Array<{ id: string; name: string }>>("/api/groups")
        .then((g) => setGroupName(g.find((x) => x.id === data.project.groupId)?.name ?? null))
        .catch(() => setGroupName(null));
    }
  }, [data?.project.groupId]);

  // Deep links: ?file=<id> opens the playground; ?newRequest=loan|support
  // starts the request flow after choosing a project elsewhere.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const file = params.get("file");
    if (file) setOpenFileId(file);
    const intent = params.get("newRequest");
    if (intent === "support") setDialog("request-support");
    else if (intent === "loan") setDialog("request-loan");
  }, []);

  if (failed) {
    return (
      <>
        <PageHeader title="Project workspace" />
        <LoadError message="We couldn't open this project. It may be private or removed." onRetry={load} />
      </>
    );
  }
  if (!data) {
    return (
      <>
        <PageHeader title="Project workspace" />
        <SkeletonList rows={5} />
      </>
    );
  }

  const isProvider = data.access.role === "provider";
  const activeFolder = data.activeFolderId;
  const responsesFolder = data.folders.find((f) => f.name === "Provider Responses");

  const goFolder = (id: string) => {
    setFolderId(id);
    setPage(1);
    setOpenFileId(null);
    setTab("workspace");
  };

  const openFile = (id: string) => {
    setOpenFileId(id);
    setTab("workspace");
  };

  const refreshAll = () => {
    setPage(1);
    load();
    loadRecent();
    if (threads !== null) loadThreads();
  };

  async function deleteFolder() {
    if (!deleteTarget) return;
    try {
      await api(`/api/projects/${projectId}/folders/${deleteTarget.id}`, { method: "DELETE" });
      setDeleteTarget(null);
      if (folderId === deleteTarget.id) setFolderId(data!.rootFolderId);
      refreshAll();
    } catch (e) {
      setDeleteTarget(null);
      setError(e instanceof Error ? e.message : "Couldn't delete the folder.");
    }
  }

  async function openThread(requestId: string) {
    try {
      const res = await api<{ conversationId: string }>(`/api/requests/${requestId}/conversation`, {
        method: "POST",
      });
      router.push(ROUTES.chatThread(res.conversationId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't open the conversation.");
    }
  }

  const tabs: Array<{ id: TabId; label: string; icon: string }> = [
    { id: "workspace", label: "Workspace", icon: "folder" },
    { id: "overview", label: "Overview", icon: "circle-info" },
    ...(isProvider
      ? []
      : [
          { id: "requests" as TabId, label: "Requests", icon: "funding" },
          { id: "conversations" as TabId, label: "Conversations", icon: "comments" },
          { id: "agreements" as TabId, label: "Agreements", icon: "file-signature" },
        ]),
  ];

  return (
    <>
      <PageHeader
        title={data.project.title}
        description={`${data.project.groupId ? "Group" : "Individual"} project · ${data.access.role} access via ${data.access.via}`}
        actions={
          <div className="flex gap-1.5">
            <Button size="sm" variant="secondary" icon="bars" onClick={() => setSidebarOpen((v) => !v)}>
              <span className="lg:hidden">Folders</span>
              <span className="hidden lg:inline">Toggle folders</span>
            </Button>
            <Button size="sm" variant="secondary" icon="circle-info" onClick={() => setInfoOpen((v) => !v)}>
              <span className="lg:hidden">Info</span>
              <span className="hidden lg:inline">Toggle info</span>
            </Button>
          </div>
        }
      />

      <div className="mb-3">
        <QuickLinks
          links={[
            { id: "folder", label: "Open Project Folder", icon: "folder", onClick: () => goFolder(data.rootFolderId) },
            { id: "create", label: "Create Document", icon: "file-plus", disabled: !data.access.canEdit, onClick: () => setDialog("file") },
            { id: "upload", label: "Upload Document", icon: "upload", disabled: !data.access.canEdit, onClick: () => setDialog("upload") },
            {
              id: "playground",
              label: "Open Project Playground",
              icon: "pen",
              disabled: data.files.length === 0,
              onClick: () => {
                if (data.files.length > 0) openFile(data.files[0].id);
              },
            },
            { id: "invite", label: "Invite Collaborator", icon: "user-plus", disabled: !data.access.canManage, onClick: () => setDialog("members") },
            { id: "permissions", label: "Manage Permissions", icon: "users-gear", disabled: !data.access.canManage, onClick: () => setDialog("members") },
            {
              id: "share",
              label: "Share with Provider",
              icon: "share",
              disabled: !data.access.canManage,
              onClick: () => {
                setShareFileIds([]);
                setDialog("share");
              },
            },
            { id: "loan", label: "Request Loan", icon: "funding", disabled: isProvider, onClick: () => setDialog("request-loan") },
            { id: "support", label: "Request Support", icon: "funding", disabled: isProvider, onClick: () => setDialog("request-support") },
            {
              id: "responses",
              label: "Provider Responses",
              icon: "inbox",
              disabled: !responsesFolder,
              onClick: () => {
                if (responsesFolder) goFolder(responsesFolder.id);
              },
            },
            { id: "conversations", label: "Project Conversations", icon: "comments", disabled: isProvider, onClick: () => setTab("conversations") },
            { id: "agreements", label: "Agreements", icon: "file-signature", disabled: isProvider, onClick: () => setTab("agreements") },
            {
              id: "history",
              label: "Document History",
              icon: "history",
              onClick: () => {
                setTab("workspace");
                setInfoOpen(true);
                setHistoryOpen(true);
              },
            },
          ]}
        />
      </div>

      <div role="tablist" aria-label="Project sections" className="mb-3 flex flex-wrap gap-1 border-b border-neutral-200">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium ${
              tab === t.id ? "border-brand-600 text-brand-700" : "border-transparent text-black hover:border-neutral-300"
            }`}
          >
            <Icon name={t.icon} className={tab === t.id ? "text-brand-600" : ""} />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <ProjectOverview projectId={projectId} />
      ) : tab === "requests" ? (
        <RequestsTab
          threads={threads}
          onRetry={loadThreads}
          onNewLoan={() => setDialog("request-loan")}
          onNewSupport={() => setDialog("request-support")}
        />
      ) : tab === "conversations" ? (
        <ConversationsTab threads={threads} onRetry={loadThreads} onOpen={openThread} />
      ) : tab === "agreements" ? (
        <AgreementsTab agreements={agreements} onRetry={loadThreads} />
      ) : openFileId ? (
        <DocEditor
          key={openFileId}
          projectId={projectId}
          fileId={openFileId}
          contextFiles={data.files.map((f) => ({ id: f.id, title: f.title }))}
          onClose={() => setOpenFileId(null)}
          onShare={(fid) => {
            setShareFileIds([fid]);
            setDialog("share");
          }}
          onChanged={refreshAll}
        />
      ) : (
        <div className="flex gap-4">
          <aside
            className={`${sidebarOpen ? "block" : "hidden"} w-64 shrink-0 lg:block`}
            aria-label="Project sidebar"
          >
            <div className="rounded-lg border border-neutral-200 bg-white p-3 lg:sticky lg:top-4 lg:max-h-[80vh]">
              <WorkspaceSidebar
                data={data}
                folderId={activeFolder}
                recent={recent}
                onFolder={goFolder}
                onOpenFile={openFile}
                onNewFolder={() => setDialog("folder")}
                onNewFile={() => setDialog("file")}
                onUpload={() => setDialog("upload")}
                onRenameFolder={(id, name) => {
                  setRenameTarget({ id, name });
                  setDialog("rename");
                }}
                onDeleteFolder={(id, name) => setDeleteTarget({ id, name })}
                onProviderResponses={() => {
                  if (responsesFolder) goFolder(responsesFolder.id);
                }}
                onAgreements={() => setTab("agreements")}
                onSettings={() => setDialog("settings")}
              />
            </div>
          </aside>

          <div className="min-w-0 flex-1 rounded-lg border border-neutral-200 bg-white p-3">
            <WorkspaceListing
              data={data}
              q={qInput}
              type={type}
              owner={owner}
              sort={sort}
              onQ={(v) => setQInput(v)}
              onType={(v) => {
                setType(v);
                setPage(1);
              }}
              onOwner={(v) => {
                setOwner(v);
                setPage(1);
              }}
              onSort={(v) => {
                setSort(v);
                setPage(1);
              }}
              onFolder={goFolder}
              onOpenFile={openFile}
              onNextPage={() => setPage((p) => p + 1)}
            />
          </div>

          <aside
            className={`${infoOpen ? "block" : "hidden"} w-72 shrink-0 xl:block`}
            aria-label="Project information"
          >
            <div className="rounded-lg border border-neutral-200 bg-white p-3 xl:sticky xl:top-4 xl:max-h-[80vh]">
              <WorkspaceInfo
                data={data}
                ownerName={ownerName}
                groupName={groupName}
                onMembers={() => setDialog("members")}
                onHistory={() => setHistoryOpen((v) => !v)}
                historyOpen={historyOpen}
              />
            </div>
          </aside>
        </div>
      )}

      {dialog === "folder" ? (
        <FolderDialog
          projectId={projectId}
          parentFolderId={activeFolder}
          onClose={() => setDialog(null)}
          onDone={(fid) => {
            setDialog(null);
            refreshAll();
            setFolderId(fid);
          }}
        />
      ) : null}
      {dialog === "file" ? (
        <FileDialog
          projectId={projectId}
          folderId={activeFolder}
          onClose={() => setDialog(null)}
          onDone={(fid) => {
            setDialog(null);
            refreshAll();
            setOpenFileId(fid);
          }}
        />
      ) : null}
      {dialog === "upload" ? (
        <UploadDialog
          projectId={projectId}
          folderId={activeFolder}
          onClose={() => setDialog(null)}
          onDone={(fid) => {
            setDialog(null);
            refreshAll();
            setOpenFileId(fid);
          }}
        />
      ) : null}
      {dialog === "rename" && renameTarget ? (
        <RenameFolderDialog
          projectId={projectId}
          folderId={renameTarget.id}
          currentName={renameTarget.name}
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null);
            refreshAll();
          }}
        />
      ) : null}
      {dialog === "members" ? (
        <MembersDialog
          projectId={projectId}
          owner={ownerName ? { name: ownerName, shortId: "" } : null}
          onClose={() => setDialog(null)}
          onDone={refreshAll}
        />
      ) : null}
      {dialog === "settings" ? (
        <SettingsDialog
          projectId={projectId}
          initial={{
            title: data.project.title,
            summary: data.project.summary,
            visibility: data.project.visibility,
            stage: data.project.stage,
          }}
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null);
            refreshAll();
          }}
        />
      ) : null}
      {dialog === "share" ? (
        <ShareDialog
          projectId={projectId}
          folders={data.folders}
          files={data.files}
          preselectedFileIds={shareFileIds}
          preselectedFolderIds={[]}
          onClose={() => setDialog(null)}
          onDone={refreshAll}
        />
      ) : null}
      {dialog === "request-loan" || dialog === "request-support" ? (
        <RequestDialog
          data={data}
          kind={dialog === "request-loan" ? "loan" : "support"}
          onClose={() => setDialog(null)}
          onDone={(requestId) => {
            router.push(ROUTES.requestById(requestId));
          }}
        />
      ) : null}
      {deleteTarget ? (
        <ConfirmDialog
          title="Delete folder"
          message={`Delete "${deleteTarget.name}" and everything inside it? Documents, versions, and uploads in this folder will be removed. This cannot be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={deleteFolder}
          onCancel={() => setDeleteTarget(null)}
        />
      ) : null}
      {error ? <ErrorDialog message={error} onClose={() => setError(null)} /> : null}
    </>
  );
}

function RequestsTab({
  threads,
  onRetry,
  onNewLoan,
  onNewSupport,
}: {
  threads: Thread[] | null;
  onRetry: () => void;
  onNewLoan: () => void;
  onNewSupport: () => void;
}) {
  const router = useRouter();
  if (threads === null) return <SkeletonList rows={3} />;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" icon="funding" onClick={onNewLoan}>
          Request loan
        </Button>
        <Button size="sm" variant="secondary" icon="funding" onClick={onNewSupport}>
          Request support
        </Button>
      </div>
      {threads.length === 0 ? (
        <EmptyState
          icon="funding"
          title="No requests yet"
          message="Loan and support requests for this project appear here, with their shared documents and status."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {threads.map((t) => (
            <li key={t.requestId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-neutral-200 bg-white px-4 py-3">
              <span className="text-sm text-black">
                <Link href={ROUTES.requestById(t.requestId)} className="font-medium text-brand-700 hover:underline">
                  {(t.amountMinor / 100).toLocaleString()} {t.currency}
                </Link>{" "}
                · {t.providerName ?? "Provider"} ·{" "}
                <Badge tone={t.status === "funded" ? "success" : t.status === "rejected" ? "danger" : "info"}>
                  {t.status.replace(/_/g, " ")}
                </Badge>
              </span>
              <Button size="sm" variant="secondary" icon="comments" onClick={() => router.push(ROUTES.requestById(t.requestId))}>
                Open request
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div>
        <Button size="sm" variant="secondary" icon="refresh" onClick={onRetry}>
          Refresh
        </Button>
      </div>
    </div>
  );
}

function ConversationsTab({
  threads,
  onRetry,
  onOpen,
}: {
  threads: Thread[] | null;
  onRetry: () => void;
  onOpen: (requestId: string) => void;
}) {
  if (threads === null) return <SkeletonList rows={3} />;
  if (threads.length === 0) {
    return (
      <EmptyState
        icon="comments"
        title="No conversations yet"
        message="Each funding request gets its own negotiation thread with the provider."
      />
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {threads.map((t) => (
          <li key={t.requestId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-neutral-200 bg-white px-4 py-3">
            <span className="text-sm text-black">
              <span className="font-medium">{t.conversationTitle ?? "Request thread"}</span>
              <span className="block text-xs text-neutral-600">
                {t.providerName ?? "Provider"} · {(t.amountMinor / 100).toLocaleString()} {t.currency} · {t.status.replace(/_/g, " ")}
              </span>
            </span>
            <Button size="sm" variant="secondary" icon="comments" onClick={() => onOpen(t.requestId)}>
              {t.conversationId ? "Open chat" : "Start thread"}
            </Button>
          </li>
        ))}
      </ul>
      <div>
        <Button size="sm" variant="secondary" icon="refresh" onClick={onRetry}>
          Refresh
        </Button>
      </div>
    </div>
  );
}

function AgreementsTab({ agreements, onRetry }: { agreements: AgreementRow[] | null; onRetry: () => void }) {
  if (agreements === null) return <SkeletonList rows={3} />;
  if (agreements.length === 0) {
    return (
      <EmptyState
        icon="file-signature"
        title="No agreements yet"
        message="Providers draft agreement versions on requests; accepted agreements release funding."
      />
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {agreements.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-neutral-200 bg-white px-4 py-3">
            <span className="text-sm text-black">
              <span className="font-medium">
                {a.title} <span className="text-neutral-500">(v{a.version})</span>
              </span>{" "}
              <Badge tone={a.status === "accepted" ? "success" : a.status === "rejected" ? "danger" : "warning"}>
                {a.status}
              </Badge>
            </span>
            <Link href={ROUTES.requestById(a.requestId)} className="text-sm font-medium text-brand-700 hover:underline">
              Open request
            </Link>
          </li>
        ))}
      </ul>
      <div>
        <Button size="sm" variant="secondary" icon="refresh" onClick={onRetry}>
          Refresh
        </Button>
      </div>
    </div>
  );
}
