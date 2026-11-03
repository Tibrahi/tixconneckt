"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ROUTES } from "@/lib/routes";

/** Visible marker on every authenticated page while a demo session is active. */
export function DemoBanner({ label }: { label: string }) {
  const router = useRouter();
  const [exiting, setExiting] = useState(false);

  async function exitDemo() {
    setExiting(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      /* still leave the demo below */
    }
    router.push(ROUTES.demo);
    router.refresh();
  }

  return (
    <div className="mx-auto mb-4 flex max-w-6xl flex-col gap-2 rounded-md border border-dashed border-blue-400 bg-blue-50 px-4 py-3 text-sm text-blue-950 sm:flex-row sm:items-center sm:justify-between" role="status">
      <span>
        <span className="font-semibold">Open demo mode:</span> signed in as {label}.
      </span>
      <span className="flex shrink-0 items-center gap-4">
        <Link href={ROUTES.demo} className="font-semibold underline">
          Switch role
        </Link>
        <button
          type="button"
          onClick={exitDemo}
          disabled={exiting}
          className="font-semibold underline disabled:opacity-60"
        >
          {exiting ? "Exiting…" : "Exit demo"}
        </button>
      </span>
    </div>
  );
}
