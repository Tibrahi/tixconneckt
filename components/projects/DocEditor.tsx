"use client";

import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import StarterKit from "@tiptap/starter-kit";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Card";
import { EmptyState, LoadError } from "@/components/ui/Feedback";
import { Icon } from "@/components/ui/Icon";
import { ConfirmDialog, ErrorDialog, Modal } from "@/components/ui/Modal";
import { extractHeadings, tiptapToText } from "@/lib/project-docs";
import { api, formatDate, type FileDetail } from "./types";
import { AssistantPanel } from "./AssistantPanel";

type SaveStatus = "saved" | "unsaved" | "saving" | "failed" | "readonly" | "conflict";

interface VersionRow {
  versionNumber: number;
  title: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  authorName: string | null;
}

const EXPORTS = [
  { format: "md", label: "Markdown" },
  { format: "txt", label: "Text" },
  { format: "csv", label: "CSV (tables)" },
  { format: "pdf", label: "PDF" },
  { format: "docx", label: "Word" },
] as const;

function restoreImageRefs(node: unknown, map: Record<string, string>): void {
  if (!node || typeof node !== "object") return;
  const n = node as { type?: string; attrs?: { src?: string }; content?: unknown[] };
  if (n.type === "image" && typeof n.attrs?.src === "string" && map[n.attrs.src]) {
    n.attrs.src = map[n.attrs.src];
  }
  if (Array.isArray(n.content)) for (const child of n.content) restoreImageRefs(child, map);
}

function ToolbarButton({
  label,
  icon,
  active,
  disabled,
  onClick,
}: {
  label: string;
  icon: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`rounded p-1.5 text-sm disabled:opacity-40 ${
        active ? "bg-brand-100 text-brand-800" : "text-black hover:bg-neutral-100"
      }`}
    >
      <Icon name={icon} />
    </button>
  );
}

function Toolbar({ editor, onImage }: { editor: Editor; onImage: () => void }) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [tableMenu, setTableMenu] = useState(false);

  const applyLink = () => {
    const href = linkUrl.trim();
    if (!href) {
      editor.chain().focus().unsetLink().run();
    } else if (/^https?:\/\//i.test(href)) {
      editor.chain().focus().setLink({ href }).run();
    }
    setLinkOpen(false);
    setLinkUrl("");
  };

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-neutral-200 bg-white px-2 py-1.5">
      <ToolbarButton label="Undo" icon="undo" disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()} />
      <ToolbarButton label="Redo" icon="redo" disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()} />
      <span className="mx-1 h-5 w-px bg-neutral-200" />
      <ToolbarButton label="Paragraph" icon="align-left" active={editor.isActive("paragraph")} onClick={() => editor.chain().focus().setParagraph().run()} />
      <ToolbarButton label="Heading 1" icon="heading" active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} />
      <ToolbarButton label="Heading 2" icon="heading" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} />
      <ToolbarButton label="Heading 3" icon="heading" active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} />
      <span className="mx-1 h-5 w-px bg-neutral-200" />
      <ToolbarButton label="Bold" icon="bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} />
      <ToolbarButton label="Italic" icon="italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} />
      <ToolbarButton label="Underline" icon="underline" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()} />
      <ToolbarButton label="Strikethrough" icon="strike" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()} />
      <span className="mx-1 h-5 w-px bg-neutral-200" />
      <ToolbarButton label="Bullet list" icon="list-ul" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()} />
      <ToolbarButton label="Numbered list" icon="list-ol" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
      <ToolbarButton label="Quote" icon="quote" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()} />
      <ToolbarButton label="Code block" icon="code" active={editor.isActive("codeBlock")} onClick={() => editor.chain().focus().toggleCodeBlock().run()} />
      <span className="mx-1 h-5 w-px bg-neutral-200" />
      <ToolbarButton label="Align left" icon="align-left" active={editor.isActive({ textAlign: "left" })} onClick={() => editor.chain().focus().setTextAlign("left").run()} />
      <ToolbarButton label="Align center" icon="align-center" active={editor.isActive({ textAlign: "center" })} onClick={() => editor.chain().focus().setTextAlign("center").run()} />
      <span className="mx-1 h-5 w-px bg-neutral-200" />
      <ToolbarButton label="Link" icon="link" active={editor.isActive("link")} onClick={() => { setLinkUrl(editor.getAttributes("link").href ?? ""); setLinkOpen((v) => !v); }} />
      <ToolbarButton label="Insert image" icon="image" onClick={onImage} />
      <ToolbarButton label="Table" icon="table" active={editor.isActive("table")} onClick={() => setTableMenu((v) => !v)} />
      <ToolbarButton label="Divider" icon="minus" onClick={() => editor.chain().focus().setHorizontalRule().run()} />
      {linkOpen ? (
        <span className="flex items-center gap-1 pl-2">
          <input
            type="url"
            aria-label="Link URL"
            placeholder="https://…"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") applyLink();
            }}
            className="w-44 rounded border border-neutral-300 px-1.5 py-1 text-xs"
          />
          <button type="button" onClick={applyLink} className="rounded bg-brand-600 px-2 py-1 text-xs font-medium text-white">
            Apply
          </button>
        </span>
      ) : null}
      {tableMenu ? (
        <span className="flex flex-wrap items-center gap-1 pl-2 text-xs">
          <button type="button" className="rounded border border-neutral-300 px-1.5 py-1 hover:border-brand-400" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
            Insert 3×3
          </button>
          <button type="button" className="rounded border border-neutral-300 px-1.5 py-1 hover:border-brand-400" onClick={() => editor.chain().focus().addColumnAfter().run()}>
            +Col
          </button>
          <button type="button" className="rounded border border-neutral-300 px-1.5 py-1 hover:border-brand-400" onClick={() => editor.chain().focus().addRowAfter().run()}>
            +Row
          </button>
          <button type="button" className="rounded border border-neutral-300 px-1.5 py-1 hover:border-brand-400" onClick={() => editor.chain().focus().deleteTable().run()}>
            Delete
          </button>
        </span>
      ) : null}
    </div>
  );
}

export function DocEditor({
  projectId,
  fileId,
  contextFiles,
  onClose,
  onShare,
  onChanged,
}: {
  projectId: string;
  fileId: string;
  contextFiles: Array<{ id: string; title: string }>;
  onClose: () => void;
  onShare: (fileId: string) => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<FileDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const [title, setTitle] = useState("");
  const [docType, setDocType] = useState("document");
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const [baseVersion, setBaseVersion] = useState(1);
  const [imageRefs, setImageRefs] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [milestone, setMilestone] = useState("");
  const [milestoneOpen, setMilestoneOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [appliedAi, setAppliedAi] = useState<string | null>(null);
  const [, setOutlineTick] = useState(0);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const editable = !!detail?.editable && !preview;
  const isBinary = !!detail && !!(detail.file.metadata as { attachment?: unknown }).attachment;

  const editor = useEditor(
    {
      extensions: [
        StarterKit,
        Underline,
        Link.configure({ openOnClick: false, autolink: true, defaultProtocol: "https" }),
        Image,
        TextAlign.configure({ types: ["heading", "paragraph"] }),
        Table.configure({ resizable: true }),
        TableRow,
        TableHeader,
        TableCell,
        Placeholder.configure({ placeholder: "Start writing…" }),
      ],
      content: detail?.file.contentJson,
      editable,
      onUpdate: () => {
        if (detail?.editable) {
          setStatus((s) => (s === "saving" || s === "conflict" ? s : "unsaved"));
          setOutlineTick((t) => t + 1);
        }
      },
    },
    [detail?.file.id, preview],
  );

  useEffect(() => {
    editor?.setEditable(editable);
  }, [editor, editable]);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const data = await api<FileDetail>(
        `/api/projects/${projectId}/files/${fileId}`,
      );
      setDetail(data);
      setTitle(data.file.title);
      setDocType(data.file.documentType);
      setBaseVersion(data.file.versionNumber);
      setImageRefs(data.imageRefs ?? {});
      setStatus(data.editable ? "saved" : "readonly");
      setStatusNote(null);
    } catch {
      setFailed(true);
    }
  }, [projectId, fileId]);

  useEffect(() => {
    load();
  }, [load]);

  // Ctrl/Cmd+S saves without leaving the editor.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, title, docType, baseVersion, milestone, appliedAi]);

  async function save(opts?: { milestone?: string; submitResponse?: boolean; forceBase?: number }) {
    if (!editor || !detail?.editable) return;
    setStatus("saving");
    setStatusNote(null);
    try {
      const json = structuredClone(editor.getJSON()) as Record<string, unknown>;
      for (const child of (json.content as unknown[]) ?? []) restoreImageRefs(child, imageRefs);
      const metadata: Record<string, unknown> = {};
      if (appliedAi) metadata.ai = { task: appliedAi, at: new Date().toISOString() };
      const response = (detail.file.metadata as { response?: { requestId?: string } }).response;
      if (response && opts?.submitResponse) metadata.response = { submitted: true };
      const data = await api<{ versionNumber: number }>(
        `/api/projects/${projectId}/files/${fileId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title.trim() || detail.file.title,
            documentType: docType.trim() || detail.file.documentType,
            contentJson: json,
            baseVersion: opts?.forceBase ?? baseVersion,
            milestone: opts?.milestone || undefined,
            metadata,
          }),
        },
      );
      setBaseVersion(data.versionNumber);
      setStatus("saved");
      setAppliedAi(null);
      setMilestone("");
      setMilestoneOpen(false);
      setDetail((d) =>
        d
          ? {
              ...d,
              file: {
                ...d.file,
                title: title.trim() || d.file.title,
                documentType: docType.trim() || d.file.documentType,
                versionNumber: data.versionNumber,
                metadata: {
                  ...d.file.metadata,
                  ...(appliedAi ? { ai: { task: appliedAi, at: new Date().toISOString() } } : {}),
                  ...(response && opts?.submitResponse
                    ? { response: { ...response, submitted: true } }
                    : {}),
                },
              },
            }
          : d,
      );
      onChanged();
      if (opts?.submitResponse) setConfirmSubmit(false);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Save failed.";
      if (/newer version|while you were editing/i.test(message)) {
        setStatus("conflict");
        setStatusNote(message);
      } else {
        setStatus("failed");
        setStatusNote(message);
      }
    }
  }

  async function refreshContent() {
    const fresh = await api<FileDetail>(`/api/projects/${projectId}/files/${fileId}`).catch(() => null);
    if (!fresh) return;
    setDetail(fresh);
    setTitle(fresh.file.title);
    setDocType(fresh.file.documentType);
    setBaseVersion(fresh.file.versionNumber);
    setImageRefs(fresh.imageRefs ?? {});
    setStatus(fresh.editable ? "saved" : "readonly");
    setStatusNote(null);
    editor?.commands.setContent(fresh.file.contentJson as never);
  }

  async function reloadLatest() {
    await refreshContent();
  }

  async function insertImage(file: File) {
    if (!editor || !detail) return;
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("fileId", detail.file.id);
      const up = await api<{ documentId: string; ref: string }>(`/api/projects/${projectId}/images`, {
        method: "POST",
        body: form,
      });
      const signed = await api<{ url: string }>(`/api/documents/${up.documentId}/url`);
      setImageRefs((m) => ({ ...m, [signed.url]: up.ref }));
      editor.chain().focus().setImage({ src: signed.url, alt: file.name }).run();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't insert the image.");
    }
  }

  async function download(format: string) {
    setExportOpen(false);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/files/${fileId}/export?format=${format}`,
        { cache: "no-store" },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Export failed.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title || "document"}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed.");
    }
  }

  async function remove() {
    try {
      await api(`/api/projects/${projectId}/files/${fileId}`, { method: "DELETE" });
      onChanged();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't delete the document.");
    }
  }

  if (failed) {
    return (
      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <LoadError message="We couldn't open this document." onRetry={load} />
        <div className="mt-3">
          <Button size="sm" variant="secondary" icon="arrow-left" onClick={onClose}>
            Back to files
          </Button>
        </div>
      </div>
    );
  }
  if (!detail) {
    return (
      <div className="rounded-lg border border-neutral-200 bg-white p-8 text-center text-sm text-neutral-600">
        Opening document…
      </div>
    );
  }

  if (isBinary) {
    return (
      <BinaryPreview
        projectId={projectId}
        fileId={fileId}
        detail={detail}
        onClose={onClose}
        onChanged={onChanged}
      />
    );
  }

  const response = (detail.file.metadata as { response?: { requestId?: string; submitted?: boolean } }).response;
  const aiMeta = detail.file.metadata.ai as { task?: string; at?: string } | undefined;
  const headings = editor ? extractHeadings(editor.getJSON()) : [];
  const statusLabel: Record<SaveStatus, string> = {
    saved: `Saved · v${baseVersion}`,
    unsaved: "Unsaved changes",
    saving: "Saving…",
    failed: "Save failed",
    readonly: "Read only",
    conflict: "Conflict — review required",
  };

  const jumpToHeading = (index: number) => {
    if (!editor) return;
    let seen = -1;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "heading") {
        seen += 1;
        if (seen === index) {
          editor.chain().focus().setTextSelection(pos).run();
          return false;
        }
      }
      return undefined;
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" icon="arrow-left" onClick={onClose}>
          Files
        </Button>
        <div className="min-w-0 flex-1">
          {detail.editable ? (
            <input
              aria-label="Document title"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setStatus((s) => (s === "saved" ? "unsaved" : s));
              }}
              className="w-full rounded border border-transparent px-1 text-lg font-semibold text-black hover:border-neutral-300 focus:border-brand-500"
            />
          ) : (
            <h2 className="truncate text-lg font-semibold text-black">{detail.file.title}</h2>
          )}
          <p className="px-1 text-xs text-neutral-600">
            v{baseVersion} · {detail.file.documentType} · updated {formatDate(detail.file.updatedAt)}
            {detail.file.updatedByName ? ` by ${detail.file.updatedByName}` : ""}
            {response ? (response.submitted ? " · response submitted" : " · response draft") : ""}
          </p>
        </div>
        <Badge tone={status === "saved" ? "success" : status === "failed" || status === "conflict" ? "danger" : status === "readonly" ? "neutral" : "warning"}>
          {statusLabel[status]}
        </Badge>
      </div>

      {statusNote ? (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {statusNote}
        </p>
      ) : null}
      {status === "conflict" ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" icon="refresh" onClick={reloadLatest}>
            Reload latest (discards my edits)
          </Button>
          <Button size="sm" icon="warning" onClick={() => setConfirmOverwrite(true)}>
            Save mine as the new version
          </Button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-1.5">
        {detail.editable ? (
          <>
            <Button size="sm" icon="check" disabled={status === "saving"} loading={status === "saving"} onClick={() => save()}>
              Save
            </Button>
            <Button size="sm" variant="secondary" icon="history" onClick={() => setMilestoneOpen((v) => !v)}>
              Save as version
            </Button>
          </>
        ) : null}
        <Button size="sm" variant="secondary" icon="eye" onClick={() => setPreview((v) => !v)}>
          {preview ? "Edit" : "Preview"}
        </Button>
        <div className="relative">
          <Button size="sm" variant="secondary" icon="download" onClick={() => setExportOpen((v) => !v)}>
            Download
          </Button>
          {exportOpen ? (
            <div className="absolute z-20 mt-1 flex w-40 flex-col rounded-md border border-neutral-200 bg-white py-1 shadow-lg">
              {EXPORTS.map((x) => (
                <button
                  key={x.format}
                  type="button"
                  onClick={() => download(x.format)}
                  className="px-3 py-1.5 text-left text-sm text-black hover:bg-neutral-100"
                >
                  {x.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        {detail.editable ? (
          <Button size="sm" variant="secondary" icon="share" onClick={() => onShare(detail.file.id)}>
            Share
          </Button>
        ) : null}
        <Button size="sm" variant="secondary" icon="history" onClick={() => setVersionsOpen((v) => !v)}>
          History
        </Button>
        <Button
          size="sm"
          variant={assistantOpen ? "primary" : "secondary"}
          icon="wand-magic-sparkles"
          onClick={() => setAssistantOpen((v) => !v)}
        >
          Assistant
        </Button>
        {response && detail.editable && !response.submitted ? (
          <Button size="sm" icon="send" onClick={() => setConfirmSubmit(true)}>
            Submit response
          </Button>
        ) : null}
        {detail.editable ? (
          <Button size="sm" variant="secondary" icon="trash" onClick={() => setConfirmDelete(true)}>
            Delete
          </Button>
        ) : null}
        {aiMeta?.task ? <Badge tone="info">AI-assisted · {aiMeta.task}</Badge> : null}
      </div>

      {milestoneOpen && detail.editable ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2">
          <input
            aria-label="Version label"
            placeholder="Version label (e.g. Sent to board)"
            value={milestone}
            onChange={(e) => setMilestone(e.target.value)}
            className="min-w-52 flex-1 rounded border border-neutral-300 px-2 py-1 text-sm"
          />
          <Button size="sm" disabled={status === "saving"} onClick={() => save({ milestone: milestone.trim() || undefined })}>
            Save labeled version
          </Button>
        </div>
      ) : null}

      <div className="flex gap-3">
        {headings.length > 0 && !preview ? (
          <aside className="hidden w-48 shrink-0 lg:block" aria-label="Document outline">
            <div className="rounded-lg border border-neutral-200 bg-white p-2">
              <h3 className="px-1 pb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">Outline</h3>
              <ul className="flex flex-col">
                {headings.map((h, i) => (
                  <li key={`${h.level}-${i}`}>
                    <button
                      type="button"
                      onClick={() => jumpToHeading(i)}
                      style={{ paddingLeft: `${0.25 + (h.level - 1) * 0.75}rem` }}
                      className="w-full truncate rounded px-1 py-1 text-left text-xs text-black hover:bg-neutral-100"
                    >
                      {h.text || "(empty heading)"}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        ) : null}

        <div className="min-w-0 flex-1 rounded-lg border border-neutral-200 bg-white">
          {editor && detail.editable && !preview ? <Toolbar editor={editor} onImage={() => imageInputRef.current?.click()} /> : null}
          <input
            ref={imageInputRef}
            type="file"
            accept=".png,.jpg,.jpeg,.gif,.webp"
            className="hidden"
            aria-label="Upload image"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void insertImage(f);
              e.target.value = "";
            }}
          />
          {preview ? (
            <div
              className="doc-preview px-5 py-4 text-sm text-black"
              // Rendered from the editor schema (structured nodes), never raw user HTML.
              dangerouslySetInnerHTML={{ __html: editor?.getHTML() ?? "" }}
            />
          ) : (
            <EditorContent editor={editor} className="tiptap-canvas px-5 py-4 text-sm text-black" />
          )}
        </div>

        {assistantOpen && editor ? (
          <aside className="w-full shrink-0 md:w-80" aria-label="Muse Spark assistant">
            <AssistantPanel
              projectId={projectId}
              fileId={fileId}
              versionNumber={baseVersion}
              files={contextFiles}
              canEdit={detail.editable}
              getSelection={() => {
                const { from, to } = editor.state.selection;
                return editor.state.doc.textBetween(from, to, " ");
              }}
              getText={() => tiptapToText(editor.getJSON())}
              applyNodes={(mode, nodes) => {
                const chain = editor.chain().focus();
                if (mode === "replace-all") chain.setContent({ type: "doc", content: nodes } as never).run();
                else if (mode === "replace-selection") chain.insertContent(nodes as never).run();
                else chain.insertContent(nodes as never).run();
                setStatus("unsaved");
              }}
              onApplied={(task) => setAppliedAi(task)}
            />
          </aside>
        ) : null}
      </div>

      {detail.editable ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-600">
          <label className="flex items-center gap-1">
            Type:
            <input
              aria-label="Document type"
              value={docType}
              onChange={(e) => {
                setDocType(e.target.value);
                setStatus((s) => (s === "saved" ? "unsaved" : s));
              }}
              className="w-36 rounded border border-neutral-300 px-1.5 py-0.5 text-xs"
            />
          </label>
          <span>Ctrl+S saves · every save creates a version</span>
        </div>
      ) : null}

      {versionsOpen ? (
        <VersionsPanel
          projectId={projectId}
          fileId={fileId}
          currentVersion={baseVersion}
          canEdit={detail.editable}
          onClose={() => setVersionsOpen(false)}
          onRestored={() => {
            setVersionsOpen(false);
            onChanged();
            void refreshContent();
          }}
        />
      ) : null}

      {confirmDelete ? (
        <ConfirmDialog
          title="Delete document"
          message={`Delete "${title}" and its full version history? This cannot be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={remove}
          onCancel={() => setConfirmDelete(false)}
        />
      ) : null}
      {confirmOverwrite ? (
        <ConfirmDialog
          title="Overwrite newer version"
          message="Someone saved a newer version. Saving yours now will replace their changes with your copy (kept as a new version). Continue?"
          confirmLabel="Save mine"
          danger
          onConfirm={async () => {
            setConfirmOverwrite(false);
            const fresh = await api<FileDetail>(`/api/projects/${projectId}/files/${fileId}`).catch(() => null);
            if (fresh) {
              setBaseVersion(fresh.file.versionNumber);
              await save({ forceBase: fresh.file.versionNumber });
            }
          }}
          onCancel={() => setConfirmOverwrite(false)}
        />
      ) : null}
      {confirmSubmit ? (
        <ConfirmDialog
          title="Submit response"
          message="Submit this response to the requester? They will be notified immediately."
          confirmLabel="Submit"
          onConfirm={() => save({ submitResponse: true })}
          onCancel={() => setConfirmSubmit(false)}
        />
      ) : null}
      {error ? <ErrorDialog message={error} onClose={() => setError(null)} /> : null}
    </div>
  );
}

function VersionsPanel({
  projectId,
  fileId,
  currentVersion,
  canEdit,
  onClose,
  onRestored,
}: {
  projectId: string;
  fileId: string;
  currentVersion: number;
  canEdit: boolean;
  onClose: () => void;
  onRestored: () => void;
}) {
  const [versions, setVersions] = useState<VersionRow[] | null>(null);
  const [previewing, setPreviewing] = useState<{ n: number; text: string } | null>(null);
  const [restoring, setRestoring] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ currentVersion: number; versions: VersionRow[] }>(
      `/api/projects/${projectId}/files/${fileId}/versions`,
    )
      .then((d) => setVersions(d.versions))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Couldn't load history."));
  }, [projectId, fileId]);

  async function previewVersion(n: number) {
    try {
      const d = await api<{ version: { contentJson: unknown } }>(
        `/api/projects/${projectId}/files/${fileId}/versions?version=${n}`,
      );
      setPreviewing({ n, text: tiptapToText(d.version.contentJson) });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't preview that version.");
    }
  }

  async function restore(n: number) {
    setRestoring(n);
    setError(null);
    try {
      await api(`/api/projects/${projectId}/files/${fileId}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionNumber: n }),
      });
      onRestored();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't restore that version.");
      setRestoring(null);
    }
  }

  return (
    <Modal title={`Version history (current v${currentVersion})`} onClose={onClose} wide>
      {!versions ? (
        <p className="text-sm text-neutral-600">Loading…</p>
      ) : versions.length === 0 ? (
        <EmptyState icon="history" title="No versions" message="Versions appear here after each save." />
      ) : (
        <ul className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto">
          {versions.map((v) => (
            <li key={v.versionNumber} className="rounded-md border border-neutral-200 px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm text-black">
                  <span className="font-medium">v{v.versionNumber}</span> · {v.title}
                  {typeof v.metadata.milestone === "string" ? ` · ${v.metadata.milestone}` : ""}
                  {typeof v.metadata.restoredFrom === "number" ? ` · restored from v${v.metadata.restoredFrom}` : ""}
                  <span className="block text-xs text-neutral-500">
                    {v.authorName ?? "Unknown"} · {formatDate(v.createdAt)}
                  </span>
                </span>
                <span className="flex gap-1.5">
                  <Button size="sm" variant="secondary" icon="eye" onClick={() => previewVersion(v.versionNumber)}>
                    Preview
                  </Button>
                  {canEdit && v.versionNumber !== currentVersion ? (
                    <Button size="sm" variant="secondary" icon="history" loading={restoring === v.versionNumber} onClick={() => restore(v.versionNumber)}>
                      Restore
                    </Button>
                  ) : null}
                </span>
              </div>
              {previewing?.n === v.versionNumber ? (
                <p className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap rounded bg-neutral-50 p-2 text-xs text-black">
                  {previewing.text || "(empty)"}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {error ? <p role="alert" className="mt-2 text-sm font-medium text-red-700">{error}</p> : null}
    </Modal>
  );
}

function BinaryPreview({
  projectId,
  fileId,
  detail,
  onClose,
  onChanged,
}: {
  projectId: string;
  fileId: string;
  detail: FileDetail;
  onClose: () => void;
  onChanged: () => void;
}) {
  const attachment = detail.file.metadata.attachment as
    | { documentId?: string; filename?: string; mimeType?: string; sizeBytes?: number }
    | undefined;
  const [url, setUrl] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const mime = attachment?.mimeType ?? "";

  useEffect(() => {
    if (!attachment?.documentId) {
      setError("This upload has no stored file.");
      return;
    }
    api<{ url: string }>(`/api/documents/${attachment.documentId}/url`)
      .then((d) => {
        setUrl(d.url);
        if (mime.startsWith("text/")) {
          fetch(d.url)
            .then((r) => r.text())
            .then((t) => setText(t.slice(0, 20000)))
            .catch(() => setText(null));
        }
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Couldn't open this file."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachment?.documentId]);

  async function remove() {
    try {
      await api(`/api/projects/${projectId}/files/${fileId}`, { method: "DELETE" });
      onChanged();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't delete the file.");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" icon="arrow-left" onClick={onClose}>
          Files
        </Button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold text-black">{detail.file.title}</h2>
          <p className="text-xs text-neutral-600">
            {attachment?.filename ?? detail.file.documentType}
            {attachment?.sizeBytes ? ` · ${(attachment.sizeBytes / 1024).toFixed(1)} KB` : ""} · v
            {detail.file.versionNumber} · updated {formatDate(detail.file.updatedAt)}
          </p>
        </div>
        {url ? (
          <a href={url} download={attachment?.filename} className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700">
            <Icon name="download" /> Download
          </a>
        ) : null}
        {detail.editable ? (
          <Button size="sm" variant="secondary" icon="trash" onClick={() => setConfirmDelete(true)}>
            Delete
          </Button>
        ) : null}
      </div>
      {error ? <p role="alert" className="text-sm font-medium text-red-700">{error}</p> : null}
      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        {!url ? (
          <p className="text-sm text-neutral-600">Loading preview…</p>
        ) : mime.startsWith("image/") ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={attachment?.filename ?? detail.file.title} className="max-h-[70vh] w-auto rounded" />
        ) : mime === "application/pdf" ? (
          <iframe src={url} title={attachment?.filename ?? detail.file.title} className="h-[70vh] w-full rounded border border-neutral-200" />
        ) : mime.startsWith("text/") ? (
          <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap text-xs text-black">{text ?? "Loading…"}</pre>
        ) : (
          <p className="text-sm text-neutral-600">
            Preview is not available for this format — use Download to open it.
          </p>
        )}
      </div>
      {confirmDelete ? (
        <ConfirmDialog
          title="Delete file"
          message={`Delete "${detail.file.title}"? This cannot be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={remove}
          onCancel={() => setConfirmDelete(false)}
        />
      ) : null}
    </div>
  );
}
