"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/Fields";
import { Modal } from "@/components/ui/Modal";
import { api } from "./types";

interface Group {
  id: string;
  name: string;
  role: string;
}

interface Collaborator {
  shortId: string;
  role: "editor" | "viewer";
}

/**
 * Guided project creation (Project.md §2): ownership questions, invites,
 * a permission preview, and an explicit confirmation.
 */
export function ProjectCreateDialog({ onClose, onDone }: { onClose: () => void; onDone: (projectId: string) => void }) {
  const [step, setStep] = useState<"details" | "ownership" | "preview">("details");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [details, setDetails] = useState("");
  const [visibility, setVisibility] = useState("public");
  const [kind, setKind] = useState<"individual" | "group">("individual");
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupId, setGroupId] = useState("");
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [inviteId, setInviteId] = useState("");
  const [inviteRole, setInviteRole] = useState<"editor" | "viewer">("viewer");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Group[]>("/api/groups")
      .then(setGroups)
      .catch(() => setGroups([]));
  }, []);

  const detailsValid = title.trim().length >= 4 && summary.trim().length >= 20;
  const ownershipValid = kind === "individual" || groupId;
  const group = groups.find((g) => g.id === groupId);

  function addCollaborator() {
    const id = inviteId.trim().toUpperCase();
    if (id.length !== 4 || collaborators.some((c) => c.shortId === id)) return;
    setCollaborators((c) => [...c, { shortId: id, role: inviteRole }]);
    setInviteId("");
  }

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const res = await api<{ projectId: string }>("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          summary: summary.trim(),
          details: details.trim() || undefined,
          visibility,
          groupId: kind === "group" ? groupId : undefined,
          collaborators,
        }),
      });
      onDone(res.projectId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create the project.");
      setSaving(false);
    }
  }

  return (
    <Modal title="Create a project" onClose={onClose} wide>
      {step === "details" ? (
        <div className="flex flex-col gap-3">
          <TextField label="What is the project name?" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Digital Agriculture Platform" />
          <TextAreaField label="Describe it (20+ characters)" value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="What problem does it solve, and for whom?" />
          <TextAreaField label="Extra details (optional)" value={details} onChange={(e) => setDetails(e.target.value)} />
          <SelectField
            label="Should the project be private or public?"
            value={visibility}
            onChange={(e) => setVisibility(e.target.value)}
            options={[
              { value: "public", label: "Public — visible to everyone" },
              { value: "private", label: "Private — owner, members, and Super subscribers (Super plan required)" },
            ]}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button disabled={!detailsValid} onClick={() => setStep("ownership")}>Continue</Button>
          </div>
        </div>
      ) : step === "ownership" ? (
        <div className="flex flex-col gap-3">
          <SelectField
            label="Is this an individual project or a group project?"
            value={kind}
            onChange={(e) => setKind(e.target.value as "individual" | "group")}
            options={[
              { value: "individual", label: "Individual — I own it" },
              { value: "group", label: "Group — owned with a group I belong to" },
            ]}
          />
          {kind === "group" ? (
            <SelectField
              label="Which group owns it?"
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              options={[
                { value: "", label: groups.length === 0 ? "You are in no groups yet" : "Choose a group…" },
                ...groups.map((g) => ({ value: g.id, label: `${g.name} (you are ${g.role})` })),
              ]}
            />
          ) : null}
          <div>
            <p className="text-sm font-medium text-black">Should selected collaborators be invited?</p>
            <div className="mt-1 grid gap-2 sm:grid-cols-[1fr_150px_auto]">
              <TextField label="4-character ID" value={inviteId} onChange={(e) => setInviteId(e.target.value.toUpperCase().slice(0, 4))} placeholder="e.g. A3F9" />
              <SelectField
                label="Access"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as "editor" | "viewer")}
                options={[
                  { value: "viewer", label: "View-only" },
                  { value: "editor", label: "Can edit" },
                ]}
              />
              <div className="flex items-end">
                <Button size="sm" variant="secondary" icon="plus" disabled={inviteId.trim().length !== 4} onClick={addCollaborator}>
                  Add
                </Button>
              </div>
            </div>
            {collaborators.length > 0 ? (
              <ul className="mt-2 flex flex-col gap-1">
                {collaborators.map((c) => (
                  <li key={c.shortId} className="flex items-center justify-between rounded-md border border-neutral-200 px-3 py-1.5 text-sm">
                    <span className="font-mono">{c.shortId} <span className="font-sans text-neutral-600">· {c.role === "editor" ? "can edit" : "view-only"}</span></span>
                    <button
                      type="button"
                      className="text-sm font-medium text-red-700 hover:underline"
                      onClick={() => setCollaborators((list) => list.filter((x) => x.shortId !== c.shortId))}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          {error ? <p role="alert" className="text-sm font-medium text-red-700">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setStep("details")}>Back</Button>
            <Button disabled={!ownershipValid} onClick={() => setStep("preview")}>Preview</Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="rounded-md border border-neutral-200 p-3 text-sm">
            <p className="font-semibold text-black">{title.trim()}</p>
            <p className="mt-1 text-black">{summary.trim()}</p>
          </div>
          <dl className="grid gap-2 rounded-md border border-neutral-200 p-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-neutral-600">Owner</dt>
              <dd className="font-medium text-black">You{group ? ` · ${group.name}` : ""}</dd>
            </div>
            <div>
              <dt className="text-neutral-600">Visibility</dt>
              <dd className="font-medium text-black">{visibility}</dd>
            </div>
            <div>
              <dt className="text-neutral-600">Who can view</dt>
              <dd className="font-medium text-black">
                {visibility === "public"
                  ? "Everyone, plus collaborators below"
                  : "Only you, group members, and people below"}
              </dd>
            </div>
            <div>
              <dt className="text-neutral-600">Who can edit documents</dt>
              <dd className="font-medium text-black">
                {collaborators.filter((c) => c.role === "editor").length > 0
                  ? `You and ${collaborators.filter((c) => c.role === "editor").map((c) => c.shortId).join(", ")}`
                  : "Only you"}
                {group ? " (group admins can grant editing access)" : ""}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-neutral-600">Workspace folder</dt>
              <dd className="font-medium text-black">
                A folder named “{title.trim()}” will be created automatically with you as owner.
              </dd>
            </div>
          </dl>
          {collaborators.length > 0 ? (
            <ul className="flex flex-col gap-1 text-sm">
              {collaborators.map((c) => (
                <li key={c.shortId} className="text-black">
                  <span className="font-mono">{c.shortId}</span> — {c.role === "editor" ? "can edit" : "view-only"}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-neutral-600">No collaborators invited — you can invite them later.</p>
          )}
          {error ? <p role="alert" className="text-sm font-medium text-red-700">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setStep("ownership")}>Back</Button>
            <Button icon="check" loading={saving} onClick={submit}>Confirm and create</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
