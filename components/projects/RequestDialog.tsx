"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Card";
import { SelectField, TextAreaField, TextField } from "@/components/ui/Fields";
import { Modal } from "@/components/ui/Modal";
import { api, type WorkspaceData } from "./types";

interface Provider {
  id: string;
  name: string;
  shortId: string;
}

interface Group {
  id: string;
  name: string;
  role: string;
}

/**
 * Funding request flow (Project.md §9): pick documents, preview exactly what
 * the provider will see (and what stays private), then explicitly confirm.
 */
export function RequestDialog({
  data,
  kind,
  onClose,
  onDone,
}: {
  data: WorkspaceData;
  kind: "loan" | "support";
  onClose: () => void;
  onDone: (requestId: string) => void;
}) {
  const [step, setStep] = useState<"form" | "preview">("form");
  const [providers, setProviders] = useState<Provider[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [providerId, setProviderId] = useState("");
  const [requesterType, setRequesterType] = useState<"individual" | "group">("individual");
  const [requesterId, setRequesterId] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [message, setMessage] = useState("");
  const [fileIds, setFileIds] = useState<Set<string>>(new Set());
  const [folderIds, setFolderIds] = useState<Set<string>>(new Set([data.rootFolderId]));
  const [accessDays, setAccessDays] = useState("30");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ providers: Provider[] }>("/api/providers")
      .then((p) => setProviders(p.providers))
      .catch(() => setProviders([]));
    api<Group[]>("/api/groups")
      .then((g) => {
        setGroups(g);
        if (data.project.groupId) {
          setRequesterType("group");
          setRequesterId(data.project.groupId);
        }
      })
      .catch(() => setGroups([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = (set: Set<string>, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };

  const sharedFiles = data.files.filter((f) => {
    if (fileIds.has(f.id)) return true;
    // Files inside a shared folder are included.
    let current: string | null = f.folderId;
    const seen = new Set<string>();
    while (current && !seen.has(current)) {
      if (folderIds.has(current)) return true;
      seen.add(current);
      current = data.folders.find((x) => x.id === current)?.parentFolderId ?? null;
    }
    return false;
  });
  const privateFiles = data.files.filter((f) => !sharedFiles.includes(f));

  const amountMinor = Math.round(Number(amount) * 100);
  const valid =
    providerId &&
    (requesterType === "individual" || requesterId) &&
    Number.isFinite(amountMinor) &&
    amountMinor > 0 &&
    (fileIds.size > 0 || folderIds.size > 0);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const res = await api<{ requestId: string }>("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: data.project.id,
          requesterType,
          requesterId: requesterType === "individual" ? data.project.ownerId : requesterId,
          providerId,
          amountMinor,
          currency: currency.trim().toUpperCase() || "USD",
          message: `[${kind.toUpperCase()}] ${message.trim()}`.slice(0, 4000),
          fileIds: [...fileIds],
          folderIds: [...folderIds],
          accessDays: accessDays ? Number(accessDays) : undefined,
        }),
      });
      onDone(res.requestId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't submit the request.");
      setSaving(false);
    }
  }

  return (
    <Modal title={kind === "loan" ? "Request a loan" : "Request support"} onClose={onClose} wide>
      {step === "form" ? (
        <div className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField
              label="Provider"
              value={providerId}
              onChange={(e) => setProviderId(e.target.value)}
              options={[
                { value: "", label: "Choose a provider…" },
                ...providers.map((p) => ({ value: p.id, label: `${p.name} (${p.shortId})` })),
              ]}
            />
            <SelectField
              label="Requesting as"
              value={requesterType}
              onChange={(e) => setRequesterType(e.target.value as "individual" | "group")}
              options={[
                { value: "individual", label: "Individual (project owner)" },
                { value: "group", label: "Group" },
              ]}
            />
          </div>
          {requesterType === "group" ? (
            <SelectField
              label="Group"
              value={requesterId}
              onChange={(e) => setRequesterId(e.target.value)}
              options={[
                { value: "", label: "Choose a group…" },
                ...groups.map((g) => ({ value: g.id, label: `${g.name} (${g.role})` })),
              ]}
            />
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField label="Amount" value={amount} inputMode="decimal" placeholder="e.g. 2500" onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} />
            <TextField label="Currency (3 letters)" value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase().slice(0, 3))} />
          </div>
          <TextAreaField label="Purpose" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="What is this funding for?" />
          <div className="grid gap-3 md:grid-cols-2">
            <fieldset>
              <legend className="text-sm font-medium text-black">Share folders ({folderIds.size})</legend>
              <ul className="mt-1 max-h-44 overflow-y-auto rounded-md border border-neutral-200 p-2">
                {data.folders.map((f) => (
                  <li key={f.id}>
                    <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm text-black hover:bg-neutral-100">
                      <input type="checkbox" checked={folderIds.has(f.id)} onChange={() => setFolderIds(toggle(folderIds, f.id))} />
                      <span className="truncate">{f.name}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>
            <fieldset>
              <legend className="text-sm font-medium text-black">Share files ({fileIds.size})</legend>
              <ul className="mt-1 max-h-44 overflow-y-auto rounded-md border border-neutral-200 p-2">
                {data.files.map((f) => (
                  <li key={f.id}>
                    <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm text-black hover:bg-neutral-100">
                      <input type="checkbox" checked={fileIds.has(f.id)} onChange={() => setFileIds(toggle(fileIds, f.id))} />
                      <span className="truncate">{f.title}</span>
                    </label>
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-xs text-neutral-600">Listing shows the current folder page — pick a folder to include everything inside it.</p>
            </fieldset>
          </div>
          <TextField label="Access duration (days, blank = no expiry)" value={accessDays} inputMode="numeric" onChange={(e) => setAccessDays(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))} />
          {error ? <p role="alert" className="text-sm font-medium text-red-700">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button disabled={!valid} onClick={() => setStep("preview")}>Preview provider view</Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="rounded-md border border-neutral-200 p-3 text-sm">
            <p className="font-semibold text-black">{data.project.title}</p>
            <p className="mt-1 text-black">{data.project.summary}</p>
            <p className="mt-2 text-black">
              <span className="font-medium">{kind === "loan" ? "Loan" : "Support"} request:</span>{" "}
              {Number(amount).toLocaleString()} {currency.trim().toUpperCase() || "USD"} · access{" "}
              {accessDays ? `${accessDays} days` : "until revoked"} · view-only
            </p>
          </div>
          <div>
            <h3 className="mb-1 text-sm font-semibold text-black">
              Provider-visible documents ({sharedFiles.length})
            </h3>
            {sharedFiles.length === 0 ? (
              <p className="text-sm text-neutral-600">Nothing on this page — folders you picked share their contents.</p>
            ) : (
              <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto">
                {sharedFiles.map((f) => (
                  <li key={f.id} className="flex items-center gap-2 text-sm text-black">
                    <Badge tone="info">shared</Badge> {f.title}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="mb-1 text-sm font-semibold text-black">
              Stays private ({privateFiles.length})
            </h3>
            {privateFiles.length === 0 ? (
              <p className="text-sm text-neutral-600">Everything on this page is shared.</p>
            ) : (
              <ul className="flex max-h-32 flex-col gap-1 overflow-y-auto">
                {privateFiles.map((f) => (
                  <li key={f.id} className="flex items-center gap-2 text-sm text-neutral-600">
                    <Badge tone="neutral">private</Badge> {f.title}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p className="text-xs text-neutral-600">
            The provider sees the summary, the shared documents, and a negotiation thread — never your private files, wallet, or other projects.
          </p>
          {error ? <p role="alert" className="text-sm font-medium text-red-700">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setStep("form")}>Back</Button>
            <Button icon="send" loading={saving} onClick={submit}>Confirm and submit</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
