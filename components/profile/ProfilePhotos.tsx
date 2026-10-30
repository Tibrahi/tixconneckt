"use client";

import { useState } from "react";
import Image from "next/image";

export function ProfilePhotos({
  shortId,
  editable = false,
  onSaved,
}: {
  shortId: string;
  editable?: boolean;
  onSaved?: () => void;
}) {
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState<"avatar" | "cover" | null>(null);
  const [error, setError] = useState("");
  const [failed, setFailed] = useState({ avatar: false, cover: false });
  const url = (kind: "avatar" | "cover") => `/api/profile/media?shortId=${encodeURIComponent(shortId)}&kind=${kind}&v=${revision}`;

  async function upload(kind: "avatar" | "cover", file?: File) {
    if (!file) return;
    setBusy(kind);
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
      const compressed = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not prepare this image.")), "image/webp", 0.82),
      );
      if (compressed.size > 2 * 1024 * 1024) throw new Error("Choose a smaller image (under 2 MB after compression).");
      const form = new FormData();
      form.set("kind", kind);
      form.set("file", compressed, `${kind}.webp`);
      const response = await fetch("/api/profile/media", { method: "PUT", body: form });
      const result = await response.json() as { ok: boolean; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error ?? "Could not save this image.");
      setFailed((current) => ({ ...current, [kind]: false }));
      setRevision((current) => current + 1);
      onSaved?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save this image.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="mb-5 overflow-hidden rounded-xl border border-neutral-200 bg-white" aria-label="Profile photos">
      <div className="relative h-32 bg-gradient-to-r from-brand-100 via-sky-50 to-neutral-100 sm:h-44">
        {!failed.cover ? <Image src={url("cover")} alt="Profile cover" fill unoptimized className="object-cover" onError={() => setFailed((current) => ({ ...current, cover: true }))} /> : null}
        {editable ? <label className="absolute right-3 top-3 cursor-pointer rounded-md bg-white/95 px-3 py-2 text-xs font-semibold text-black shadow-sm hover:bg-white">{busy === "cover" ? "Saving…" : "Change cover"}<input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy !== null} onChange={(event) => { void upload("cover", event.target.files?.[0]); event.currentTarget.value = ""; }} /></label> : null}
      </div>
      <div className="flex min-h-20 items-end gap-3 px-4 pb-3 sm:px-5">
        <div className="relative -mt-10 h-20 w-20 shrink-0 overflow-hidden rounded-full border-4 border-white bg-neutral-100 shadow-sm sm:-mt-12 sm:h-24 sm:w-24">
          {!failed.avatar ? <Image src={url("avatar")} alt="Profile photo" fill unoptimized className="object-cover" onError={() => setFailed((current) => ({ ...current, avatar: true }))} /> : <span className="flex h-full w-full items-center justify-center text-2xl font-semibold text-neutral-500" aria-hidden="true">{shortId.slice(0, 1)}</span>}
        </div>
        {editable ? <label className="mb-1 cursor-pointer rounded-md border border-neutral-300 bg-white px-3 py-2 text-xs font-semibold text-black hover:bg-neutral-50">{busy === "avatar" ? "Saving…" : "Change photo"}<input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy !== null} onChange={(event) => { void upload("avatar", event.target.files?.[0]); event.currentTarget.value = ""; }} /></label> : null}
      </div>
      {error ? <p className="px-4 pb-3 text-sm text-red-700" role="alert">{error}</p> : null}
    </section>
  );
}
