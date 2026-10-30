"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ROUTES } from "@/lib/routes";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge, Card } from "@/components/ui/Card";
import { EmptyState, LoadError, SkeletonList } from "@/components/ui/Feedback";
import { Button } from "@/components/ui/Button";
import { ErrorDialog } from "@/components/ui/Modal";
import { ProfilePhotos } from "@/components/profile/ProfilePhotos";

interface ViewableProfile {
  shortId: string;
  name: string;
  category: string;
  country: string | null;
  location: string | null;
  educationLevel: string | null;
  objectives: string | null;
  major: string | null;
  skills: string[];
  strengths: string[];
  fields: string[];
  bio: string | null;
  email: string | null;
  phone: string | null;
  groupCount: number;
  connectionCount: number;
  projectCount: number;
  badges: Array<{ type: string; reason: string | null }>;
  connectionStatus: "none" | "pending_out" | "pending_in" | "accepted";
  profileVisibility: string;
  limitedProfile: boolean;
  avatarUrl: string;
  coverPhotoUrl: string;
}

export function UserProfilePage({ shortId }: { shortId: string }) {
  const [profile, setProfile] = useState<ViewableProfile | null>(null);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const res = await fetch(`/api/profile/${encodeURIComponent(shortId)}`, { cache: "no-store" });
      if (!res.ok) throw new Error();
      const body = (await res.json()) as { ok: boolean; data?: ViewableProfile };
      if (!body.ok || !body.data) throw new Error();
      setProfile(body.data);
    } catch {
      setFailed(true);
    }
  }, [shortId]);

  useEffect(() => {
    load();
  }, [load]);

  async function sendRequest() {
    setActing(true);
    setError(null);
    try {
      const res = await fetch("/api/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shortId: profile?.shortId }),
      });
      const body = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !body.ok) {
        setError(body.error ?? "We couldn't send the request. Please try again.");
        return;
      }
      load();
    } catch {
      setError("Your connection was interrupted. Please try again.");
    } finally {
      setActing(false);
    }
  }

  if (failed) {
    return (
      <>
        <PageHeader title="Profile" />
        <LoadError message="We couldn't find this profile. The identifier may be wrong." onRetry={load} />
      </>
    );
  }
  if (!profile) {
    return (
      <>
        <PageHeader title="Profile" />
        <SkeletonList rows={3} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={profile.name}
        description={
          <>
            Identifier <span className="font-mono font-semibold">{profile.shortId}</span> ·{" "}
            <span className="capitalize">{profile.category}</span>
            {profile.country ? ` · ${profile.country}` : ""}
          </>
        }
        actions={
          profile.connectionStatus === "none" ? (
            <Button size="sm" icon="user-plus" loading={acting} onClick={sendRequest}>
              Send connection request
            </Button>
          ) : profile.connectionStatus === "pending_out" ? (
            <Badge tone="info">Request sent</Badge>
          ) : profile.connectionStatus === "pending_in" ? (
            <Link href={ROUTES.conneckt} className="text-sm font-medium text-brand-700 hover:underline">
              Respond in Conneckt
            </Link>
          ) : (
            <Badge tone="success">Connected</Badge>
          )
        }
      />
      <ProfilePhotos shortId={profile.shortId} />
      {profile.limitedProfile ? (
        <p className="mb-4 rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-700">
          {profile.profileVisibility === "private" ? "This profile shares only its name, identifier, and photos." : "This profile's details are shared with connections only."}
        </p>
      ) : null}
      {!profile.limitedProfile ? <div className="grid gap-4 lg:grid-cols-3">
        <Card title="About">
          <dl className="flex flex-col gap-2 text-sm">
            <div><dt className="text-neutral-600">Education</dt><dd>{profile.educationLevel ?? "—"}</dd></div>
            <div><dt className="text-neutral-600">Major</dt><dd>{profile.major ?? "—"}</dd></div>
            <div><dt className="text-neutral-600">Location</dt><dd>{profile.location ?? profile.country ?? "—"}</dd></div>
            <div><dt className="text-neutral-600">Email</dt><dd className="font-mono">{profile.email ?? "Hidden by owner"}</dd></div>
            <div><dt className="text-neutral-600">Phone</dt><dd className="font-mono">{profile.phone ?? "Hidden by owner"}</dd></div>
          </dl>
        </Card>
        <Card title="Objectives & skills" className="lg:col-span-2">
          <p className="text-sm">{profile.objectives ?? "No objectives shared yet."}</p>
          <div className="mt-3 flex flex-wrap gap-1">
            {profile.skills.length ? profile.skills.map((s) => <Badge key={s}>{s}</Badge>) : <span className="text-sm text-neutral-600">No skills listed.</span>}
          </div>
          {profile.bio ? <p className="mt-3 text-sm text-neutral-700">{profile.bio}</p> : null}
        </Card>
        <Card title="Record">
          <ul className="flex flex-col gap-2 text-sm">
            <li className="flex justify-between"><span>Groups</span><span className="font-mono font-semibold">{profile.groupCount}</span></li>
            <li className="flex justify-between"><span>Connections</span><span className="font-mono font-semibold">{profile.connectionCount}</span></li>
            <li className="flex justify-between"><span>Public projects</span><span className="font-mono font-semibold">{profile.projectCount}</span></li>
          </ul>
        </Card>
        <Card title="Badges" className="lg:col-span-2">
          {profile.badges.length === 0 ? (
            <EmptyState icon="medal" title="No badges" message="This user has not earned badges yet." />
          ) : (
            <ul className="flex flex-wrap gap-2">
              {profile.badges.map((b, i) => (
                <li key={i}><Badge tone="info">{b.type}{b.reason ? ` — ${b.reason}` : ""}</Badge></li>
              ))}
            </ul>
          )}
        </Card>
      </div> : null}
      {error ? <ErrorDialog message={error} onClose={() => setError(null)} /> : null}
    </>
  );
}
