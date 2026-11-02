"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useContextNavigation } from "@/components/layout/ContextNavigation";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Card";
import { EmptyState, LoadError, SkeletonList } from "@/components/ui/Feedback";
import { Icon } from "@/components/ui/Icon";
import { ConfirmDialog, ErrorDialog } from "@/components/ui/Modal";
import { ROUTES } from "@/lib/routes";
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

// Split the tiptap editor out of the page bundle: it loads on first file open.
const DocEditor = dynamic(() => import("./DocEditor").then((m) => m.DocEditor), {
  ssr: false,
  loading: () => <SkeletonList rows={3} />,
});

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
      <LoadError message="We couldn't open this project. It may be private or removed." onRetry={load} />
    );
  }
  if (!data) {
    return <SkeletonList rows={5} />;
  }

  const isProvider = data.access.role === "provider";
  const activeFolder = data.activeFolderId;

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

  const sectionTitle = openFileId && tab === "workspace"
    ? data.files.find((file) => file.id === openFileId)?.title ?? "Document playground"
    : tabs.find((item) => item.id === tab)?.label ?? "Workspace";

  return (
    <>
      <ProjectNavigation
        data={data}
        folderId={activeFolder}
        recent={recent}
        tab={tab}
        openFileId={openFileId}
        ownerName={ownerName}
        groupName={groupName}
        historyOpen={historyOpen}
        onFolder={goFolder}
        onOpenFile={openFile}
        onTab={setTab}
        onOpenFileId={setOpenFileId}
        onDialog={setDialog}
        onRenameFolder={(id, name) => {
          setRenameTarget({ id, name });
          setDialog("rename");
        }}
        onDeleteFolder={setDeleteTarget}
        onShareAll={() => {
          setShareFileIds([]);
          setDialog("share");
        }}
        onHistory={() => setHistoryOpen(true)}
      />
      <main className="min-w-0 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm" aria-label="Project workspace">
          <div className="flex min-h-16 items-center justify-between gap-3 border-b border-neutral-200 bg-neutral-50 px-4 py-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-700">Project playground</p>
              <h2 className="truncate text-base font-semibold text-neutral-950">{sectionTitle}</h2>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {openFileId && tab === "workspace" ? (
                <Button size="sm" variant="secondary" icon="arrow-left" onClick={() => setOpenFileId(null)}>
                  Files
                </Button>
              ) : null}
            </div>
          </div>
          <div className="min-w-0 p-3 sm:p-4">
            {tab === "overview" ? (
              <ProjectOverview projectId={projectId} />
            ) : tab === "requests" ? (
              <RequestsTab
                threads={threads}
                onRetry={loadThreads}
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
                contextFiles={data.files.map((file) => ({ id: file.id, title: file.title }))}
                onClose={() => setOpenFileId(null)}
                onShare={(fileId) => {
                  setShareFileIds([fileId]);
                  setDialog("share");
                }}
                onChanged={refreshAll}
              />
            ) : (
              <WorkspaceListing
                data={data}
                q={qInput}
                type={type}
                owner={owner}
                sort={sort}
                onQ={(value) => setQInput(value)}
                onType={(value) => {
                  setType(value);
                  setPage(1);
                }}
                onOwner={(value) => {
                  setOwner(value);
                  setPage(1);
                }}
                onSort={(value) => {
                  setSort(value);
                  setPage(1);
                }}
                onFolder={goFolder}
                onOpenFile={openFile}
                onNextPage={() => setPage((value) => value + 1)}
              />
            )}
          </div>
      </main>

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

interface ProjectNavigationProps {
  data: WorkspaceData;
  folderId: string;
  recent: WorkspaceFileItem[];
  tab: TabId;
  openFileId: string | null;
  ownerName: string | null;
  groupName: string | null;
  historyOpen: boolean;
  onFolder: (id: string) => void;
  onOpenFile: (id: string) => void;
  onTab: (tab: TabId) => void;
  onOpenFileId: (id: string | null) => void;
  onDialog: (dialog: "folder" | "file" | "upload" | "rename" | "members" | "settings" | "share" | "request-loan" | "request-support" | null) => void;
  onRenameFolder: (id: string, name: string) => void;
  onDeleteFolder: (target: { id: string; name: string }) => void;
  onShareAll: () => void;
  onHistory: () => void;
}

function ProjectNavigation(props: ProjectNavigationProps) {
  const { setNavigation } = useContextNavigation();
  const propsRef = useRef(props);
  useEffect(() => {
    propsRef.current = props;
  }, [props]);
  const isProvider = props.data.access.role === "provider";
  const content = useMemo(() => {
    const data = props.data;
    const groups: Array<{ label: string; icon: string; items: Array<{ id: TabId; label: string; icon: string }> }> = [
      {
        label: "Project",
        icon: "diagram-project",
        items: [
          { id: "workspace", label: "Documents and files", icon: "folder" },
          { id: "overview", label: "Project overview", icon: "circle-info" },
        ],
      },
      ...(!isProvider
        ? [
            { label: "Funding workflow", icon: "funding", items: [{ id: "requests" as TabId, label: "Requests", icon: "funding" }] },
            { label: "Communication and decisions", icon: "comments", items: [
              { id: "conversations" as TabId, label: "Conversations", icon: "comments" },
              { id: "agreements" as TabId, label: "Agreements", icon: "file-signature" },
            ] },
          ]
        : []),
    ];
    const responsesFolder = data.folders.find((folder) => folder.name === "Provider Responses");
    const links = [
      { id: "root", label: "Open project folder", icon: "folder", onClick: () => propsRef.current.onFolder(data.rootFolderId) },
      { id: "create-folder", label: "Create folder", icon: "folder-plus", disabled: !data.access.canEdit, onClick: () => propsRef.current.onDialog("folder") },
      { id: "create-file", label: "Create document", icon: "file-plus", disabled: !data.access.canEdit, onClick: () => propsRef.current.onDialog("file") },
      { id: "upload", label: "Upload document", icon: "upload", disabled: !data.access.canEdit, onClick: () => propsRef.current.onDialog("upload") },
      { id: "invite", label: "Invite collaborator", icon: "user-plus", disabled: !data.access.canManage, onClick: () => propsRef.current.onDialog("members") },
      { id: "permissions", label: "Manage permissions", icon: "users-gear", disabled: !data.access.canManage, onClick: () => propsRef.current.onDialog("members") },
      { id: "share", label: "Share with provider", icon: "share", disabled: !data.access.canManage, onClick: () => propsRef.current.onShareAll() },
      { id: "loan", label: "Request a loan", icon: "funding", disabled: isProvider, onClick: () => propsRef.current.onDialog("request-loan") },
      { id: "support", label: "Request support", icon: "funding", disabled: isProvider, onClick: () => propsRef.current.onDialog("request-support") },
      { id: "responses", label: "Provider responses", icon: "inbox", disabled: !responsesFolder, onClick: () => { if (responsesFolder) propsRef.current.onFolder(responsesFolder.id); } },
      { id: "history", label: "Document history", icon: "history", onClick: () => { propsRef.current.onTab("workspace"); propsRef.current.onOpenFileId(null); propsRef.current.onHistory(); } },
      { id: "settings", label: "Project settings", icon: "gear", disabled: !data.access.canManage, onClick: () => propsRef.current.onDialog("settings") },
    ];

    return (
      <div className="flex flex-col gap-4">
        <WorkspaceSidebar
          data={data}
          navigationOnly
          folderId={props.folderId}
          recent={props.recent}
          onFolder={(id) => propsRef.current.onFolder(id)}
          onOpenFile={(id) => propsRef.current.onOpenFile(id)}
          onNewFolder={() => propsRef.current.onDialog("folder")}
          onNewFile={() => propsRef.current.onDialog("file")}
          onUpload={() => propsRef.current.onDialog("upload")}
          onRenameFolder={(id, name) => propsRef.current.onRenameFolder(id, name)}
          onDeleteFolder={(id, name) => propsRef.current.onDeleteFolder({ id, name })}
          onProviderResponses={() => { if (responsesFolder) propsRef.current.onFolder(responsesFolder.id); }}
          onAgreements={() => propsRef.current.onTab("agreements")}
          onSettings={() => propsRef.current.onDialog("settings")}
        />
        <nav aria-label="Project sections" className="border-t border-neutral-200 pt-3">
          <h3 className="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Project sections</h3>
          <div className="flex flex-col gap-1">
            {groups.map((group) => (
              <details key={group.label} className="group rounded-md">
                <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md px-2 py-2 text-sm font-semibold text-neutral-800 hover:bg-neutral-100 [&::-webkit-details-marker]:hidden">
                  <Icon name={group.icon} className="text-brand-600" />
                  <span className="flex-1">{group.label}</span>
                  <Icon name="chevron-down" className="text-xs text-neutral-400 transition-transform group-open:rotate-180" />
                </summary>
                <ul className="ml-3 flex flex-col gap-0.5 border-l border-neutral-200 pl-2">
                  {group.items.map((item) => {
                    const selected = props.tab === item.id && !props.openFileId;
                    return (
                      <li key={item.id}>
                        <button type="button" aria-current={selected ? "page" : undefined} onClick={() => { propsRef.current.onTab(item.id); propsRef.current.onOpenFileId(null); }} className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs ${selected ? "bg-brand-50 font-semibold text-brand-800" : "text-neutral-700 hover:bg-neutral-100"}`}>
                          <Icon name={item.icon} className={selected ? "text-brand-600" : "text-neutral-400"} />
                          <span>{item.label}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </details>
            ))}
          </div>
        </nav>
        <section className="border-t border-neutral-200 pt-3">
          <h3 className="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Project actions</h3>
          <QuickLinks links={links} />
        </section>
        <details className="border-t border-neutral-200 pt-3">
          <summary className="cursor-pointer px-2 py-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">Project context</summary>
          <div className="pt-3">
            <WorkspaceInfo data={data} ownerName={props.ownerName} groupName={props.groupName} onMembers={() => propsRef.current.onDialog("members")} onHistory={() => propsRef.current.onHistory()} historyOpen={props.historyOpen} />
          </div>
        </details>
      </div>
    );
  }, [isProvider, props.data, props.folderId, props.recent, props.tab, props.openFileId, props.ownerName, props.groupName, props.historyOpen]);
  const navigation = useMemo(() => ({ title: props.data.project.title, backHref: ROUTES.projects, backLabel: "All projects", content }), [props.data.project.title, content]);

  useEffect(() => {
    setNavigation(navigation);
    return () => setNavigation(null);
  }, [navigation, setNavigation]);
  return null;
}

function RequestsTab({
  threads,
  onRetry,
}: {
  threads: Thread[] | null;
  onRetry: () => void;
}) {
  const router = useRouter();
  if (threads === null) return <SkeletonList rows={3} />;
  return (
    <div className="flex flex-col gap-3">
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
