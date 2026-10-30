"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Card";
import { PendingIntegration } from "@/components/ui/Feedback";
import { SelectField, TextAreaField } from "@/components/ui/Fields";
import { diffWords, tiptapToText, type WordDiffOp } from "@/lib/project-docs";
import { api } from "./types";

export type ApplyMode = "replace-all" | "replace-selection" | "insert";

const TASKS: Array<{ id: string; label: string; needsSelection?: boolean; needsQuestion?: boolean; needsVersions?: boolean; mode: ApplyMode | "report" | "diff" }> = [
  { id: "summarize", label: "Summarize document", mode: "report" },
  { id: "missing_info", label: "Find missing information", mode: "report" },
  { id: "improve", label: "Improve grammar & clarity", mode: "replace-all" },
  { id: "rewrite_selection", label: "Rewrite selection", mode: "replace-selection", needsSelection: true },
  { id: "generate_section", label: "Generate a section", mode: "insert" },
  { id: "proposal", label: "Draft a proposal", mode: "replace-all" },
  { id: "budget", label: "Draft a budget", mode: "insert" },
  { id: "research", label: "Research notes", mode: "report" },
  { id: "loan_request", label: "Prepare loan request", mode: "replace-all" },
  { id: "support_request", label: "Prepare support request", mode: "replace-all" },
  { id: "analyze_responses", label: "Analyze provider responses", mode: "report" },
  { id: "compare_versions", label: "Compare versions", mode: "diff", needsVersions: true },
  { id: "ask", label: "Ask about files", mode: "report", needsQuestion: true },
];

interface Proposal {
  task: string;
  mode: ApplyMode;
  nodes: unknown[];
  note: string;
  checklist?: string[];
  baseText: string;
}

function DiffView({ ops }: { ops: WordDiffOp[] }) {
  return (
    <p className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded bg-neutral-50 p-2 text-xs leading-relaxed">
      {ops.map((op, i) => (
        <span
          key={i}
          className={
            op.type === "add"
              ? "rounded bg-green-100 text-green-900"
              : op.type === "del"
                ? "rounded bg-red-100 text-red-900 line-through"
                : undefined
          }
        >
          {op.text}{" "}
        </span>
      ))}
    </p>
  );
}

function nodesToBullets(items: string[]): unknown[] {
  return [
    {
      type: "bulletList",
      content: items.map((text) => ({
        type: "listItem",
        content: [{ type: "paragraph", content: [{ type: "text", text: String(text).slice(0, 2000) }] }],
      })),
    },
  ];
}

function ReportView({
  report,
  canEdit,
  onInsert,
}: {
  report: Record<string, unknown>;
  canEdit: boolean;
  onInsert: (nodes: unknown[]) => void;
}) {
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  const strList = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  const insertable: string[] = [
    ...strList(report.keyPoints),
    ...strList(report.questions),
    ...strList(report.assumptions).map((a) => `Assumption to verify: ${a}`),
    ...strList(report.themes),
  ];

  return (
    <div className="flex flex-col gap-2 text-sm">
      {str(report.summary) ? <p className="text-black">{str(report.summary)}</p> : null}
      {str(report.answer) ? <p className="whitespace-pre-wrap text-black">{str(report.answer)}</p> : null}
      {str(report.comparison) ? <p className="whitespace-pre-wrap text-black">{str(report.comparison)}</p> : null}
      {str(report.recommendation) ? (
        <p className="text-black"><span className="font-medium">Recommendation:</span> {str(report.recommendation)}</p>
      ) : null}
      {strList(report.keyPoints).length > 0 ? (
        <ul className="list-disc pl-5 text-black">
          {strList(report.keyPoints).map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
      ) : null}
      {Array.isArray(report.gaps) && report.gaps.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {(report.gaps as Array<{ area?: string; question?: string }>).map((g, i) => (
            <li key={i} className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-900">
              <span className="font-medium">{g.area ?? "Gap"}:</span> {g.question ?? ""}
            </li>
          ))}
        </ul>
      ) : null}
      {Array.isArray(report.findings) && report.findings.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {(report.findings as Array<{ point?: string; sourceHint?: string } | string>).map((f, i) => (
            <li key={i} className="rounded bg-neutral-50 px-2 py-1 text-xs text-black">
              {typeof f === "string" ? f : f.point}
              {typeof f !== "string" && f.sourceHint ? <span className="text-neutral-500"> ({f.sourceHint})</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {strList(report.themes).length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {strList(report.themes).map((t, i) => (
            <Badge key={i} tone="info">{t}</Badge>
          ))}
        </div>
      ) : null}
      {strList(report.questions).length > 0 ? (
        <div>
          <p className="text-xs font-medium text-neutral-600">Follow-up questions</p>
          <ul className="list-disc pl-5 text-xs text-black">
            {strList(report.questions).map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {strList(report.assumptions).length > 0 ? (
        <div>
          <p className="text-xs font-medium text-neutral-600">Assumptions to verify</p>
          <ul className="list-disc pl-5 text-xs text-black">
            {strList(report.assumptions).map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {canEdit && insertable.length > 0 ? (
        <div>
          <Button size="sm" variant="secondary" icon="plus" onClick={() => onInsert(nodesToBullets(insertable))}>
            Insert points as list
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function AssistantPanel({
  projectId,
  fileId,
  versionNumber,
  files,
  canEdit,
  getSelection,
  getText,
  applyNodes,
  onApplied,
}: {
  projectId: string;
  fileId: string;
  versionNumber: number;
  files: Array<{ id: string; title: string }>;
  canEdit: boolean;
  getSelection: () => string;
  getText: () => string;
  applyNodes: (mode: ApplyMode, nodes: unknown[]) => void;
  onApplied: (task: string) => void;
}) {
  const [task, setTask] = useState("summarize");
  const [instruction, setInstruction] = useState("");
  const [question, setQuestion] = useState("");
  const [selection, setSelection] = useState("");
  const [contextIds, setContextIds] = useState<Set<string>>(new Set());
  const [versionA, setVersionA] = useState("1");
  const [versionB, setVersionB] = useState(String(versionNumber));
  const [versions, setVersions] = useState<Array<{ versionNumber: number }>>([]);
  const [running, setRunning] = useState(false);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [report, setReport] = useState<Record<string, unknown> | null>(null);
  const [diff, setDiff] = useState<{ ops: WordDiffOp[]; summary: string | null } | null>(null);

  const taskDef = TASKS.find((t) => t.id === task) ?? TASKS[0];

  useEffect(() => {
    if (!taskDef.needsVersions) return;
    api<{ versions: Array<{ versionNumber: number }> }>(
      `/api/projects/${projectId}/files/${fileId}/versions`,
    )
      .then((d) => {
        setVersions(d.versions);
        if (d.versions.length > 0) {
          setVersionB(String(d.versions[0].versionNumber));
          setVersionA(String(d.versions[d.versions.length - 1].versionNumber));
        }
      })
      .catch(() => setVersions([]));
  }, [projectId, fileId, taskDef.needsVersions, versionNumber]);

  function captureSelection() {
    setSelection(getSelection());
  }

  async function run() {
    setRunning(true);
    setError(null);
    setUnavailable(null);
    setProposal(null);
    setReport(null);
    setDiff(null);
    try {
      const body: Record<string, unknown> = { task };
      if (instruction.trim()) body.instruction = instruction.trim();
      if (taskDef.needsQuestion) body.question = question.trim();
      if (taskDef.needsSelection) body.selection = selection || getSelection();
      if (taskDef.needsVersions) {
        body.versionA = Number(versionA);
        body.versionB = Number(versionB);
      }
      if (contextIds.size > 0) body.fileIds = [...contextIds];
      const data = await api<
        | { kind: "nodes"; nodes: unknown[]; note?: string; checklist?: string[] }
        | { kind: "report"; report: Record<string, unknown> }
        | { kind: "diff"; diff: WordDiffOp[]; summary: string | null }
      >(`/api/projects/${projectId}/files/${fileId}/assist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (data.kind === "nodes" && (taskDef.mode === "replace-all" || taskDef.mode === "replace-selection" || taskDef.mode === "insert")) {
        setProposal({
          task,
          mode: taskDef.mode,
          nodes: data.nodes,
          note: data.note ?? "",
          checklist: data.checklist,
          baseText: taskDef.mode === "replace-selection" ? selection || getSelection() : getText(),
        });
      } else if (data.kind === "report") {
        setReport(data.report);
      } else if (data.kind === "diff") {
        setDiff({ ops: data.diff, summary: data.summary });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "The assistant failed.";
      if (/not configured/i.test(message)) setUnavailable(message);
      else setError(message);
    } finally {
      setRunning(false);
    }
  }

  function accept() {
    if (!proposal) return;
    applyNodes(proposal.mode, proposal.nodes);
    if (proposal.checklist && proposal.checklist.length > 0) {
      applyNodes("insert", nodesToBullets(proposal.checklist.map((c) => `Check: ${c}`)));
    }
    onApplied(proposal.task);
    setProposal(null);
  }

  const toggleContext = (id: string) => {
    setContextIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 5) next.add(id);
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-neutral-200 bg-white p-3">
      <h3 className="text-sm font-semibold text-black">Muse Spark</h3>
      {unavailable ? <PendingIntegration name="Muse Spark" detail={unavailable} /> : null}

      <SelectField
        label="Task"
        value={task}
        onChange={(e) => setTask(e.target.value)}
        options={TASKS.map((t) => ({ value: t.id, label: t.label }))}
      />

      {taskDef.needsSelection ? (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-black">Selected text</span>
            <Button size="sm" variant="secondary" onClick={captureSelection}>
              Use current selection
            </Button>
          </div>
          <p className="max-h-24 overflow-y-auto rounded bg-neutral-50 p-2 text-xs text-black">
            {selection || "Select text in the document, then capture it."}
          </p>
        </div>
      ) : null}

      {taskDef.needsQuestion ? (
        <TextAreaField label="Question" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="What do you want to know?" />
      ) : (
        <TextAreaField label="Instructions (optional)" value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="Tone, focus, constraints…" />
      )}

      {taskDef.needsVersions ? (
        <div className="grid grid-cols-2 gap-2">
          <SelectField label="From" value={versionA} onChange={(e) => setVersionA(e.target.value)} options={versions.map((v) => ({ value: String(v.versionNumber), label: `v${v.versionNumber}` }))} />
          <SelectField label="To" value={versionB} onChange={(e) => setVersionB(e.target.value)} options={versions.map((v) => ({ value: String(v.versionNumber), label: `v${v.versionNumber}` }))} />
        </div>
      ) : null}

      {(task === "ask" || task === "analyze_responses" || task === "research") && files.length > 1 ? (
        <fieldset>
          <legend className="text-sm font-medium text-black">Extra context files ({contextIds.size}/5)</legend>
          <ul className="mt-1 max-h-32 overflow-y-auto rounded-md border border-neutral-200 p-1.5">
            {files.filter((f) => f.id !== fileId).map((f) => (
              <li key={f.id}>
                <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-xs text-black hover:bg-neutral-100">
                  <input type="checkbox" checked={contextIds.has(f.id)} onChange={() => toggleContext(f.id)} />
                  <span className="truncate">{f.title}</span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      ) : null}

      {error ? <p role="alert" className="text-xs font-medium text-red-700">{error}</p> : null}
      <Button
        icon="wand-magic-sparkles"
        loading={running}
        disabled={running || (taskDef.needsQuestion && !question.trim())}
        onClick={run}
      >
        Run on this document
      </Button>

      {proposal ? (
        <div className="flex flex-col gap-2 rounded-md border border-brand-300 bg-brand-50 p-2">
          <p className="text-xs font-semibold text-brand-900">
            Proposed {proposal.mode === "replace-all" ? "replacement" : proposal.mode === "replace-selection" ? "rewrite" : "insertion"} — review before accepting
          </p>
          {proposal.note ? <p className="text-xs text-brand-900">{proposal.note}</p> : null}
          {proposal.mode === "insert" ? (
            <p className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded bg-white p-2 text-xs text-black">
              {tiptapToText({ type: "doc", content: proposal.nodes })}
            </p>
          ) : (
            <DiffView
              ops={diffWords(proposal.baseText, tiptapToText({ type: "doc", content: proposal.nodes }))}
            />
          )}
          {proposal.checklist && proposal.checklist.length > 0 ? (
            <ul className="list-disc pl-5 text-xs text-brand-900">
              {proposal.checklist.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          ) : null}
          <div className="flex gap-2">
            {canEdit ? (
              <Button size="sm" icon="check" onClick={accept}>
                Accept into editor
              </Button>
            ) : (
              <p className="text-xs text-neutral-600">Read-only: you can review but not apply.</p>
            )}
            <Button size="sm" variant="secondary" onClick={() => setProposal(null)}>
              Discard
            </Button>
          </div>
          <p className="text-[11px] text-neutral-600">Accepting edits the draft only — nothing saves until you press Save.</p>
        </div>
      ) : null}

      {report ? (
        <div className="rounded-md border border-neutral-200 p-2">
          <ReportView
            report={report}
            canEdit={canEdit}
            onInsert={(nodes) => {
              applyNodes("insert", nodes);
              onApplied(task);
            }}
          />
          <div className="mt-2">
            <Button size="sm" variant="secondary" onClick={() => setReport(null)}>
              Dismiss
            </Button>
          </div>
        </div>
      ) : null}

      {diff ? (
        <div className="flex flex-col gap-2 rounded-md border border-neutral-200 p-2">
          {diff.summary ? <p className="text-xs text-black">{diff.summary}</p> : null}
          <DiffView ops={diff.ops} />
          <div>
            <Button size="sm" variant="secondary" onClick={() => setDiff(null)}>
              Dismiss
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
