"use client";

import { useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/Button";
import { SelectField, TextAreaField } from "@/components/ui/Fields";

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
  const [generating, setGenerating] = useState<"avatar" | "cover" | null>(null);
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
      // Bounded upload so "Saving…" always clears, even on a stalled network.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30000);
      let response: Response;
      try {
        response = await fetch("/api/profile/media", { method: "PUT", body: form, signal: controller.signal });
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === "AbortError") {
          throw new Error("The upload took too long. Please try again.");
        }
        throw cause;
      } finally {
        clearTimeout(timer);
      }
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
        {editable ? (
          <span className="absolute right-3 top-3 flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              icon="wand-magic-sparkles"
              disabled={busy !== null}
              onClick={() => setGenerating(generating === "cover" ? null : "cover")}
            >
              {generating === "cover" ? "Close" : "Generate cover"}
            </Button>
            <label className="cursor-pointer rounded-md bg-white/95 px-3 py-2 text-xs font-semibold text-black shadow-sm hover:bg-white">{busy === "cover" ? "Saving…" : "Change cover"}<input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy !== null} onChange={(event) => { void upload("cover", event.target.files?.[0]); event.currentTarget.value = ""; }} /></label>
          </span>
        ) : null}
      </div>
      <div className="flex min-h-20 items-end gap-3 px-4 pb-3 sm:px-5">
        <div className="relative -mt-10 h-20 w-20 shrink-0 overflow-hidden rounded-full border-4 border-white bg-neutral-100 shadow-sm sm:-mt-12 sm:h-24 sm:w-24">
          {!failed.avatar ? <Image src={url("avatar")} alt="Profile photo" fill unoptimized className="object-cover" onError={() => setFailed((current) => ({ ...current, avatar: true }))} /> : <span className="flex h-full w-full items-center justify-center text-2xl font-semibold text-neutral-500" aria-hidden="true">{shortId.slice(0, 1)}</span>}
        </div>
        {editable ? <label className="mb-1 cursor-pointer rounded-md border border-neutral-300 bg-white px-3 py-2 text-xs font-semibold text-black hover:bg-neutral-50">{busy === "avatar" ? "Saving…" : "Change photo"}<input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy !== null} onChange={(event) => { void upload("avatar", event.target.files?.[0]); event.currentTarget.value = ""; }} /></label> : null}
        {editable ? (
          <Button
            size="sm"
            variant="secondary"
            icon="wand-magic-sparkles"
            disabled={busy !== null}
            onClick={() => setGenerating(generating === "avatar" ? null : "avatar")}
          >
            {generating === "avatar" ? "Close generator" : "Generate photo"}
          </Button>
        ) : null}
      </div>
      {editable && generating ? (
        <div className="px-4 pb-3 sm:px-5">
          <GeneratePanel
            kind={generating}
            disabled={busy !== null}
            onApply={async (file) => {
              await upload(generating, file);
              setGenerating(null);
            }}
            onError={setError}
          />
        </div>
      ) : null}
      {error ? <p className="px-4 pb-3 text-sm text-blue-700" role="alert">{error}</p> : null}
    </section>
  );
}

/** Prompt → preview → apply. Previews are never saved until applied. */
function GeneratePanel({
  kind,
  disabled,
  onApply,
  onError,
}: {
  kind: "avatar" | "cover";
  disabled: boolean;
  onApply: (file: File) => Promise<void>;
  onError: (m: string) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState("natural");
  const [preview, setPreview] = useState<string | null>(null);
  const [previewMime, setPreviewMime] = useState("image/png");
  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState(false);
  const label = kind === "avatar" ? "profile picture" : "cover photo";

  async function generate() {
    if (prompt.trim().length < 10) {
      onError("Describe the image in at least a few words.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/profile/media/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, prompt: prompt.trim(), style }),
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { preview?: string; mimeType?: string };
        error?: string;
      };
      if (!res.ok || !body.ok || !body.data?.preview) {
        throw new Error(body.error ?? "Image generation failed. Please try again.");
      }
      setPreview(body.data.preview);
      setPreviewMime(body.data.mimeType === "image/jpeg" ? "image/jpeg" : "image/png");
    } catch (error) {
      onError(error instanceof Error ? error.message : "Image generation failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (!preview) return;
    setApplying(true);
    try {
      const blob = await (await fetch(preview)).blob();
      const ext = previewMime === "image/jpeg" ? "jpg" : "png";
      await onApply(new File([blob], `ai-${kind}-${Date.now()}.${ext}`, { type: previewMime }));
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not apply this image.");
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-dashed border-neutral-300 p-3">
      <TextAreaField
        label={`Describe the ${label}`}
        value={prompt}
        rows={3}
        maxLength={2000}
        disabled={disabled || busy}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder={kind === "avatar" ? "A friendly portrait, city skyline behind…" : "A wide mountain sunrise, calm tones…"}
      />
      <SelectField
        label="Style"
        value={style}
        disabled={disabled || busy}
        onChange={(e) => setStyle(e.target.value)}
        options={[
          { value: "natural", label: "Natural" },
          { value: "photographic", label: "Photographic" },
          { value: "illustration", label: "Illustration" },
          { value: "minimal", label: "Minimal" },
        ]}
      />
      {preview ? (
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt={`Generated ${label} preview`}
            className={kind === "avatar" ? "h-32 w-32 rounded-full object-cover" : "h-32 w-full rounded-md object-cover"}
          />
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" icon="wand-magic-sparkles" loading={busy} disabled={disabled} onClick={() => void generate()}>
          {preview ? "Regenerate" : "Generate"}
        </Button>
        {preview ? (
          <Button size="sm" variant="secondary" loading={applying} disabled={disabled} onClick={() => void apply()}>
            Use this image
          </Button>
        ) : null}
      </div>
    </div>
  );
}
