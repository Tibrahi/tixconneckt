"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Card";
import { EmptyState, LoadError, SkeletonList } from "@/components/ui/Feedback";
import { FileUpload } from "@/components/ui/FileUpload";
import { SelectField, TextAreaField, TextField } from "@/components/ui/Fields";
import { Icon } from "@/components/ui/Icon";
import { ErrorDialog, Modal } from "@/components/ui/Modal";
import { ROUTES } from "@/lib/routes";
import { api } from "@/components/projects/types";

interface OrgRow {
  id: string;
  ownerId: string;
  name: string;
  description: string | null;
  category: string | null;
  country: string | null;
  website: string | null;
  visibility: string;
  verificationStatus: string;
  logoDocumentId: string | null;
}

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge tone={status === "verified" ? "success" : status === "pending" ? "warning" : "neutral"}>
      {status === "verified" ? "Verified" : status === "pending" ? "Pending review" : "Unverified"}
    </Badge>
  );
}

export function OrganizationsPage() {
  const [orgs, setOrgs] = useState<OrgRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [logos, setLogos] = useState<Record<string, string>>({});
  const [myId, setMyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const data = await api<{ organizations: OrgRow[] }>("/api/organizations");
      setOrgs(data.organizations);
      // Resolve public logos (signed URLs, authorized server-side).
      const next: Record<string, string> = {};
      await Promise.all(
        data.organizations
          .filter((o) => o.logoDocumentId)
          .map(async (o) => {
            try {
              const u = await api<{ url: string }>(`/api/documents/${o.logoDocumentId}/url`);
              next[o.id] = u.url;
            } catch {
              // Logo stays hidden rather than broken.
            }
          }),
      );
      setLogos(next);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    load();
    api<{ id: string }>("/api/profile")
      .then((p) => setMyId(p.id))
      .catch(() => setMyId(null));
  }, [load]);

  if (failed) {
    return (
      <>
        <PageHeader title="Organizations" />
        <LoadError onRetry={load} />
      </>
    );
  }
  if (!orgs) {
    return (
      <>
        <PageHeader title="Organizations" />
        <SkeletonList rows={4} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Organizations"
        description="Company and provider profiles. A logo alone never means verified — only administrators grant verification."
        actions={
          <Button size="sm" icon="plus" onClick={() => setOpen(true)}>
            New organization
          </Button>
        }
      />
      {orgs.length === 0 ? (
        <EmptyState
          icon="building"
          title="No organizations yet"
          message="Create a professional profile with a logo, then submit verification evidence."
          action={
            <Button size="sm" onClick={() => setOpen(true)}>
              Create organization
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {orgs.map((o) => (
            <li key={o.id} className="rounded-lg border border-neutral-200 bg-white p-4">
              <div className="flex items-start gap-3">
                {logos[o.id] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logos[o.id]} alt="" className="h-11 w-11 shrink-0 rounded-md border border-neutral-200 object-cover" />
                ) : (
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-neutral-200 bg-neutral-50">
                    <Icon name="building" className="text-neutral-400" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <Link href={ROUTES.organizationById(o.id)} className="font-medium text-brand-700 hover:underline">
                    {o.name}
                  </Link>
                  <p className="mt-0.5 line-clamp-2 text-sm text-neutral-600">
                    {[o.category, o.country].filter(Boolean).join(" · ") || "No category yet"}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    <StatusBadge status={o.verificationStatus} />
                    <Badge tone="neutral">{o.visibility}</Badge>
                    {myId === o.ownerId ? <Badge tone="info">mine</Badge> : null}
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {open ? (
        <OrganizationForm
          onClose={() => setOpen(false)}
          onDone={() => {
            setOpen(false);
            load();
          }}
        />
      ) : null}
      {error ? <ErrorDialog message={error} onClose={() => setError(null)} /> : null}
    </>
  );
}

export function OrganizationForm({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [website, setWebsite] = useState("");
  const [country, setCountry] = useState("");
  const [visibility, setVisibility] = useState("public");
  const [logoId, setLogoId] = useState<string | null>(null);
  const [logoName, setLogoName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
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
      setLogoName(file.name);
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
      await api("/api/organizations", {
        method: "POST",
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
      setError(e instanceof Error ? e.message : "Couldn't create the organization.");
      setSaving(false);
    }
  }

  return (
    <Modal title="New organization" onClose={onClose} wide>
      <div className="flex flex-col gap-3">
        <TextField label="Organization or company name" value={name} onChange={(e) => setName(e.target.value)} />
        <TextAreaField label="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="Category" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Lender, NGO, Supplier" />
          <TextField label="Country" value={country} onChange={(e) => setCountry(e.target.value)} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="Website" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://…" />
          <SelectField
            label="Profile visibility"
            value={visibility}
            onChange={(e) => setVisibility(e.target.value)}
            options={[
              { value: "public", label: "Public" },
              { value: "private", label: "Private (owner only)" },
            ]}
          />
        </div>
        <div>
          <FileUpload label="Logo" accept=".png,.jpg,.jpeg,.gif,.webp,.svg" onSelect={uploadLogo} />
          {uploading ? <p className="mt-1 text-xs text-neutral-600">Uploading…</p> : null}
          {logoName ? <p className="mt-1 text-xs text-neutral-600">Attached: {logoName}</p> : null}
        </div>
        {error ? <p role="alert" className="text-sm font-medium text-red-700">{error}</p> : null}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button disabled={name.trim().length < 2 || saving || uploading} loading={saving} onClick={submit}>
          Create organization
        </Button>
      </div>
    </Modal>
  );
}
