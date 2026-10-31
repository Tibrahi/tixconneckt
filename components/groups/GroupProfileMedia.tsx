"use client";

import Image from "next/image";
import { useState } from "react";

export function GroupProfileMedia({ groupId, editable }: { groupId: string; editable: boolean }) {
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const url = (kind: "avatar" | "cover") => `/api/groups/${encodeURIComponent(groupId)}/media?kind=${kind}&v=${revision}`;

  async function upload(kind: "avatar" | "cover", file?: File) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const bitmap = await createImageBitmap(file);
      const maxWidth = kind === "avatar" ? 512 : 1600;
      const maxHeight = kind === "avatar" ? 512 : 700;
      const scale = Math.min(1, maxWidth / bitmap.width, maxHeight / bitmap.height);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Image editing is unavailable in this browser.");
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Could not prepare this image.")), "image/webp", 0.82));
      if (blob.size > 2 * 1024 * 1024) throw new Error("Choose a smaller image under 2 MB.");
      const form = new FormData();
      form.set("kind", kind);
      form.set("file", blob, `${kind}.webp`);
      const response = await fetch(`/api/groups/${encodeURIComponent(groupId)}/media`, { method: "PUT", body: form });
      const result = await response.json() as { ok: boolean; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error ?? "Could not save this image.");
      setRevision((value) => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save this image.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="relative h-24 overflow-hidden rounded-md bg-neutral-100">
        <Image src={url("cover")} alt="Group cover" fill unoptimized className="object-cover" onError={(event) => { event.currentTarget.style.display = "none"; }} />
        {editable ? <label className="absolute right-2 top-2 cursor-pointer rounded-md bg-white px-3 py-2 text-xs font-semibold text-black shadow-sm">Change cover<input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(event) => { void upload("cover", event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} /></label> : null}
      </div>
      <div className="mt-2 flex items-center gap-3">
        <div className="relative -mt-4 h-16 w-16 shrink-0 overflow-hidden rounded-full border-4 border-white bg-neutral-100">
          <Image src={url("avatar")} alt="Group profile" fill unoptimized className="object-cover" onError={(event) => { event.currentTarget.style.display = "none"; }} />
          <span className="flex h-full w-full items-center justify-center text-xl font-semibold text-neutral-500" aria-hidden="true">G</span>
        </div>
        {editable ? <label className="cursor-pointer rounded-md border border-neutral-300 px-3 py-2 text-xs font-semibold text-black hover:bg-neutral-50">{busy ? "Saving…" : "Change group photo"}<input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(event) => { void upload("avatar", event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} /></label> : null}
        {error ? <span className="text-xs text-red-700" role="alert">{error}</span> : null}
      </div>
    </div>
  );
}
