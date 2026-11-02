"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [openSectionGroups, setOpenSectionGroups] = useState<Record<string, boolean>>({ Project: true });
  const [projectContextOpen, setProjectContextOpen] = useState(true);

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

  const sectionGroups: Array<{ label: string; icon: string; items: Array<{ id: TabId; label: string; icon: string }> }> = [
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
          {
            label: "Funding workflow",
            icon: "funding",
            items: [{ id: "requests" as TabId, label: "Requests", icon: "funding" }],
          },
          {
            label: "Communication and decisions",
            icon: "comments",
            items: [
              { id: "conversations" as TabId, label: "Conversations", icon: "comments" },
              { id: "agreements" as TabId, label: "Agreements", icon: "file-signature" },
            ],
          },
        ]
      : []),
  ];

  const quickLinks = [
    { id: "folder", label: "Open project folder", icon: "folder", onClick: () => goFolder(data.rootFolderId) },
    { id: "create", label: "Create document", icon: "file-plus", disabled: !data.access.canEdit, onClick: () => setDialog("file") },
    { id: "upload", label: "Upload document", icon: "upload", disabled: !data.access.canEdit, onClick: () => setDialog("upload") },
    {
      id: "playground",
      label: "Open playground",
      icon: "pen",
      disabled: data.files.length === 0,
      onClick: () => {
        if (data.files.length > 0) openFile(data.files[0].id);
      },
    },
    { id: "invite", label: "Invite collaborator", icon: "user-plus", disabled: !data.access.canManage, onClick: () => setDialog("members") },
    { id: "permissions", label: "Manage permissions", icon: "users-gear", disabled: !data.access.canManage, onClick: () => setDialog("members") },
    {
      id: "share",
      label: "Share with provider",
      icon: "share",
      disabled: !data.access.canManage,
      onClick: () => {
        setShareFileIds([]);
        setDialog("share");
      },
    },
    { id: "loan", label: "Request a loan", icon: "funding", disabled: isProvider, onClick: () => setDialog("request-loan") },
    { id: "support", label: "Request support", icon: "funding", disabled: isProvider, onClick: () => setDialog("request-support") },
    {
      id: "responses",
      label: "Provider responses",
      icon: "inbox",
      disabled: !responsesFolder,
      onClick: () => {
        if (responsesFolder) goFolder(responsesFolder.id);
      },
    },
    { id: "conversations", label: "Project conversations", icon: "comments", disabled: isProvider, onClick: () => setTab("conversations") },
    { id: "agreements", label: "Agreements", icon: "file-signature", disabled: isProvider, onClick: () => setTab("agreements") },
    {
      id: "history",
      label: "Document history",
      icon: "history",
      onClick: () => {
        setTab("workspace");
        setOpenFileId(null);
        setHistoryOpen(true);
      },
    },
  ];

  const sectionTitle = openFileId && tab === "workspace"
    ? data.files.find((file) => file.id === openFileId)?.title ?? "Document playground"
    : tabs.find((item) => item.id === tab)?.label ?? "Workspace";

  return (
    <>
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(13rem,0.95fr)_minmax(0,2.2fr)_minmax(17rem,1fr)]">
        <aside
          className={`${sidebarOpen ? "block" : "hidden"} min-w-0 xl:block`}
          aria-label="Project folders and recent files"
        >
          <div className="rounded-xl border border-neutral-200 bg-white p-3 shadow-sm xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto">
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

        <main className="min-w-0 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm" aria-label="Project playground">
          <div className="flex min-h-16 items-center justify-between gap-3 border-b border-neutral-200 bg-neutral-50 px-4 py-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-700">Project playground</p>
              <h2 className="truncate text-base font-semibold text-neutral-950">{sectionTitle}</h2>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                icon="bars"
                className="xl:hidden"
                onClick={() => setSidebarOpen((value) => !value)}
              >
                Folders
              </Button>
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

        <aside aria-label="Project navigation and information" className="min-w-0">
          <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto">
            <section className="border-b border-neutral-200 bg-gradient-to-br from-brand-50 via-white to-white p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-700">Project workspace</p>
              <h1 className="mt-1 line-clamp-2 text-lg font-semibold leading-snug text-neutral-950" title={data.project.title}>
                {data.project.title}
              </h1>
              <p className="mt-1 text-xs text-neutral-600">
                {data.project.groupId ? "Group project" : "Individual project"} · {data.access.role} access via {data.access.via}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" icon="bars" onClick={() => setSidebarOpen((value) => !value)}>
                  {sidebarOpen ? "Hide folders" : "Show folders"}
                </Button>
                {data.access.canManage ? (
                  <Button size="sm" variant="secondary" icon="gear" onClick={() => setDialog("settings")}>
                    Settings
                  </Button>
                ) : null}
              </div>
            </section>

            <section className="border-b border-neutral-200 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Quick actions</h2>
                <span className="text-[10px] text-neutral-400">Available by access</span>
              </div>
              <QuickLinks links={quickLinks} />
            </section>

            <nav aria-label="Project section hierarchy" className="border-b border-neutral-200 p-3">
              <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">Project sections</h2>
              <div className="flex flex-col gap-1.5">
                {sectionGroups.map((group, index) => (
                  <details
                    key={group.label}
                    className="group rounded-lg border border-neutral-200 bg-white"
                    open={openSectionGroups[group.label] ?? index === 0}
                    onToggle={(event) => {
                      const isOpen = event.currentTarget.open;
                      setOpenSectionGroups((current) =>
                        current[group.label] === isOpen ? current : { ...current, [group.label]: isOpen },
                      );
                    }}
                  >
                    <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-semibold text-neutral-800 hover:bg-neutral-50 [&::-webkit-details-marker]:hidden">
                      <Icon name={group.icon} className="text-brand-600" />
                      <span className="flex-1">{group.label}</span>
                      <Icon name="chevron-down" className="text-xs text-neutral-400 transition-transform group-open:rotate-180" />
                    </summary>
                    <ul className="mb-1 ml-3 mr-2 flex flex-col gap-0.5 border-l border-neutral-200 pl-2">
                      {group.items.map((item) => {
                        const selected = tab === item.id;
                        return (
                          <li key={item.id}>
                            <button
                              type="button"
                              aria-current={selected ? "page" : undefined}
                              onClick={() => {
                                setTab(item.id);
                                setOpenFileId(null);
                              }}
                              className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs transition-colors ${
                                selected ? "bg-brand-50 font-semibold text-brand-800" : "text-neutral-700 hover:bg-neutral-50 hover:text-brand-800"
                              }`}
                            >
                              <Icon name={item.icon} className={selected ? "text-brand-600" : "text-neutral-400"} />
                              <span className="flex-1">{item.label}</span>
                              {selected ? <Icon name="chevron-right" className="text-brand-600" /> : null}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </details>
                ))}
              </div>
            </nav>

            <details
              className="group p-3"
              open={projectContextOpen}
              onToggle={(event) => setProjectContextOpen(event.currentTarget.open)}
            >
              <summary className="mb-3 flex cursor-pointer list-none items-center justify-between text-xs font-semibold uppercase tracking-wide text-neutral-500 [&::-webkit-details-marker]:hidden">
                Project context
                <Icon name="chevron-down" className="transition-transform group-open:rotate-180" />
              </summary>
              <WorkspaceInfo
                data={data}
                ownerName={ownerName}
                groupName={groupName}
                onMembers={() => setDialog("members")}
                onHistory={() => setHistoryOpen((value) => !value)}
                historyOpen={historyOpen}
              />
            </details>
          </div>
        </aside>
      </div>

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
