"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ROUTES } from "@/lib/routes";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge, Card } from "@/components/ui/Card";
import { EmptyState, LoadError, SkeletonList } from "@/components/ui/Feedback";
import { Button } from "@/components/ui/Button";
import { TextAreaField, TextField } from "@/components/ui/Fields";
import { ErrorDialog, Modal } from "@/components/ui/Modal";

interface Group {
  id: string;
  name: string;
  description: string | null;
  objective: string | null;
  role: string;
  createdAt: string;
}

export function GroupsPage() {
  const router = useRouter();
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [objective, setObjective] = useState("");
  const [members, setMembers] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const res = await fetch("/api/groups", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const body = (await res.json()) as { ok: boolean; data?: Group[] };
      if (!body.ok || !body.data) throw new Error();
      setGroups(body.data);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function create() {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          objective: objective.trim() || undefined,
          memberShortIds: members.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean),
        }),
      });
      const body = (await res.json()) as { ok: boolean; data?: { groupId: string; skipped?: string[] }; error?: string };
      if (!res.ok || !body.ok || !body.data) {
        setError(body.error ?? "We couldn't create the group. Please try again.");
        return;
      }
      if (body.data.skipped?.length) {
        setError(`Group created, but these identifiers were skipped: ${body.data.skipped.join(", ")}`);
      }
      setOpen(false);
      setName("");
      setDescription("");
      setObjective("");
      setMembers("");
      await load();
      if (!body.data.skipped?.length) router.push(ROUTES.groupById(body.data.groupId));
    } catch {
      setError("Your connection was interrupted. Please try again.");
    } finally {
      setCreating(false);
    }
  }

  if (failed) {
    return (
      <>
        <PageHeader title="Groups" />
        <LoadError onRetry={load} />
      </>
    );
  }
  if (!groups) {
    return (
      <>
        <PageHeader title="Groups" />
        <SkeletonList rows={3} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Groups"
        description="Collaborate toward shared objectives with roles and approvals."
        actions={
          <Button size="sm" icon="plus" onClick={() => setOpen(true)}>
            New group
          </Button>
        }
      />
      {groups.length === 0 ? (
        <EmptyState
          icon="user-group"
          title="No groups yet"
          message="Create a group or get matched with collaborators who share your objective."
          action={
            <Button size="sm" onClick={() => setOpen(true)}>
              Create your first group
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {groups.map((g) => (
            <Card
              key={g.id}
              title={
                <Link href={ROUTES.groupById(g.id)} className="text-brand-700 hover:underline">
                  {g.name}
                </Link>
              }
              actions={<Badge tone={g.role === "admin" ? "info" : "neutral"}>{g.role}</Badge>}
            >
              <p className="text-sm text-neutral-600">{g.objective ?? g.description ?? "No description yet."}</p>
            </Card>
          ))}
        </div>
      )}
      {open ? (
        <Modal title="New group" onClose={() => setOpen(false)}>
          <div className="flex flex-col gap-3">
            <TextField label="Group name" required value={name} onChange={(e) => setName(e.target.value)} />
            <TextAreaField label="Objective" value={objective} onChange={(e) => setObjective(e.target.value)} />
            <TextAreaField label="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
            <TextField
              label="Invite by identifier (comma separated)"
              value={members}
              onChange={(e) => setMembers(e.target.value.toUpperCase())}
              placeholder="A2WD, B7XQ"
            />
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button loading={creating} disabled={name.trim().length < 3} onClick={create}>
              Create group
            </Button>
          </div>
        </Modal>
      ) : null}
      {error ? <ErrorDialog message={error} onClose={() => setError(null)} /> : null}
    </>
  );
}
