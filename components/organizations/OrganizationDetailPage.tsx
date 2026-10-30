"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Badge, Card } from "@/components/ui/Card";
import { LoadError, SkeletonList } from "@/components/ui/Feedback";
import { FileUpload } from "@/components/ui/FileUpload";
import { SelectField, TextAreaField, TextField } from "@/components/ui/Fields";
import { Icon } from "@/components/ui/Icon";
import { ErrorDialog, Modal } from "@/components/ui/Modal";
import { api, formatDate } from "@/components/projects/types";

interface OrgDetail {
  organization: {
    id: string;
    ownerId: string;
    name: string;
    description: string | null;
    category: string | null;
    website: string | null;
    country: string | null;
    contactJson: Record<string, unknown> | null;
    visibility: string;
    verificationStatus: string;
    logoDocumentId: string | null;
  };
  verifications: Array<{
    id: string;
    status: string;
    note: string | null;
    evidenceCount: number;
    decidedAt: string | null;
    createdAt: string;
  }>;
  viewer: { owner: boolean };
}

export function OrganizationDetailPage({ orgId }: { orgId: string }) {
  const [detail, setDetail] = useState<OrgDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const data = await api<OrgDetail>(`/api/organizations/${orgId}`);
      setDetail(data);
      if (data.organization.logoDocumentId) {
        try {
          const u = await api<{ url: string }>(`/api/documents/${data.organization.logoDocumentId}/url`);
          setLogoUrl(u.url);
        } catch {
          setLogoUrl(null);
        }
      } else {
        setLogoUrl(null);
      }
    } catch {
      setFailed(true);
    }
  }, [orgId]);

  useEffect(() => {
    load();
    api<{ role: string }>("/api/profile")
      .then((p) => setIsAdmin(p.role === "admin"))
      .catch(() => setIsAdmin(false));
  }, [load]);

  async function decide(verificationId: string, decision: "approved" | "rejected", reason?: string) {
    try {
      await api(`/api/organizations/${orgId}/verify`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verificationId, decision, reason }),
      });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't record the decision.");
    }
  }

  if (failed) {
    return (
      <>
        <PageHeader title="Organization" />
        <LoadError message="We couldn't open this organization. It may be private or removed." onRetry={load} />
      </>
    );
  }
  if (!detail) {
    return (
      <>
        <PageHeader title="Organization" />
        <SkeletonList rows={3} />
      </>
    );
  }

  const o = detail.organization;
  const pending = detail.verifications.find((v) => v.status === "pending");

  return (
    <>
      <PageHeader
        title={o.name}
        description={[o.category, o.country, o.website].filter(Boolean).join(" · ") || "Organization profile"}
        actions={
          <span className="flex gap-1.5">
            {detail.viewer.owner ? (
              <Button size="sm" variant="secondary" icon="pen" onClick={() => setEditOpen(true)}>
                Edit profile
              </Button>
            ) : null}
            {detail.viewer.owner && !pending ? (
              <Button size="sm" icon="id-card" onClick={() => setVerifyOpen(true)}>
                Request verification
              </Button>
            ) : null}
          </span>
        }
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Profile">
          <div className="flex items-start gap-3">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt={`${o.name} logo`} className="h-16 w-16 rounded-md border border-neutral-200 object-cover" />
            ) : (
              <span className="flex h-16 w-16 items-center justify-center rounded-md border border-neutral-200 bg-neutral-50">
                <Icon name="building" className="text-xl text-neutral-400" />
              </span>
            )}
            <div>
              <div className="flex flex-wrap gap-1">
                <Badge tone={o.verificationStatus === "verified" ? "success" : o.verificationStatus === "pending" ? "warning" : "neutral"}>
                  {o.verificationStatus === "verified" ? "Verified" : o.verificationStatus === "pending" ? "Pending review" : "Unverified"}
                </Badge>
                <Badge tone="neutral">{o.visibility}</Badge>
              </div>
              {o.description ? <p className="mt-2 text-sm text-black">{o.description}</p> : null}
              {o.website ? (
                <p className="mt-1 text-sm">
                  <a href={o.website} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline">
                    {o.website}
                  </a>
                </p>
              ) : null}
            </div>
          </div>
          {o.contactJson && Object.keys(o.contactJson).length > 0 ? (
            <div className="mt-3 rounded-md bg-neutral-50 p-2 text-xs text-black">
              <p className="font-medium">Contact (visible to you)</p>
              <pre className="mt-1 whitespace-pre-wrap">{JSON.stringify(o.contactJson, null, 2)}</pre>
            </div>
          ) : null}
        </Card>

        <Card title="Verification history">
          {detail.verifications.length === 0 ? (
            <p className="text-sm text-neutral-600">
              No verification requests yet. Verification requires evidence reviewed by an administrator —
              a logo alone never grants it.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {detail.verifications.map((v) => (
                <li key={v.id} className="rounded-md border border-neutral-200 px-3 py-2 text-sm">
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-black">
                      {v.evidenceCount} evidence file(s) · {formatDate(v.createdAt)}
                    </span>
                    <Badge tone={v.status === "approved" ? "success" : v.status === "rejected" ? "danger" : "warning"}>
                      {v.status}
                    </Badge>
                  </span>
                  {v.note ? <p className="mt-1 text-xs text-neutral-600">Reviewer note: {v.note}</p> : null}
                  {isAdmin && v.status === "pending" ? (
                    <DecideRow onDecide={(decision, reason) => decide(v.id, decision, reason)} />
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {editOpen ? (
        <EditForm
          org={o}
          onClose={() => setEditOpen(false)}
          onDone={() => {
            setEditOpen(false);
            load();
          }}
        />
      ) : null}
      {verifyOpen ? (
        <VerifyForm
          orgId={o.id}
          onClose={() => setVerifyOpen(false)}
          onDone={() => {
            setVerifyOpen(false);
            load();
          }}
        />
      ) : null}
      {error ? <ErrorDialog message={error} onClose={() => setError(null)} /> : null}
    </>
  );
}

function DecideRow({ onDecide }: { onDecide: (decision: "approved" | "rejected", reason?: string) => void }) {
  const [reason, setReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  if (!rejecting) {
    return (
      <span className="mt-2 flex gap-2">
        <Button size="sm" icon="check" onClick={() => onDecide("approved")}>
          Verify
        </Button>
        <Button size="sm" variant="secondary" icon="xmark" onClick={() => setRejecting(true)}>
          Decline
        </Button>
      </span>
    );
  }
  return (
    <span className="mt-2 flex flex-col gap-1.5">
      <TextAreaField label="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} />
      <span className="flex gap-2">
        <Button size="sm" variant="danger" disabled={!reason.trim()} onClick={() => onDecide("rejected", reason.trim())}>
          Confirm decline
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setRejecting(false)}>
          Cancel
        </Button>
      </span>
    </span>
  );
}

function EditForm({
  org,
  onClose,
  onDone,
}: {
  org: OrgDetail["organization"];
  onClose: () => void;
  onDone: () => void;
}) {
  const [name, setName] = useState(org.name);
  const [description, setDescription] = useState(org.description ?? "");
  const [category, setCategory] = useState(org.category ?? "");
  const [website, setWebsite] = useState(org.website ?? "");
  const [country, setCountry] = useState(org.country ?? "");
  const [visibility, setVisibility] = useState(org.visibility);
  const [logoId, setLogoId] = useState<string | null>(org.logoDocumentId);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function uploadLogo(file: File) {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("module", "organization");
      const res = await api<{ documentId: string }>("/api/documents", { method: "POST", body: form });
      setLogoId(res.documentId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't upload the logo.");
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      await api(`/api/organizations/${org.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          category: category.trim() || undefined,
          website: website.trim() || undefined,
          country: country.trim() || undefined,
          visibility,
          logoDocumentId: logoId,
        }),
      });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the profile.");
      setSaving(false);
    }
  }

  return (
    <Modal title="Edit organization" onClose={onClose} wide>
      <div className="flex flex-col gap-3">
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <TextAreaField label="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="Category" value={category} onChange={(e) => setCategory(e.target.value)} />
          <TextField label="Country" value={country} onChange={(e) => setCountry(e.target.value)} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="Website" value={website} onChange={(e) => setWebsite(e.target.value)} />
          <SelectField
            label="Visibility"
            value={visibility}
            onChange={(e) => setVisibility(e.target.value)}
            options={[
              { value: "public", label: "Public" },
              { value: "private", label: "Private" },
            ]}
          />
        </div>
        <div>
          <FileUpload label="Replace logo" accept=".png,.jpg,.jpeg,.gif,.webp,.svg" onSelect={uploadLogo} />
          {uploading ? <p className="mt-1 text-xs text-neutral-600">Uploading…</p> : null}
          {logoId ? <p className="mt-1 text-xs text-neutral-600">A logo is attached.</p> : null}
        </div>
        {error ? <p role="alert" className="text-sm font-medium text-red-700">{error}</p> : null}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button disabled={name.trim().length < 2 || saving || uploading} loading={saving} onClick={submit}>
          Save profile
        </Button>
      </div>
    </Modal>
  );
}

function VerifyForm({ orgId, onClose, onDone }: { orgId: string; onClose: () => void; onDone: () => void }) {
  const [evidence, setEvidence] = useState<Array<{ id: string; name: string }>>([]);
  const [note, setNote] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("module", "organization");
      const res = await api<{ documentId: string }>("/api/documents", { method: "POST", body: form });
      setEvidence((e) => [...e, { id: res.documentId, name: file.name }].slice(0, 20));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't upload the evidence.");
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      await api(`/api/organizations/${orgId}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evidenceDocumentIds: evidence.map((e) => e.id), note: note.trim() || undefined }),
      });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't submit the request.");
      setSaving(false);
    }
  }

  return (
    <Modal title="Request verification" onClose={onClose} wide>
      <div className="flex flex-col gap-3">
        <p className="text-sm text-neutral-600">
          Attach registration documents or other legitimacy evidence. An administrator reviews them —
          approval is never automatic.
        </p>
        <FileUpload label="Evidence file" accept=".pdf,.png,.jpg,.jpeg,.txt,.docx" onSelect={upload} />
        {uploading ? <p className="text-xs text-neutral-600">Uploading…</p> : null}
        {evidence.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {evidence.map((e) => (
              <li key={e.id} className="flex items-center justify-between rounded-md border border-neutral-200 px-3 py-1.5 text-sm">
                <span className="truncate">{e.name}</span>
                <button
                  type="button"
                  className="text-sm font-medium text-red-700 hover:underline"
                  onClick={() => setEvidence((list) => list.filter((x) => x.id !== e.id))}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <TextAreaField label="Note for the reviewer (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        {error ? <p role="alert" className="text-sm font-medium text-red-700">{error}</p> : null}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button disabled={evidence.length === 0 || saving || uploading} loading={saving} onClick={submit}>
          Submit for review
        </Button>
      </div>
    </Modal>
  );
}
