"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Card";
import { FileUpload } from "@/components/ui/FileUpload";
import { SelectField, TextAreaField, TextField } from "@/components/ui/Fields";
import { Modal } from "@/components/ui/Modal";
import { api } from "./types";

export function FolderDialog({
  projectId,
  parentFolderId,
  onClose,
  onDone,
}: {
  projectId: string;
  parentFolderId: string;
  onClose: () => void;
  onDone: (folderId: string) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const data = await api<{ folderId: string }>(`/api/projects/${projectId}/folders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: description.trim() || undefined, parentFolderId }),
      });
      onDone(data.folderId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create the folder.");
      setSaving(false);
    }
  }

  return (
    <Modal title="New folder" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <TextField label="Folder name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Budget drafts" />
        <TextAreaField label="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
        {error ? <p role="alert" className="text-sm font-medium text-red-700">{error}</p> : null}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button disabled={!name.trim() || saving} loading={saving} onClick={submit}>Create folder</Button>
      </div>
    </Modal>
  );
}

export function FileDialog({
  projectId,
  folderId,
  onClose,
  onDone,
}: {
  projectId: string;
  folderId: string;
  onClose: () => void;
  onDone: (fileId: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [documentType, setDocumentType] = useState("document");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const data = await api<{ fileId: string }>(`/api/projects/${projectId}/files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId, title: title.trim(), documentType: documentType.trim() || "document" }),
      });
      onDone(data.fileId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create the document.");
      setSaving(false);
    }
  }

  return (
    <Modal title="New document" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <TextField label="Document title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Any name — e.g. Irrigation Plan v2" />
        <TextField label="Document type" value={documentType} onChange={(e) => setDocumentType(e.target.value)} placeholder="document, proposal, budget…" />
        {error ? <p role="alert" className="text-sm font-medium text-red-700">{error}</p> : null}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button disabled={!title.trim() || saving} loading={saving} onClick={submit}>Open in playground</Button>
      </div>
    </Modal>
  );
}

export function UploadDialog({
  projectId,
  folderId,
  onClose,
  onDone,
}: {
  projectId: string;
  folderId: string;
  onClose: () => void;
  onDone: (fileId: string) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!file) return;
    setSaving(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("folderId", folderId);
      if (title.trim()) form.append("title", title.trim());
      const data = await api<{ fileId: string }>(`/api/projects/${projectId}/uploads`, {
        method: "POST",
        body: form,
      });
      onDone(data.fileId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't upload the file.");
      setSaving(false);
    }
  }

  return (
    <Modal title="Upload document" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <FileUpload
          label="File"
          accept=".pdf,.docx,.xlsx,.txt,.md,.csv,.png,.jpg,.jpeg,.gif,.webp"
          onSelect={(f) => {
            setFile(f);
            setTitle((t) => t || f.name.replace(/\.[^.]+$/, ""));
          }}
        />
        <TextField label="Display title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />
        <p className="text-xs text-neutral-600">PDF, DOCX, XLSX, TXT, Markdown, CSV, or images up to 10 MB. Content is verified on the server.</p>
        {error ? <p role="alert" className="text-sm font-medium text-red-700">{error}</p> : null}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button disabled={!file || saving} loading={saving} onClick={submit}>Upload</Button>
      </div>
    </Modal>
  );
}

export function RenameFolderDialog({
  projectId,
  folderId,
  currentName,
  onClose,
  onDone,
}: {
  projectId: string;
  folderId: string;
  currentName: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [name, setName] = useState(currentName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      await api(`/api/projects/${projectId}/folders/${folderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't rename the folder.");
      setSaving(false);
    }
  }

  return (
    <Modal title="Rename folder" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <TextField label="Folder name" value={name} onChange={(e) => setName(e.target.value)} />
        {error ? <p role="alert" className="text-sm font-medium text-red-700">{error}</p> : null}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button disabled={!name.trim() || saving} loading={saving} onClick={submit}>Rename</Button>
      </div>
    </Modal>
  );
}

interface MemberRow {
  userId: string;
  role: string;
  name: string;
  shortId: string;
}

export function MembersDialog({
  projectId,
  owner,
  onClose,
  onDone,
}: {
  projectId: string;
  owner: { name: string; shortId: string } | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [members, setMembers] = useState<MemberRow[] | null>(null);
  const [shortId, setShortId] = useState("");
  const [role, setRole] = useState("viewer");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const data = await api<{ owner: unknown; members: MemberRow[] }>(`/api/projects/${projectId}/members`);
      setMembers(data.members);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load collaborators.");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function invite() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/projects/${projectId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shortId: shortId.trim().toUpperCase(), role }),
      });
      setShortId("");
      await load();
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't invite this person.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(userId: string) {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/projects/${projectId}/members?userId=${encodeURIComponent(userId)}`, { method: "DELETE" });
      await load();
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't remove this person.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Collaborators" onClose={onClose} wide>
      <p className="text-sm text-neutral-600">
        Owner: <span className="font-medium text-black">{owner?.name ?? "Unknown"}</span>{" "}
        <span className="font-mono text-xs">({owner?.shortId ?? "—"})</span>
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_140px_auto]">
        <TextField label="Invite by 4-character ID" value={shortId} onChange={(e) => setShortId(e.target.value.toUpperCase())} placeholder="e.g. A3F9" />
        <SelectField
          label="Role"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          options={[
            { value: "viewer", label: "Viewer (read-only)" },
            { value: "editor", label: "Editor" },
            { value: "owner", label: "Co-owner" },
          ]}
        />
        <div className="flex items-end">
          <Button size="sm" icon="user-plus" disabled={shortId.trim().length !== 4 || busy} loading={busy} onClick={invite}>
            Invite
          </Button>
        </div>
      </div>
      <div className="mt-4">
        {!members ? (
          <p className="text-sm text-neutral-600">Loading…</p>
        ) : members.length === 0 ? (
          <p className="text-sm text-neutral-600">No collaborators yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {members.map((m) => (
              <li key={m.userId} className="flex items-center justify-between gap-2 rounded-md border border-neutral-200 px-3 py-2">
                <span className="text-sm text-black">
                  {m.name} <span className="font-mono text-xs text-neutral-500">({m.shortId})</span>
                </span>
                <span className="flex items-center gap-2">
                  <Badge tone={m.role === "viewer" ? "neutral" : "info"}>{m.role}</Badge>
                  <Button size="sm" variant="secondary" icon="trash" disabled={busy} onClick={() => remove(m.userId)}>
                    Remove
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {error ? <p role="alert" className="mt-3 text-sm font-medium text-red-700">{error}</p> : null}
      <div className="mt-4 flex justify-end">
        <Button variant="secondary" onClick={onClose}>Done</Button>
      </div>
    </Modal>
  );
}

export function SettingsDialog({
  projectId,
  initial,
  onClose,
  onDone,
}: {
  projectId: string;
  initial: { title: string; summary: string; visibility: string; stage: string };
  onClose: () => void;
  onDone: () => void;
}) {
  const [title, setTitle] = useState(initial.title);
  const [summary, setSummary] = useState(initial.summary);
  const [visibility, setVisibility] = useState(initial.visibility);
  const [stage, setStage] = useState(initial.stage);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      await api(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_settings", title: title.trim(), summary: summary.trim(), visibility }),
      });
      if (stage !== initial.stage) {
        await api(`/api/projects/${projectId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "restage", stage }),
        });
      }
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save settings.");
      setSaving(false);
    }
  }

  return (
    <Modal title="Project settings" onClose={onClose} wide>
      <div className="flex flex-col gap-3">
        <TextField label="Project name" value={title} onChange={(e) => setTitle(e.target.value)} />
        <TextAreaField label="Description" value={summary} onChange={(e) => setSummary(e.target.value)} />
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField
            label="Visibility"
            value={visibility}
            onChange={(e) => setVisibility(e.target.value)}
            options={[
              { value: "public", label: "Public" },
              { value: "private", label: "Private (Super plan required)" },
            ]}
          />
          <SelectField
            label="Stage"
            value={stage}
            onChange={(e) => setStage(e.target.value)}
            options={[
              { value: "idea", label: "Idea" },
              { value: "developing", label: "Developing" },
              { value: "funded", label: "Funded" },
              { value: "completed", label: "Completed" },
              { value: "archived", label: "Archived" },
            ]}
          />
        </div>
        {error ? <p role="alert" className="text-sm font-medium text-red-700">{error}</p> : null}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button disabled={title.trim().length < 4 || summary.trim().length < 20 || saving} loading={saving} onClick={submit}>
          Save settings
        </Button>
      </div>
    </Modal>
  );
}
