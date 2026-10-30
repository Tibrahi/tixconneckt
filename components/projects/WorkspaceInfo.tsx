"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { ROUTES } from "@/lib/routes";
import type { WorkspaceData } from "./types";
import { describeAction, formatDate } from "./types";

interface InfoProps {
  data: WorkspaceData;
  ownerName: string | null;
  groupName: string | null;
  onMembers: () => void;
  onHistory: () => void;
  historyOpen: boolean;
}

export function WorkspaceInfo(props: InfoProps) {
  const { data } = props;
  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto">
      <section>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">About</h3>
        <p className="text-sm text-black">{data.project.summary}</p>
        <div className="mt-2 flex flex-wrap gap-1">
          <Badge tone={data.project.visibility === "private" ? "warning" : "neutral"}>
            {data.project.visibility}
          </Badge>
          <Badge tone="info">{data.project.stage}</Badge>
          <Badge tone="neutral">{data.access.role}</Badge>
        </div>
      </section>

      <section>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">Ownership</h3>
        <p className="text-sm text-black">
          {props.ownerName ?? "Unknown"}
          {props.groupName ? ` · ${props.groupName}` : data.project.groupId ? " · group project" : " · individual"}
        </p>
      </section>

      <section>
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Collaborators ({data.members.length})
          </h3>
          {data.access.canManage ? (
            <button
              type="button"
              onClick={props.onMembers}
              className="text-xs font-medium text-brand-700 hover:underline"
            >
              Manage
            </button>
          ) : null}
        </div>
        {data.members.length === 0 ? (
          <p className="text-sm text-neutral-600">No collaborators yet.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {data.members.slice(0, 8).map((m) => (
              <li key={m.userId} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate text-black">
                  {m.name} <span className="font-mono text-xs text-neutral-500">({m.shortId})</span>
                </span>
                <Badge tone={m.role === "viewer" ? "neutral" : "info"}>{m.role}</Badge>
              </li>
            ))}
          </ul>
        )}
      </section>

      {data.access.role !== "provider" ? (
        <section>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Requests ({data.requests.length})
          </h3>
          {data.requests.length === 0 ? (
            <p className="text-sm text-neutral-600">No funding requests yet.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {data.requests.slice(0, 5).map((r) => (
                <li key={r.id} className="text-sm">
                  <Link href={ROUTES.requestById(r.id)} className="text-brand-700 hover:underline">
                    {(r.amountMinor / 100).toLocaleString()} {r.currency}
                  </Link>{" "}
                  <span className="text-neutral-500">· {r.status.replace(/_/g, " ")}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <section>
        <button
          type="button"
          onClick={props.onHistory}
          aria-expanded={props.historyOpen}
          className="mb-1 flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wide text-neutral-500"
        >
          Recent activity
          <Icon name="chevron-down" className={props.historyOpen ? "" : "-rotate-90"} />
        </button>
        {props.historyOpen ? (
          data.activity.length === 0 ? (
            <p className="text-sm text-neutral-600">No activity yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {data.activity.map((a) => (
                <li key={a.id} className="text-xs text-black">
                  <span className="font-medium">{a.actorName ?? "Someone"}</span>{" "}
                  {describeAction(a.action, a.details)}
                  <span className="block text-neutral-500">{formatDate(a.createdAt)}</span>
                </li>
              ))}
            </ul>
          )
        ) : null}
      </section>
    </div>
  );
}
