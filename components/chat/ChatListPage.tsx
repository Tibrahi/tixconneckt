"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ROUTES } from "@/lib/routes";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge, Card } from "@/components/ui/Card";
import { EmptyState, LoadError, SkeletonList } from "@/components/ui/Feedback";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Fields";
import { ErrorDialog, Modal } from "@/components/ui/Modal";
import { Tabs } from "@/components/ui/Tabs";
import { useSocket } from "@/components/realtime/SocketProvider";

interface Conversation {
  id: string;
  type: string;
  title: string;
  unread: number;
  updatedAt: string;
  lastMessage: { preview: string; createdAt: string } | null;
  memberCount: number;
}

function ConversationList({ items }: { items: Conversation[] }) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon="message"
        title="No conversations"
        message="Start a conversation with an accepted connection, or from one of your groups."
      />
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {items.map((c) => (
        <li key={c.id}>
          <Link
            href={ROUTES.chatThread(c.id)}
            className="flex items-center justify-between gap-2 rounded-md border border-neutral-200 p-3 hover:border-black"
          >
            <span className="min-w-0">
              <span className="block truncate font-medium text-black">{c.title}</span>
              <span className="block truncate text-sm text-neutral-600">
                {c.lastMessage ? c.lastMessage.preview : "No messages yet"}
              </span>
            </span>
            {c.unread > 0 ? (
              <Badge tone="info">
                {c.unread} unread
              </Badge>
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function ChatListPage() {
  const [data, setData] = useState<{ individual: Conversation[]; group: Conversation[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [peerId, setPeerId] = useState("");
  const { onEvent } = useSocket();

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const res = await fetch("/api/chat", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const body = (await res.json()) as {
        ok: boolean;
        data?: { individual: Conversation[]; group: Conversation[] };
      };
      if (!body.ok || !body.data) throw new Error();
      setData(body.data);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 15000);
    const off = onEvent("message:new", () => load());
    return () => {
      clearInterval(id);
      off();
    };
  }, [load, onEvent]);

  async function startDirect() {
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "direct", memberShortIds: [peerId.trim().toUpperCase()] }),
      });
      const body = (await res.json()) as { ok: boolean; data?: { conversationId: string }; error?: string };
      if (!res.ok || !body.ok || !body.data) {
        setError(body.error ?? "We couldn't start this conversation. They must be an accepted connection.");
        return;
      }
      window.location.href = ROUTES.chatThread(body.data.conversationId);
    } catch {
      setError("Your connection was interrupted. Please try again.");
    }
  }

  if (failed) {
    return (
      <>
        <PageHeader title="Chat" />
        <LoadError onRetry={load} />
      </>
    );
  }
  if (!data) {
    return (
      <>
        <PageHeader title="Chat" />
        <SkeletonList rows={4} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Chat"
        description="Persistent conversations with real-time delivery."
        actions={
          <Button size="sm" icon="plus" onClick={() => setNewOpen(true)}>
            New conversation
          </Button>
        }
      />
      <Card title="">
        <Tabs
          tabs={[
            {
              id: "individual",
              label: `Individual (${data.individual.length})`,
              icon: "user",
              content: <ConversationList items={data.individual} />,
            },
            {
              id: "group",
              label: `Group (${data.group.length})`,
              icon: "user-group",
              content: <ConversationList items={data.group} />,
            },
          ]}
        />
      </Card>
      {newOpen ? (
        <Modal title="New conversation" onClose={() => setNewOpen(false)}>
          <p className="mb-3 text-sm text-neutral-600">
            Enter the identifier of an accepted connection. Group conversations start from a group page.
          </p>
          <TextField
            label="Identifier"
            value={peerId}
            onChange={(e) => setPeerId(e.target.value.toUpperCase())}
            placeholder="A2WD"
            maxLength={4}
          />
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setNewOpen(false)}>
              Cancel
            </Button>
            <Button disabled={!/^[A-Z0-9]{4}$/.test(peerId.trim())} onClick={startDirect}>
              Start
            </Button>
          </div>
        </Modal>
      ) : null}
      {error ? <ErrorDialog message={error} onClose={() => setError(null)} /> : null}
    </>
  );
}
