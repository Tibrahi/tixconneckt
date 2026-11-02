"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Badge, Card } from "@/components/ui/Card";
import { EmptyState, LoadError, SkeletonList } from "@/components/ui/Feedback";
import { SelectField, TextAreaField, TextField } from "@/components/ui/Fields";
import { ErrorDialog, Modal } from "@/components/ui/Modal";
import { api, formatDate } from "@/components/projects/types";
import { ROUTES } from "@/lib/routes";

interface ProjectOption { id: string; title: string; summary: string; groupId: string | null }
interface ShareOption { id: string; filename: string; title: string }
interface GroupOption { id: string; name: string; role: string }
interface RecipientOption { value: string; label: string; kind: "provider" | "organization" }
interface CaseRow {
  id: string; projectId: string; projectTitle: string; requesterUserId: string; requesterName: string;
  requesterGroupId: string | null; targetOrganizationId: string | null; targetProviderId: string | null;
  serviceCategory: string; summary: string; status: string; priority: string; assignedUserId: string | null;
  createdAt: string; updatedAt: string; targetName: string | null;
}

const statusLabel: Record<string, string> = {
  pending_group_approval: "Group approval needed", pending: "Submitted", triage: "In review",
  awaiting_requester: "Waiting for you", accepted: "Accepted", declined: "Declined",
  resolved: "Resolved", withdrawn: "Withdrawn",
};

export function SupportRequestsPage({ accountRole, accountCategory, providerKind }: { accountRole: string; accountCategory: string; providerKind: string | null }) {
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [recipients, setRecipients] = useState<RecipientOption[]>([]);
  const [cases, setCases] = useState<CaseRow[] | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [recipient, setRecipient] = useState("");
  const [serviceCategory, setServiceCategory] = useState("");
  const [summary, setSummary] = useState("");
  const [details, setDetails] = useState("");
  const [priority, setPriority] = useState("normal");
  const [shareOptions, setShareOptions] = useState<ShareOption[]>([]);
  const [sharedDocumentIds, setSharedDocumentIds] = useState<string[]>([]);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const [caseData, projectData, groupData, providerData, organizationData] = await Promise.all([
        api<{ requests: CaseRow[] }>("/api/support-requests"),
        api<{ items: ProjectOption[] }>("/api/projects?mine=1&page=1&pageSize=30"),
        api<GroupOption[]>("/api/groups"),
        api<{ providers: Array<{ id: string; name: string; country: string | null; providerKind: string | null }> }>("/api/providers?kind=support&pageSize=50"),
        api<{ organizations: Array<{ id: string; name: string; kind: string | null; category: string | null; country: string | null; verificationStatus: string }> }>("/api/organizations"),
      ]);
      setCases(caseData.requests);
      setProjects(projectData.items);
      setGroups(groupData.filter((group) => group.role === "admin"));
      const options: RecipientOption[] = [
        ...providerData.providers.filter((item) => item.providerKind === "support").map((item) => ({ value: `provider:${item.id}`, label: `${item.name} · Non-financial support${item.country ? ` · ${item.country}` : ""}`, kind: "provider" as const })),
        ...organizationData.organizations.filter((item) => item.verificationStatus === "verified" && (["university", "government"].includes(item.kind ?? "") || (item.kind === "provider" && item.category === "support"))).map((item) => ({ value: `organization:${item.id}`, label: `${item.name} · ${item.kind === "university" ? "University" : item.kind === "government" ? "Government program" : "Support provider"}${item.country ? ` · ${item.country}` : ""}`, kind: "organization" as const })),
      ];
      setRecipients(options);
    } catch { setFailed(true); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    setSharedDocumentIds([]);
    if (!projectId) { setShareOptions([]); return; }
    api<{ documents: ShareOption[] }>(`/api/support-requests?projectId=${encodeURIComponent(projectId)}${groupId ? `&groupId=${encodeURIComponent(groupId)}` : ""}`)
      .then((result) => setShareOptions(result.documents))
      .catch(() => setShareOptions([]));
  }, [projectId, groupId]);
  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    api<Record<string, unknown>>(`/api/support-requests/${selectedId}`).then(setDetail).catch((cause) => setError(cause instanceof Error ? cause.message : "Couldn't open this support case."));
  }, [selectedId]);

  const eligibleProjects = useMemo(() => groupId ? projects.filter((project) => project.groupId === groupId) : projects.filter((project) => !project.groupId), [projects, groupId]);
  const currentCase = cases?.find((item) => item.id === selectedId);
  const supportOnlyView = accountRole === "provider" && providerKind !== "support";

  async function submit() {
    const [recipientKind, recipientId] = recipient.split(":");
    setSaving(true); setError("");
    try {
      const result = await api<{ requestId: string; status: string; conversationId: string | null }>("/api/support-requests", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId, ...(groupId ? { groupId } : {}),
          ...(recipientKind === "provider" ? { targetProviderId: recipientId } : { targetOrganizationId: recipientId }),
          serviceCategory, summary, details: details || undefined, priority, shareDocumentIds: sharedDocumentIds,
        }),
      });
      setOpen(false); setSelectedId(result.requestId); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not submit this support request."); }
    finally { setSaving(false); }
  }

  async function updateCase(input: { status?: string; assignedUserId?: string | null; note?: string }) {
    if (!selectedId) return;
    try {
      await api(`/api/support-requests/${selectedId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
      await load();
      const updated = await api<Record<string, unknown>>(`/api/support-requests/${selectedId}`);
      setDetail(updated);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update this support case."); }
  }

  async function revokeDocument(grantId: string) {
    if (!selectedId) return;
    try {
      await api(`/api/support-requests/${selectedId}/documents`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ grantId }) });
      setDetail(await api<Record<string, unknown>>(`/api/support-requests/${selectedId}`));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Couldn't revoke file access."); }
  }

  if (failed) return <><PageHeader title="Support cases" /><LoadError onRetry={load} /></>;
  if (!cases) return <><PageHeader title="Support cases" /><SkeletonList rows={4} /></>;

  return (
    <>
      <PageHeader title={supportOnlyView ? "Assigned support cases" : accountCategory === "university" ? "Research support" : accountCategory === "government" ? "Assistance cases" : "Non-financial support"}
        description={supportOnlyView ? "Triage and follow through on non-financial cases assigned to your provider account." : "Keep a request, its authorized recipient, decisions, and follow-up in one private case."}
        actions={!supportOnlyView ? <Button size="sm" icon="plus" onClick={() => setOpen(true)}>Ask for support</Button> : undefined} />
      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <Card title="Your case queue">
          {cases.length ? <ul className="flex flex-col gap-2">{cases.map((item) => <li key={item.id}>
            <button type="button" onClick={() => setSelectedId(item.id)} className={`w-full rounded-lg border p-3 text-left transition ${selectedId === item.id ? "border-brand-500 bg-brand-50" : "border-neutral-200 hover:border-brand-300"}`}>
              <span className="flex items-start justify-between gap-3"><span className="min-w-0"><span className="block truncate text-sm font-semibold">{item.summary}</span><span className="mt-1 block truncate text-xs text-neutral-600">{item.projectTitle} · {item.serviceCategory}</span></span><Badge tone={item.status === "resolved" ? "success" : item.status === "declined" || item.status === "withdrawn" ? "neutral" : "info"}>{statusLabel[item.status] ?? item.status}</Badge></span>
              <span className="mt-2 block text-xs text-neutral-500">{item.targetName || "Recipient"} · Updated {formatDate(item.updatedAt)}</span>
            </button>
          </li>)}</ul> : <EmptyState icon="handshake" title="No support cases" message={supportOnlyView ? "Cases sent to your support provider account will appear here." : "Choose a project and verified recipient to start a non-financial support request."} action={!supportOnlyView ? <Button size="sm" onClick={() => setOpen(true)}>Ask for support</Button> : undefined} />}
        </Card>
        <Card title={currentCase ? currentCase.summary : "Case details"}>
          {!currentCase ? <p className="text-sm text-neutral-600">Select a case to see its project context, current state, and timeline.</p> : detail ? <CaseDetail detail={detail} onUpdate={updateCase} onRevokeDocument={revokeDocument} /> : <p className="text-sm text-neutral-600">Loading case details…</p>}
        </Card>
      </div>

      {open ? <Modal title="Ask for non-financial support" onClose={() => setOpen(false)} wide>
        <div className="flex flex-col gap-3">
          <p className="text-sm text-neutral-600">Funding and lending requests stay in the separate funding workflow. This form shares no files automatically.</p>
          <SelectField label="Work context" value={groupId} onChange={(event) => { setGroupId(event.target.value); setProjectId(""); }} options={[{ value: "", label: "Me" }, ...groups.map((group) => ({ value: group.id, label: `Group · ${group.name}` }))]} />
          <SelectField label="Project" required value={projectId} onChange={(event) => setProjectId(event.target.value)} options={[{ value: "", label: "Select your project" }, ...eligibleProjects.map((project) => ({ value: project.id, label: project.title }))]} />
          <SelectField label="Recipient" required value={recipient} onChange={(event) => setRecipient(event.target.value)} options={[{ value: "", label: "Select a verified support partner" }, ...recipients.map((option) => ({ value: option.value, label: option.label }))]} />
          {!recipients.length ? <p className="text-sm text-neutral-600">No verified support partners are available for this request yet.</p> : null}
          <TextField label="Type of help" required value={serviceCategory} onChange={(event) => setServiceCategory(event.target.value)} placeholder="Mentoring, research access, training…" />
          <TextField label="What outcome do you need?" required value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="A short summary for the recipient" />
          <TextAreaField label="Details and timing" value={details} onChange={(event) => setDetails(event.target.value)} hint="Share only the information this partner needs to respond." />
          <fieldset className="flex flex-col gap-2 rounded-md border border-neutral-200 p-3">
            <legend className="px-1 text-sm font-medium">Project files to share</legend>
            {shareOptions.length ? shareOptions.map((file) => <label key={file.id} className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 accent-[#1447e6]" checked={sharedDocumentIds.includes(file.id)} onChange={(event) => setSharedDocumentIds((current) => event.target.checked ? [...current, file.id] : current.filter((id) => id !== file.id))} /><span>{file.title} · {file.filename}</span></label>) : <p className="text-sm text-neutral-600">No project files owned by you are available to share. Nothing will be shared automatically.</p>}
            {sharedDocumentIds.length ? <p className="text-xs text-neutral-600">{sharedDocumentIds.length} selected file(s) will be visible only to the chosen recipient for 30 days. You can revoke access later.</p> : null}
          </fieldset>
          <SelectField label="Priority" value={priority} onChange={(event) => setPriority(event.target.value)} options={[{ value: "normal", label: "Normal" }, { value: "high", label: "High" }]} />
          {groupId ? <p className="rounded-md bg-brand-50 p-3 text-sm text-brand-900">External sharing waits for a group admin to approve the request.</p> : null}
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button loading={saving} disabled={!projectId || !recipient || serviceCategory.trim().length < 2 || summary.trim().length < 8} onClick={() => void submit()}>Submit request</Button></div>
        </div>
      </Modal> : null}
      {error ? <ErrorDialog message={error} onClose={() => setError("")} /> : null}
    </>
  );
}

function CaseDetail({ detail, onUpdate, onRevokeDocument }: { detail: Record<string, unknown>; onUpdate: (input: { status?: string; assignedUserId?: string | null; note?: string }) => Promise<void>; onRevokeDocument: (grantId: string) => Promise<void> }) {
  const request = detail.request as { status: string; details: string | null; priority: string; requesterUserId: string; assignedUserId: string | null };
  const project = detail.project as { id: string; title: string; summary: string; stage: string } | null;
  const requester = detail.requester as { name: string; shortId: string } | null;
  const events = detail.events as Array<{ id: string; event: string; note: string | null; createdAt: string; actorName: string | null }>;
  const files = detail.files as Array<{ grantId: string; documentId: string; filename: string; mimeType: string; expiresAt: string | null }>;
  const conversationId = detail.conversationId as string | null;
  const permissions = detail.permissions as { canRespond: boolean; canWithdraw: boolean; canAssign: boolean };
  const assignees = detail.assignees as Array<{ id: string; name: string; jobTitle: string | null }>;
  const [note, setNote] = useState("");
  const [assigneeId, setAssigneeId] = useState(request.assignedUserId ?? "");
  return <div className="flex flex-col gap-4">
    {project ? <div className="rounded-lg bg-neutral-50 p-3"><p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Project context · {project.stage}</p><Link href={ROUTES.projectById(project.id)} className="mt-1 block font-semibold text-brand-700 hover:underline">{project.title}</Link><p className="mt-1 text-sm text-neutral-600">{project.summary}</p></div> : null}
    <p className="text-sm text-neutral-600">Requested by {requester?.name ?? "participant"}{requester?.shortId ? ` · ${requester.shortId}` : ""} · Priority: {request.priority}</p>
    {request.details ? <p className="whitespace-pre-wrap text-sm leading-6">{request.details}</p> : null}
    {files.length ? <div><h3 className="text-sm font-semibold">Shared files</h3><ul className="mt-1 flex flex-col gap-1">{files.map((file) => <li key={file.documentId} className="flex flex-wrap items-center gap-2"><SharedFile file={file} />{permissions?.canWithdraw ? <Button size="sm" variant="secondary" onClick={() => void onRevokeDocument(file.grantId)}>Revoke access</Button> : null}</li>)}</ul></div> : <p className="text-xs text-neutral-500">No documents were shared with this case.</p>}
    {conversationId ? <Link href={ROUTES.chatThread(conversationId)} className="text-sm font-medium text-brand-700 hover:underline">Open case conversation →</Link> : request.status === "pending_group_approval" ? <p className="text-sm text-neutral-600">Waiting for group approval before the recipient is contacted.</p> : null}
    {permissions?.canAssign && assignees?.length ? <div className="flex items-end gap-2"><SelectField label="Assigned staff member" value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)} options={[{ value: "", label: "Unassigned" }, ...assignees.map((person) => ({ value: person.id, label: `${person.name}${person.jobTitle ? ` · ${person.jobTitle}` : ""}` }))]} /><Button size="sm" variant="secondary" onClick={() => void onUpdate({ assignedUserId: assigneeId || null })}>Save assignment</Button></div> : null}
    {permissions?.canRespond && !["declined", "resolved", "withdrawn"].includes(request.status) ? <div className="flex flex-wrap gap-2">
      {request.status === "pending" || request.status === "awaiting_requester" ? <Button size="sm" onClick={() => void onUpdate({ status: "triage" })}>Start review</Button> : null}
      {request.status === "pending" || request.status === "triage" ? <Button size="sm" variant="secondary" onClick={() => void onUpdate({ status: "awaiting_requester" })}>Ask for information</Button> : null}
      {request.status !== "accepted" ? <Button size="sm" onClick={() => void onUpdate({ status: "accepted", note })}>Accept support request</Button> : null}
      {request.status === "accepted" || request.status === "triage" ? <Button size="sm" onClick={() => void onUpdate({ status: "resolved", note })}>Mark resolved</Button> : null}
      {request.status === "pending" || request.status === "triage" ? <Button size="sm" variant="secondary" onClick={() => void onUpdate({ status: "declined", note })}>Decline</Button> : null}
      <TextAreaField label="Decision or resolution note" value={note} onChange={(event) => setNote(event.target.value)} />
    </div> : null}
    {permissions?.canWithdraw && !["declined", "resolved", "withdrawn"].includes(request.status) ? <Button size="sm" variant="secondary" onClick={() => void onUpdate({ status: "withdrawn" })}>Withdraw request</Button> : null}
    <div className="border-t border-neutral-200 pt-3"><h3 className="text-sm font-semibold">Case timeline</h3>{events.length ? <ol className="mt-2 flex flex-col gap-2">{events.map((event) => <li key={event.id} className="border-l-2 border-brand-200 pl-3"><p className="text-sm font-medium">{event.event.replace(/_/g, " ")}</p><p className="text-xs text-neutral-500">{event.actorName ?? "System"} · {formatDate(event.createdAt)}</p>{event.note ? <p className="mt-1 text-sm text-neutral-700">{event.note}</p> : null}</li>)}</ol> : <p className="mt-1 text-sm text-neutral-600">No recorded updates yet.</p>}</div>
  </div>;
}

function SharedFile({ file }: { file: { documentId: string; filename: string; mimeType: string; expiresAt: string | null } }) {
  const [error, setError] = useState("");
  async function openFile() {
    try {
      const access = await api<{ url: string }>(`/api/documents/${file.documentId}/url`);
      window.open(access.url, "_blank", "noopener,noreferrer");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "This file is no longer shared."); }
  }
  return <span className="flex items-center gap-2 text-sm"><button type="button" onClick={() => void openFile()} className="text-brand-700 underline">{file.filename}</button>{file.expiresAt ? <span className="text-xs text-neutral-500">until {formatDate(file.expiresAt)}</span> : null}{error ? <span role="alert" className="text-xs text-blue-700">{error}</span> : null}</span>;
}
