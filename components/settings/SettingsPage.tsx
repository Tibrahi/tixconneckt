"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ROUTES } from "@/lib/routes";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge, Card } from "@/components/ui/Card";
import { LoadError, SkeletonList } from "@/components/ui/Feedback";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Fields";
import { ErrorDialog, Modal } from "@/components/ui/Modal";

interface SessionRow {
  id: string;
  createdAt: string;
  expiresAt: string;
  ipAddress: string | null;
  device: string;
  current: boolean;
}

export function SettingsPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changing, setChanging] = useState(false);

  const [dangerAction, setDangerAction] = useState<"deactivate" | "delete" | null>(null);
  const [dangerPassword, setDangerPassword] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState("");

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const res = await fetch("/api/settings", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const body = (await res.json()) as { ok: boolean; data?: { sessions: SessionRow[] } };
      if (!body.ok || !body.data) throw new Error();
      setSessions(body.data.sessions);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function changePassword() {
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }
    setChanging(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, password: newPassword, confirmPassword }),
      });
      const body = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !body.ok) {
        setError(body.error ?? "We couldn't change your password. Please try again.");
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setNotice("Password changed. Other sessions were signed out.");
      load();
    } catch {
      setError("Your connection was interrupted. Please try again.");
    } finally {
      setChanging(false);
    }
  }

  async function revoke(sessionId: string) {
    try {
      const res = await fetch("/api/settings", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      if (!res.ok) throw new Error();
      load();
    } catch {
      setError("We couldn't revoke this session. Please try again.");
    }
  }

  async function danger() {
    if (!dangerAction) return;
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: dangerAction,
          password: dangerPassword,
          confirmation: deleteConfirm || undefined,
        }),
      });
      const body = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !body.ok) {
        setError(body.error ?? "We couldn't complete this action. Please try again.");
        return;
      }
      router.push(ROUTES.login);
      router.refresh();
    } catch {
      setError("Your connection was interrupted. Please try again.");
    }
  }

  if (failed) {
    return (
      <>
        <PageHeader title="Settings" />
        <LoadError onRetry={load} />
      </>
    );
  }
  if (!sessions) {
    return (
      <>
        <PageHeader title="Settings" />
        <SkeletonList rows={3} />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Settings" description="Profile, security, sessions, and account lifecycle." />
      {notice ? (
        <p role="status" className="mb-4 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          {notice}
        </p>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Profile">
          <p className="text-sm text-neutral-600">
            Update your name, contact, skills, and visibility from your profile page.
          </p>
          <div className="mt-3">
            <Link href={ROUTES.profile} className="text-sm font-medium text-brand-700 hover:underline">
              Open profile
            </Link>
          </div>
        </Card>

        <Card title="Change password">
          <div className="flex flex-col gap-3">
            <TextField label="Current password" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
            <TextField label="New password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            <TextField label="Confirm new password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
            <div>
              <Button size="sm" loading={changing} disabled={!currentPassword || newPassword.length < 8} onClick={changePassword}>
                Change password
              </Button>
            </div>
          </div>
        </Card>

        <Card title={`Sessions (${sessions.length})`} className="lg:col-span-2">
          <ul className="flex flex-col gap-2">
            {sessions.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-neutral-200 p-2.5 text-sm">
                <div>
                  <p className="font-medium">
                    {s.device} {s.current ? <Badge tone="info">This device</Badge> : null}
                  </p>
                  <p className="font-mono text-xs text-neutral-500">
                    {s.ipAddress ?? "unknown IP"} · since {new Date(s.createdAt).toLocaleString()}
                  </p>
                </div>
                {!s.current ? (
                  <Button size="sm" variant="secondary" onClick={() => revoke(s.id)}>
                    Revoke
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Deactivate account">
          <p className="text-sm text-neutral-600">
            Deactivation hides your account and signs you out everywhere. An administrator can
            reactivate it. Your data is kept.
          </p>
          <div className="mt-3">
            <Button size="sm" variant="danger" onClick={() => setDangerAction("deactivate")}>
              Deactivate
            </Button>
          </div>
        </Card>

        <Card title="Delete account">
          <p className="text-sm text-neutral-600">
            Deletion permanently anonymizes your personal information. Financial, agreement, and
            audit records that must lawfully be retained are kept without your identity.
          </p>
          <div className="mt-3">
            <Button size="sm" variant="danger" onClick={() => setDangerAction("delete")}>
              Delete permanently
            </Button>
          </div>
        </Card>
      </div>

      {dangerAction ? (
        <Modal
          title={dangerAction === "delete" ? "Delete your account?" : "Deactivate your account?"}
          onClose={() => {
            setDangerAction(null);
            setDangerPassword("");
            setDeleteConfirm("");
          }}
        >
          <p className="mb-3 text-sm text-neutral-600">
            {dangerAction === "delete"
              ? "This permanently anonymizes your personal information. Type DELETE and enter your password to confirm."
              : "This signs you out everywhere and hides your account. Enter your password to confirm."}
          </p>
          <div className="flex flex-col gap-3">
            <TextField label="Password" type="password" value={dangerPassword} onChange={(e) => setDangerPassword(e.target.value)} />
            {dangerAction === "delete" ? (
              <TextField label="Type DELETE to confirm" value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)} />
            ) : null}
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setDangerAction(null);
                setDangerPassword("");
                setDeleteConfirm("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={!dangerPassword || (dangerAction === "delete" && deleteConfirm !== "DELETE")}
              onClick={danger}
            >
              {dangerAction === "delete" ? "Delete permanently" : "Deactivate"}
            </Button>
          </div>
        </Modal>
      ) : null}
      {error ? <ErrorDialog message={error} onClose={() => setError(null)} /> : null}
    </>
  );
}
