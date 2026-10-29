"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, StatusBadge } from "@/components/ui/Card";
import { LoadError, SkeletonList } from "@/components/ui/Feedback";
import { Button } from "@/components/ui/Button";
import { SearchInput, Pagination } from "@/components/ui/Pagination";
import { SelectField, TextField } from "@/components/ui/Fields";
import { ErrorDialog, Modal } from "@/components/ui/Modal";

interface AdminUser {
  id: string;
  name: string;
  email: string;
  shortId: string;
  country: string | null;
  category: string;
  role: string;
  status: string;
  createdAt: string;
}

export function AdminUsers() {
  const [items, setItems] = useState<AdminUser[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const res = await fetch(
        `/api/admin/users?page=${page}&pageSize=20&search=${encodeURIComponent(search)}`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error();
      const body = (await res.json()) as { ok: boolean; data?: { items: AdminUser[]; total: number } };
      if (!body.ok || !body.data) throw new Error();
      setItems(body.data.items);
      setTotal(body.data.total);
    } catch {
      setFailed(true);
    }
  }, [page, search]);

  useEffect(() => {
    const id = setTimeout(load, search ? 400 : 0);
    return () => clearTimeout(id);
  }, [load, search]);

  function openEdit(user: AdminUser) {
    setEditing(user);
    setRole(user.role);
    setStatus(user.status);
    setReason("");
  }

  async function save() {
    if (!editing) return;
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: editing.id, role, status, reason: reason || undefined }),
      });
      const body = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !body.ok) {
        setError(body.error ?? "We couldn't update this user. Please try again.");
        return;
      }
      setEditing(null);
      load();
    } catch {
      setError("Your connection was interrupted. Please try again.");
    }
  }

  if (failed) {
    return (
      <>
        <PageHeader title="Users" />
        <LoadError onRetry={load} />
      </>
    );
  }
  if (!items) {
    return (
      <>
        <PageHeader title="Users" />
        <SkeletonList rows={4} />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Users" description="Roles and account states. Every change is audited." />
      <Card title="">
        <div className="mb-3 max-w-sm">
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search name, email, or ID" label="Search users" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-neutral-600">
                <th className="py-2 pr-3 font-medium">User</th>
                <th className="py-2 pr-3 font-medium">ID</th>
                <th className="py-2 pr-3 font-medium">Role</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((u) => (
                <tr key={u.id} className="border-b border-neutral-100">
                  <td className="py-2 pr-3">
                    <span className="font-medium">{u.name}</span>
                    <span className="block font-mono text-xs text-neutral-500">{u.email}</span>
                  </td>
                  <td className="py-2 pr-3 font-mono text-xs">{u.shortId}</td>
                  <td className="py-2 pr-3 capitalize">{u.role}</td>
                  <td className="py-2 pr-3">
                    <StatusBadge status={u.status} />
                  </td>
                  <td className="py-2">
                    <Button size="sm" variant="secondary" onClick={() => openEdit(u)}>
                      Manage
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pageSize={20} total={total} onPage={setPage} />
      </Card>
      {editing ? (
        <Modal title={`Manage ${editing.name}`} onClose={() => setEditing(null)}>
          <div className="flex flex-col gap-3">
            <SelectField
              label="Role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              options={[
                { value: "user", label: "User" },
                { value: "provider", label: "Provider" },
                { value: "admin", label: "Admin" },
              ]}
            />
            <SelectField
              label="Status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              options={[
                { value: "pending_verification", label: "Pending verification" },
                { value: "active", label: "Active" },
                { value: "deactivated", label: "Deactivated" },
                { value: "deleted", label: "Deleted" },
              ]}
            />
            <TextField label="Reason (recorded in audit)" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={save}>Save changes</Button>
          </div>
        </Modal>
      ) : null}
      {error ? <ErrorDialog message={error} onClose={() => setError(null)} /> : null}
    </>
  );
}
