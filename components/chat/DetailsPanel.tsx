"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ROUTES } from "@/lib/routes";
import { DynamicValue } from "@/components/dynamic/DynamicValue";
import { Button } from "@/components/ui/Button";
import { SelectField, TextAreaField } from "@/components/ui/Fields";
import { formatBytes, readApi } from "./types";

interface ContextData {
  conversation: { id: string; type: string; title: string | null; groupId: string | null };
  members: Array<{ userId: string; role: string; name: string; shortId: string; providerKind: string | null; userRole: string }>;
  group: { id: string; name: string; description: string | null; objective: string | null; myRole: string | null; memberCount: number } | null;
  groupProjects: Array<{ id: string; title: string; stage: string; visibility: string }>;
  provider: {
    linkId: string;
    status: string;
    providerName: string | null;
    providerKind: string | null;
    project: { id: string; title: string } | null;
    requests: Array<{ id: string; status: string; amountMinor: number; currency: string }>;
    agreements: Array<{ id: string; requestId: string; title: string; status: string; version: number }>;
  } | null;
}

interface SharedFile {
  messageId: string;
  createdAt: string;
  senderName: string | null;
  documentId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

interface AiRun {
  id: string;
  taskId: string;
  status: string;
  resultJson: Record<string, unknown> | null;
  error: string | null;
  createdAt: string;
  userName: string;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-neutral-200 px-4 py-3 last:border-0">
      <h3 className="mb-2 text-xs font-semibold tracking-wide text-neutral-600 uppercase">{title}</h3>
      {children}
    </section>
  );
}

/**
 * Conversation details: members, shared files, group/project/provider
 * context with verified quick links, and consented AI summaries.
 */
export function DetailsPanel({
  conversationId,
  peerShortId,
  onError,
}: {
  conversationId: string;
  peerShortId: string | null;
  onError: (m: string) => void;
}) {
  const [context, setContext] = useState<ContextData | null>(null);
  const [files, setFiles] = useState<SharedFile[] | null>(null);
  const [runs, setRuns] = useState<AiRun[] | null>(null);
  const [sparkReady, setSparkReady] = useState(true);
  const [taskId, setTaskId] = useState("summarize_conversation");
  const [goal, setGoal] = useState("");
  const [running, setRunning] = useState(false);

  const loadContext = useCallback(async () => {
    try {
      const res = await fetch(`/api/chat/${encodeURIComponent(conversationId)}/context`, { cache: "no-store" });
      setContext(await readApi<ContextData>(res));
    } catch {
      setContext(null);
    }
  }, [conversationId]);

  const loadFiles = useCallback(async () => {
    try {
      const res = await fetch(`/api/chat/${encodeURIComponent(conversationId)}/files`, { cache: "no-store" });
      const data = await readApi<{ files: SharedFile[] }>(res);
      setFiles(data.files);
    } catch {
      setFiles([]);
    }
  }, [conversationId]);

  const loadRuns = useCallback(async () => {
    try {
      const res = await fetch(`/api/chat/${encodeURIComponent(conversationId)}/summarize`, { cache: "no-store" });
      const data = await readApi<{ runs: AiRun[]; sparkConfigured: boolean }>(res);
      setRuns(data.runs);
      setSparkReady(data.sparkConfigured);
    } catch {
      setRuns([]);
    }
  }, [conversationId]);

  useEffect(() => {
    loadContext();
    loadFiles();
    loadRuns();
  }, [loadContext, loadFiles, loadRuns]);

  async function runAi() {
    setRunning(true);
    try {
      const res = await fetch(`/api/chat/${encodeURIComponent(conversationId)}/summarize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, goal: goal.trim() || undefined }),
      });
      await readApi(res);
      setGoal("");
      loadRuns();
    } catch (error) {
      onError(error instanceof Error ? error.message : "The assistant is unavailable right now.");
    } finally {
      setRunning(false);
    }
  }

  async function openFile(documentId: string) {
    try {
      const res = await fetch(`/api/documents/${encodeURIComponent(documentId)}/url`);
      const data = await readApi<{ url: string }>(res);
      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (error) {
      onError(error instanceof Error ? error.message : "This file is unavailable right now.");
    }
  }

  const taskLabel =
    taskId === "summarize_conversation"
      ? "Conversation summary"
      : taskId === "summarize_decisions"
        ? "Decision summary"
        : "Action items";

  return (
    <div className="flex flex-col bg-white">
      <Section title="Members">
        {context === null ? (
          <p className="text-sm text-neutral-600">Loading…</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {context.members.map((m) => (
              <li key={m.userId} className="flex items-center justify-between gap-2 text-sm">
                <Link href={ROUTES.profileById(m.shortId)} className="min-w-0 truncate font-medium text-black hover:underline">
                  {m.name}
                  <span className="ml-1 font-mono text-xs text-neutral-500">{m.shortId}</span>
                </Link>
                <span className="shrink-0 text-xs text-neutral-500 capitalize">
                  {m.userRole === "provider" ? `${m.providerKind ?? "provider"} · ` : ""}
                  {m.role}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Quick links">
        <ul className="flex flex-col gap-1 text-sm">
          {peerShortId ? (
            <li>
              <Link href={ROUTES.profileById(peerShortId)} className="text-brand-700 hover:underline">
                View profile
              </Link>
            </li>
          ) : null}
          {context?.group ? (
            <li>
              <Link href={ROUTES.groupById(context.group.id)} className="text-brand-700 hover:underline">
                Open {context.group.name}
              </Link>
            </li>
          ) : null}
          {context?.groupProjects.map((p) => (
            <li key={p.id}>
              <Link href={ROUTES.projectById(p.id)} className="text-brand-700 hover:underline">
                Project: {p.title}
              </Link>
            </li>
          ))}
          {context?.provider?.project ? (
            <li>
              <Link href={ROUTES.projectById(context.provider.project.id)} className="text-brand-700 hover:underline">
                Project: {context.provider.project.title}
              </Link>
            </li>
          ) : null}
          {context?.provider?.requests.map((r) => (
            <li key={r.id}>
              <Link href={ROUTES.requestById(r.id)} className="text-brand-700 hover:underline">
                Request {r.id.slice(0, 8)} · {r.status}
              </Link>
            </li>
          ))}
          {context?.provider?.agreements.map((a) => (
            <li key={a.id}>
              <Link href={ROUTES.requestById(a.requestId)} className="text-brand-700 hover:underline">
                Agreement: {a.title} (v{a.version})
              </Link>
            </li>
          ))}
          {!peerShortId && !context?.group && (context?.groupProjects.length ?? 0) === 0 && !context?.provider ? (
            <li className="text-neutral-600">No linked items.</li>
          ) : null}
        </ul>
      </Section>

      {context?.group ? (
        <Section title="Group">
          <p className="text-sm font-medium text-black">{context.group.name}</p>
          {context.group.objective ? <p className="text-sm text-neutral-600">{context.group.objective}</p> : null}
          <p className="mt-1 text-xs text-neutral-500">
            {context.group.memberCount} members
            {context.group.myRole ? ` · you are ${context.group.myRole}` : ""}
          </p>
        </Section>
      ) : null}

      {context?.provider ? (
        <Section title="Provider connection">
          <p className="text-sm text-black">
            {context.provider.providerName ?? "Provider"}
            {context.provider.providerKind ? ` · ${context.provider.providerKind}` : ""} · {context.provider.status}
          </p>
        </Section>
      ) : null}

      <Section title="Shared files">
        {files === null ? (
          <p className="text-sm text-neutral-600">Loading…</p>
        ) : files.length === 0 ? (
          <p className="text-sm text-neutral-600">No files shared yet.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {files.slice(0, 30).map((f) => (
              <li key={f.messageId} className="text-sm">
                <button type="button" onClick={() => openFile(f.documentId)} className="truncate text-left text-brand-700 hover:underline">
                  {f.filename}
                </button>
                <span className="ml-1 font-mono text-xs text-neutral-500">{formatBytes(f.sizeBytes)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Assistant">
        {!sparkReady ? (
          <p className="text-sm text-neutral-600">Muse Spark is not configured, so summaries are unavailable.</p>
        ) : (
          <div className="flex flex-col gap-2">
            <SelectField
              label="Task"
              value={taskId}
              onChange={(e) => setTaskId(e.target.value)}
              options={[
                { value: "summarize_conversation", label: "Conversation summary" },
                { value: "summarize_decisions", label: "Decision summary" },
                { value: "extract_action_items", label: "Action items" },
              ]}
            />
            <TextAreaField label="Focus (optional)" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="What should it focus on?" />
            <div>
              <Button size="sm" loading={running} onClick={runAi}>
                Run {taskLabel.toLowerCase()}
              </Button>
            </div>
            <p className="text-xs text-neutral-500">
              Runs only when you ask. Only messages visible to you are included.
            </p>
          </div>
        )}
        {runs === null ? null : runs.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-600">No summaries yet.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {runs.map((r) => (
              <li key={r.id} className="rounded-md border border-neutral-200 p-2 text-sm">
                <p className="text-xs text-neutral-600">
                  {r.taskId.replace(/_/g, " ")} · {r.userName} · {new Date(r.createdAt).toLocaleString("en-US")}
                </p>
                {r.status === "succeeded" && r.resultJson ? (
                  <div className="mt-1">
                    <DynamicValue doc={r.resultJson} />
                  </div>
                ) : (
                  <p className="mt-1 text-red-700">{r.error ?? r.status}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
