"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge, Card } from "@/components/ui/Card";
import { EmptyState, LoadError, PendingIntegration, SkeletonList } from "@/components/ui/Feedback";
import { Button } from "@/components/ui/Button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/Fields";
import { ErrorDialog, Modal } from "@/components/ui/Modal";
import { Icon } from "@/components/ui/Icon";
import { DynamicValue } from "@/components/dynamic/DynamicValue";
import { VoiceRecorder } from "@/components/ai/VoiceRecorder";
import { ProfilePhotos } from "@/components/profile/ProfilePhotos";

interface OwnProfile {
  shortId: string;
  name: string;
  email: string;
  phone: string | null;
  country: string | null;
  countryCode: string | null;
  category: string;
  educationLevel: string | null;
  objectives: string | null;
  major: string | null;
  skills: string[];
  strengths: string[];
  fields: string[];
  bio: string | null;
  location: string | null;
  contactVisibility: string;
  financialVisibility: string;
  profileVisibility: string;
  avatarUrl: string;
  coverPhotoUrl: string;
  role: string;
  providerKind: string | null;
  groupCount: number;
  connectionCount: number;
  projectCount: number;
  badges: Array<{ type: string; reason: string | null }>;
  fundingStatus: { open: number; funded: number };
}

function splitList(value: string): string[] {
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}

export function OwnProfilePage() {
  const [profile, setProfile] = useState<OwnProfile | null>(null);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [assistOpen, setAssistOpen] = useState(false);
  const [assistText, setAssistText] = useState("");
  const [assistLoading, setAssistLoading] = useState(false);
  const [assistPending, setAssistPending] = useState<string | null>(null);
  const [audioNote, setAudioNote] = useState<string | null>(null);
  const [proposal, setProposal] = useState<Record<string, unknown> | null>(null);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const res = await fetch("/api/profile", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const body = (await res.json()) as { ok: boolean; data?: OwnProfile };
      if (!body.ok || !body.data) throw new Error();
      setProfile(body.data);
      setDraft({
        name: body.data.name,
        phone: body.data.phone ?? "",
        country: body.data.country ?? "",
        countryCode: body.data.countryCode ?? "",
        educationLevel: body.data.educationLevel ?? "",
        objectives: body.data.objectives ?? "",
        major: body.data.major ?? "",
        skills: body.data.skills.join(", "),
        strengths: body.data.strengths.join(", "),
        fields: body.data.fields.join(", "),
        bio: body.data.bio ?? "",
        location: body.data.location ?? "",
        contactVisibility: body.data.contactVisibility,
        financialVisibility: body.data.financialVisibility,
        profileVisibility: body.data.profileVisibility,
        providerKind: body.data.providerKind ?? "",
      });
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draft.name || undefined,
          phone: draft.phone || undefined,
          country: draft.country || undefined,
          countryCode: draft.countryCode ?? "",
          educationLevel: draft.educationLevel ?? "",
          objectives: draft.objectives ?? "",
          major: draft.major ?? "",
          skills: splitList(draft.skills ?? ""),
          strengths: splitList(draft.strengths ?? ""),
          fields: splitList(draft.fields ?? ""),
          bio: draft.bio ?? "",
          location: draft.location ?? "",
          contactVisibility: draft.contactVisibility || undefined,
          financialVisibility: draft.financialVisibility || undefined,
          profileVisibility: draft.profileVisibility || undefined,
          ...(draft.providerKind !== undefined ? { providerKind: draft.providerKind || null } : {}),
        }),
      });
      const body = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !body.ok) {
        setError(body.error ?? "We couldn't save your changes. Your entered information is still available. Please try again.");
        return;
      }
      setSaved(true);
      setEditing(false);
      load();
    } catch {
      setError("Your connection was interrupted. Your entered information is still available. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function runAssist() {
    setAssistLoading(true);
    setAssistPending(null);
    setProposal(null);
    try {
      const res = await fetch("/api/profile/voice-assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: assistText }),
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { pending?: boolean; pendingReason?: string; proposal?: Record<string, unknown> };
        error?: string;
      };
      if (!res.ok || !body.ok || !body.data) {
        setError(body.error ?? "The assistant is unavailable right now.");
        return;
      }
      if (body.data.pending) {
        setAssistPending(body.data.pendingReason ?? "AI assistant is not configured");
        return;
      }
      setProposal(body.data.proposal ?? null);
    } catch {
      setError("Your connection was interrupted. Please try again.");
    } finally {
      setAssistLoading(false);
    }
  }

  function applyProposal() {
    if (!proposal) return;
    setDraft((d) => {
      const next = { ...d };
      for (const [key, value] of Object.entries(proposal)) {
        if (Array.isArray(value)) next[key] = value.join(", ");
        else if (typeof value === "string") next[key] = value;
      }
      return next;
    });
    setProposal(null);
    setAssistOpen(false);
    setEditing(true);
  }

  if (failed) {
    return (
      <>
        <PageHeader title="Profile" />
        <LoadError onRetry={load} />
      </>
    );
  }
  if (!profile) {
    return (
      <>
        <PageHeader title="Profile" />
        <SkeletonList rows={4} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Profile"
        description={
          <>
            Identifier <span className="font-mono font-semibold">{profile.shortId}</span> ·{" "}
            <span className="font-mono">{profile.email}</span>
          </>
        }
        actions={
          <>
            <Button variant="secondary" size="sm" icon="wand-magic-sparkles" onClick={() => setAssistOpen(true)}>
              AI assist
            </Button>
            {editing ? (
              <>
                <Button variant="secondary" size="sm" onClick={() => { setEditing(false); load(); }}>
                  Cancel
                </Button>
                <Button size="sm" icon="check" loading={saving} onClick={save}>
                  Save changes
                </Button>
              </>
            ) : (
              <Button size="sm" icon="pen" onClick={() => setEditing(true)}>
                Edit profile
              </Button>
            )}
          </>
        }
      />

      <ProfilePhotos shortId={profile.shortId} editable />

      {saved ? (
        <p role="status" className="mb-4 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          Your profile was saved.
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Identity" className="lg:col-span-1">
          {editing ? (
            <div className="flex flex-col gap-3">
              <TextField label="Full name" value={draft.name ?? ""} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              <TextField label="Phone" value={draft.phone ?? ""} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
              <TextField label="Country" value={draft.country ?? ""} onChange={(e) => setDraft({ ...draft, country: e.target.value })} />
              <TextField label="Country code" value={draft.countryCode ?? ""} onChange={(e) => setDraft({ ...draft, countryCode: e.target.value.toUpperCase().slice(0, 3) })} placeholder="e.g. RW" />
              <TextField label="Location" value={draft.location ?? ""} onChange={(e) => setDraft({ ...draft, location: e.target.value })} />
              {profile.role === "provider" ? (
                <SelectField
                  label="Provider category"
                  value={draft.providerKind ?? ""}
                  onChange={(e) => setDraft({ ...draft, providerKind: e.target.value })}
                  options={[
                    { value: "", label: "Not set" },
                    { value: "loan", label: "Loan provider" },
                    { value: "support", label: "Support provider" },
                  ]}
                  hint="Shown on your provider conversations."
                />
              ) : null}
              <SelectField
                label="Who can view my profile"
                value={draft.profileVisibility ?? "public"}
                onChange={(e) => setDraft({ ...draft, profileVisibility: e.target.value })}
                options={[
                  { value: "public", label: "Everyone" },
                  { value: "connections", label: "My connections" },
                  { value: "private", label: "Only my name and photos" },
                ]}
              />
              <SelectField
                label="Who can see my contact details"
                value={draft.contactVisibility ?? "connections"}
                onChange={(e) => setDraft({ ...draft, contactVisibility: e.target.value })}
                options={[
                  { value: "public", label: "Everyone" },
                  { value: "connections", label: "My connections" },
                  { value: "private", label: "Only me" },
                ]}
              />
              <SelectField
                label="Who can see my financial profile"
                value={draft.financialVisibility ?? "private"}
                onChange={(e) => setDraft({ ...draft, financialVisibility: e.target.value })}
                options={[
                  { value: "private", label: "Only me" },
                  { value: "connections", label: "My connections" },
                ]}
              />
            </div>
          ) : (
            <dl className="flex flex-col gap-2 text-sm">
              <div><dt className="text-neutral-600">Name</dt><dd className="font-medium">{profile.name}</dd></div>
              <div><dt className="text-neutral-600">Phone</dt><dd className="font-mono">{profile.phone ?? "—"}</dd></div>
              <div><dt className="text-neutral-600">Country</dt><dd>{profile.country ?? "—"}</dd></div>
              <div><dt className="text-neutral-600">Country code</dt><dd className="font-mono">{profile.countryCode ?? "—"}</dd></div>
              <div><dt className="text-neutral-600">Location</dt><dd>{profile.location ?? "—"}</dd></div>
              <div><dt className="text-neutral-600">Category</dt><dd className="capitalize">{profile.category}</dd></div>
              <div><dt className="text-neutral-600">Contact visibility</dt><dd className="capitalize">{profile.contactVisibility}</dd></div>
              <div><dt className="text-neutral-600">Financial visibility</dt><dd className="capitalize">{profile.financialVisibility}</dd></div>
              <div><dt className="text-neutral-600">Profile visibility</dt><dd className="capitalize">{profile.profileVisibility}</dd></div>
              {profile.role === "provider" ? (
                <div><dt className="text-neutral-600">Provider category</dt><dd className="capitalize">{profile.providerKind ?? "Not set"}</dd></div>
              ) : null}
            </dl>
          )}
        </Card>

        <Card title="Professional background" className="lg:col-span-2">
          {editing ? (
            <div className="flex flex-col gap-3">
              <TextField label="Education level" value={draft.educationLevel ?? ""} onChange={(e) => setDraft({ ...draft, educationLevel: e.target.value })} />
              <TextField label="Major" value={draft.major ?? ""} onChange={(e) => setDraft({ ...draft, major: e.target.value })} />
              <TextAreaField label="Objectives" value={draft.objectives ?? ""} onChange={(e) => setDraft({ ...draft, objectives: e.target.value })} />
              <TextField label="Skills (comma separated)" value={draft.skills ?? ""} onChange={(e) => setDraft({ ...draft, skills: e.target.value })} />
              <TextField label="Strengths (comma separated)" value={draft.strengths ?? ""} onChange={(e) => setDraft({ ...draft, strengths: e.target.value })} />
              <TextField label="Fields / sectors (comma separated)" value={draft.fields ?? ""} onChange={(e) => setDraft({ ...draft, fields: e.target.value })} />
              <TextAreaField label="Bio" value={draft.bio ?? ""} onChange={(e) => setDraft({ ...draft, bio: e.target.value })} />
            </div>
          ) : (
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="text-neutral-600">Education</dt><dd>{profile.educationLevel ?? "—"}</dd></div>
              <div><dt className="text-neutral-600">Major</dt><dd>{profile.major ?? "—"}</dd></div>
              <div className="sm:col-span-2"><dt className="text-neutral-600">Objectives</dt><dd>{profile.objectives ?? "—"}</dd></div>
              <div className="sm:col-span-2">
                <dt className="text-neutral-600">Skills</dt>
                <dd className="mt-1 flex flex-wrap gap-1">
                  {profile.skills.length ? profile.skills.map((s) => <Badge key={s}>{s}</Badge>) : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-neutral-600">Strengths</dt>
                <dd className="mt-1 flex flex-wrap gap-1">
                  {profile.strengths.length ? profile.strengths.map((s) => <Badge key={s}>{s}</Badge>) : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-neutral-600">Fields / sectors</dt>
                <dd className="mt-1 flex flex-wrap gap-1">
                  {profile.fields.length ? profile.fields.map((s) => <Badge key={s}>{s}</Badge>) : "—"}
                </dd>
              </div>
              <div className="sm:col-span-2"><dt className="text-neutral-600">Bio</dt><dd>{profile.bio ?? "—"}</dd></div>
            </dl>
          )}
        </Card>

        <Card title="Activity" className="lg:col-span-1">
          <ul className="flex flex-col gap-2 text-sm">
            <li className="flex justify-between"><span>Groups</span><span className="font-mono font-semibold">{profile.groupCount}</span></li>
            <li className="flex justify-between"><span>Connections</span><span className="font-mono font-semibold">{profile.connectionCount}</span></li>
            <li className="flex justify-between"><span>Projects</span><span className="font-mono font-semibold">{profile.projectCount}</span></li>
            <li className="flex justify-between"><span>Open funding</span><span className="font-mono font-semibold">{profile.fundingStatus.open}</span></li>
            <li className="flex justify-between"><span>Funded</span><span className="font-mono font-semibold">{profile.fundingStatus.funded}</span></li>
          </ul>
        </Card>

        <Card title="Badges" className="lg:col-span-2">
          {profile.badges.length === 0 ? (
            <EmptyState icon="medal" title="No badges yet" message="Badges are awarded for verified contributions and group roles." />
          ) : (
            <ul className="flex flex-wrap gap-2">
              {profile.badges.map((b, i) => (
                <li key={i}>
                  <Badge tone="info">
                    <Icon name="medal" /> {b.type}
                    {b.reason ? ` — ${b.reason}` : ""}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {assistOpen ? (
        <Modal title="AI profile assistant" onClose={() => setAssistOpen(false)} wide>
          <p className="mb-3 text-sm text-neutral-600">
            Describe yourself in your own words. The assistant proposes field values, and you review
            them before anything is saved.
          </p>
          <TextAreaField
            label="About you"
            value={assistText}
            onChange={(e) => setAssistText(e.target.value)}
            placeholder="I am a software developer from Kigali skilled in React and data analysis…"
          />
          <div className="mt-3">
            <VoiceRecorder
              endpoint="/api/profile/voice-assist"
              docModule="profile"
              onTranscript={(transcript, meta) => {
                setAssistText(transcript);
                setAudioNote(meta.audioNote ?? meta.pendingReason ?? null);
              }}
            />
            {audioNote ? (
              <p className="mt-2 text-xs text-neutral-600">{audioNote}</p>
            ) : null}
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAssistOpen(false)}>
              Close
            </Button>
            <Button loading={assistLoading} disabled={!assistText.trim()} onClick={runAssist}>
              Propose values
            </Button>
          </div>
          {assistPending ? (
            <div className="mt-3">
              <PendingIntegration name="AI assistant" detail={assistPending} />
            </div>
          ) : null}
          {proposal ? (
            <div className="mt-3 rounded-md border border-neutral-200 p-3">
              <p className="mb-2 text-sm font-medium">Proposed values — review before applying:</p>
              <div className="max-h-60 overflow-auto">
                <DynamicValue doc={proposal} />
              </div>
              <div className="mt-3 flex justify-end gap-2">
                <Button variant="secondary" size="sm" onClick={() => setProposal(null)}>
                  Discard
                </Button>
                <Button size="sm" onClick={applyProposal}>
                  Apply to form
                </Button>
              </div>
            </div>
          ) : null}
        </Modal>
      ) : null}
      {error ? <ErrorDialog message={error} onClose={() => setError(null)} /> : null}
    </>
  );
}
