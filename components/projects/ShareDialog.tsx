"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Card";
import { SelectField, TextField } from "@/components/ui/Fields";
import { Modal } from "@/components/ui/Modal";
import { api, formatDate, type WorkspaceFolderItem } from "./types";

interface Provider {
  id: string;
  name: string;
  shortId: string;
  country: string | null;
}

interface ShareRow {
  id: string;
  providerId: string;
  providerName: string;
  requestId: string | null;
  permission: string;
  fileIds: string[];
  folderIds: string[];
  expiresAt: string | null;
  createdAt: string;
}

export function ShareDialog({
  projectId,
  folders,
  files,
  preselectedFileIds,
  preselectedFolderIds,
  onClose,
  onDone,
}: {
  projectId: string;
  folders: WorkspaceFolderItem[];
  files: Array<{ id: string; folderId: string; title: string }>;
  preselectedFileIds: string[];
  preselectedFolderIds: string[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [providers, setProviders] = useState<Provider[] | null>(null);
  const [shares, setShares] = useState<ShareRow[] | null>(null);
  const [providerId, setProviderId] = useState("");
  const [fileIds, setFileIds] = useState<Set<string>>(new Set(preselectedFileIds));
  const [folderIds, setFolderIds] = useState<Set<string>>(new Set(preselectedFolderIds));
  const [accessDays, setAccessDays] = useState("30");
  const [reviewRequested, setReviewRequested] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const [p, s] = await Promise.all([
        api<{ providers: Provider[] }>("/api/providers"),
        api<{ shares: ShareRow[] }>(`/api/projects/${projectId}/shares`),
      ]);
      setProviders(p.providers);
      setShares(s.shares);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load sharing data.");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = (set: Set<string>, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      await api(`/api/projects/${projectId}/shares`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId,
          fileIds: [...fileIds],
          folderIds: [...folderIds],
          accessDays: accessDays ? Number(accessDays) : undefined,
          reviewRequested,
        }),
      });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create the share.");
      setSaving(false);
    }
  }

  async function revoke(shareId: string) {
    setError(null);
    try {
      await api(`/api/projects/${projectId}/shares?shareId=${encodeURIComponent(shareId)}`, { method: "DELETE" });
      await load();
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't revoke the share.");
    }
  }

  return (
    <Modal title="Share with provider" onClose={onClose} wide>
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField
            label="Provider"
            value={providerId}
            onChange={(e) => setProviderId(e.target.value)}
            options={[
              { value: "", label: providers ? "Choose a provider…" : "Loading…" },
              ...(providers ?? []).map((p) => ({
                value: p.id,
                label: `${p.name} (${p.shortId})${p.country ? ` · ${p.country}` : ""}`,
              })),
            ]}
          />
          <TextField
            label="Access duration (days, blank = no expiry)"
            value={accessDays}
            inputMode="numeric"
            onChange={(e) => setAccessDays(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
          />
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <fieldset>
            <legend className="text-sm font-medium text-black">Folders ({folderIds.size} selected)</legend>
            <ul className="mt-1 max-h-48 overflow-y-auto rounded-md border border-neutral-200 p-2">
              {folders.map((f) => (
                <li key={f.id}>
                  <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm text-black hover:bg-neutral-100">
                    <input
                      type="checkbox"
                      checked={folderIds.has(f.id)}
                      onChange={() => setFolderIds(toggle(folderIds, f.id))}
                    />
                    <span className="truncate">{f.name}</span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
          <fieldset>
            <legend className="text-sm font-medium text-black">Files ({fileIds.size} selected)</legend>
            <ul className="mt-1 max-h-48 overflow-y-auto rounded-md border border-neutral-200 p-2">
              {files.map((f) => (
                <li key={f.id}>
                  <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm text-black hover:bg-neutral-100">
                    <input
                      type="checkbox"
                      checked={fileIds.has(f.id)}
                      onChange={() => setFileIds(toggle(fileIds, f.id))}
                    />
                    <span className="truncate">{f.title}</span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm text-black">
          <input type="checkbox" checked={reviewRequested} onChange={(e) => setReviewRequested(e.target.checked)} />
          Ask the provider to review these documents
        </label>

        {error ? <p role="alert" className="text-sm font-medium text-red-700">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            icon="share"
            disabled={!providerId || (fileIds.size === 0 && folderIds.size === 0) || saving}
            loading={saving}
            onClick={submit}
          >
            Share {fileIds.size + folderIds.size} item(s)
          </Button>
        </div>

        <div className="border-t border-neutral-200 pt-3">
          <h3 className="mb-2 text-sm font-semibold text-black">Active shares</h3>
          {!shares ? (
            <p className="text-sm text-neutral-600">Loading…</p>
          ) : shares.length === 0 ? (
            <p className="text-sm text-neutral-600">Nothing shared yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {shares.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-neutral-200 px-3 py-2 text-sm">
                  <span className="text-black">
                    {s.providerName} · {s.fileIds.length + s.folderIds.length} item(s)
                    {s.requestId ? " · linked request" : null}
                    {s.expiresAt ? ` · expires ${formatDate(s.expiresAt)}` : " · no expiry"}
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge tone="neutral">{s.permission}</Badge>
                    <Button size="sm" variant="secondary" icon="ban" onClick={() => revoke(s.id)}>
                      Revoke
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}
