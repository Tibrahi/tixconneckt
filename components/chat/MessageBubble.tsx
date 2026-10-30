"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ROUTES } from "@/lib/routes";
import { DynamicValue } from "@/components/dynamic/DynamicValue";
import { formatBytes, readApi, type ChatAttachment, type ChatMessage } from "./types";

export const EMOJI_PALETTE = ["👍", "❤️", "😂", "🎉", "😮", "😢", "🙏", "👏"];

/** Render URLs as safe links without innerHTML. */
function Linkified({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s<>"']+)/g);
  return (
    <>
      {parts.map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-brand-700 underline break-all">
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

function AttachmentCard({
  attachment,
  onAnalyze,
  onTranscribe,
  analyzing,
  transcript,
  onError,
}: {
  attachment: ChatAttachment;
  onAnalyze: () => void;
  onTranscribe: () => void;
  analyzing: boolean;
  transcript: string | null;
  onError: (m: string) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const mime = attachment.mimeType.toLowerCase();
  const isImage = mime.startsWith("image/");
  const isAudio = mime.startsWith("audio/");
  const isVideo = mime.startsWith("video/");
  const isPdf = mime === "application/pdf";

  async function loadUrl() {
    if (url) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/documents/${encodeURIComponent(attachment.id)}/url`);
      const data = await readApi<{ url: string }>(res);
      setUrl(data.url);
    } catch (error) {
      onError(error instanceof Error ? error.message : "This file is unavailable right now.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-2 overflow-hidden rounded-md border border-neutral-200 bg-white">
      <div className="flex items-center justify-between gap-2 p-2 text-xs">
        <span className="min-w-0 truncate font-medium text-black" title={attachment.filename}>
          {attachment.filename}
        </span>
        <span className="shrink-0 font-mono text-neutral-500">{formatBytes(attachment.sizeBytes)}</span>
      </div>
      {url && isImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={attachment.filename} className="max-h-64 w-full object-contain bg-neutral-100" />
      ) : null}
      {url && isAudio ? <audio src={url} controls className="w-full" preload="metadata" /> : null}
      {url && isVideo ? <video src={url} controls className="max-h-64 w-full bg-black" preload="metadata" /> : null}
      <div className="flex flex-wrap gap-2 p-2">
        {!url ? (
          <button type="button" disabled={loading} onClick={loadUrl} className="text-xs font-medium text-brand-700 hover:underline disabled:opacity-60">
            {loading ? "Loading…" : isImage || isAudio || isVideo ? "Show preview" : "Get download link"}
          </button>
        ) : (
          <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-brand-700 hover:underline">
            {isPdf ? "Open PDF" : "Download"}
          </a>
        )}
        {(isPdf || isImage || attachment.mimeType.startsWith("text/")) && url ? (
          <button type="button" disabled={analyzing} onClick={onAnalyze} className="text-xs font-medium text-brand-700 hover:underline disabled:opacity-60">
            {analyzing ? "Analyzing…" : "Analyze with AI"}
          </button>
        ) : null}
        {isAudio ? (
          <button type="button" onClick={onTranscribe} className="text-xs font-medium text-brand-700 hover:underline">
            Transcribe
          </button>
        ) : null}
      </div>
      {transcript ? (
        <p className="border-t border-neutral-200 bg-neutral-50 p-2 text-xs whitespace-pre-wrap text-black">
          {transcript}
        </p>
      ) : null}
    </div>
  );
}

function ReferenceCard({ reference }: { reference: { type: string; id: string; title: string; subtitle?: string } }) {
  const href =
    reference.type === "project"
      ? ROUTES.projectById(reference.id)
      : reference.type === "request"
        ? ROUTES.requestById(reference.id)
        : reference.type === "profile" && reference.subtitle
          ? ROUTES.profileById(reference.subtitle)
          : null;
  const label = reference.type === "project" ? "Project" : reference.type === "request" ? "Request" : "Profile";
  return (
    <div className="mt-2 rounded-md border border-brand-200 bg-brand-50 p-2 text-xs">
      <p className="font-semibold tracking-wide text-brand-800 uppercase">{label}</p>
      {href ? (
        <Link href={href} className="font-medium text-black hover:underline">
          {reference.title}
        </Link>
      ) : (
        <p className="font-medium text-black">{reference.title}</p>
      )}
      {reference.subtitle && reference.type !== "profile" ? (
        <p className="text-neutral-600">{reference.subtitle}</p>
      ) : null}
    </div>
  );
}

/**
 * One message: bubbles, replies, reactions, attachments, references,
 * read state, and the contextual action menu. System messages and
 * tombstones render plainly with no actions.
 */
export function MessageBubble({
  message,
  mine,
  canModerate,
  onReply,
  onReact,
  onEdit,
  onDelete,
  onForward,
  onShareLink,
  onJump,
  onAnalyze,
  onTranscribe,
  analyzing,
  transcript,
  onError,
}: {
  message: ChatMessage;
  mine: boolean;
  canModerate: boolean;
  onReply: (m: ChatMessage) => void;
  onReact: (m: ChatMessage, emoji: string) => void;
  onEdit: (m: ChatMessage) => void;
  onDelete: (m: ChatMessage, mode: "me" | "everyone") => void;
  onForward: (m: ChatMessage) => void;
  onShareLink: (m: ChatMessage) => void;
  onJump: (messageId: string) => void;
  onAnalyze: (m: ChatMessage) => void;
  onTranscribe: (m: ChatMessage) => void;
  analyzing: boolean;
  transcript: string | null;
  onError: (m: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(message.body);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen && !pickerOpen) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setPickerOpen(false);
      }
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        setPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [menuOpen, pickerOpen]);

  if (message.kind === "system") {
    return (
      <li className="flex justify-center">
        <p className="rounded-full bg-neutral-100 px-3 py-1 text-center text-xs text-neutral-600">{message.body}</p>
      </li>
    );
  }

  const forwarded = (message.metadata?.forwardedFrom as { conversationId?: string } | undefined)?.conversationId;
  const reference = message.metadata?.reference as { type: string; id: string; title: string; subtitle?: string } | undefined;
  const analysis = message.metadata?.analysis as Record<string, unknown> | undefined;
  const canEdit = mine && message.kind === "user" && !message.deleted;
  const canDeleteEveryone = !message.deleted && (mine || canModerate);
  const item = "block w-full px-3 py-1.5 text-left text-sm text-black hover:bg-neutral-100 disabled:opacity-50";

  return (
    <li id={`msg-${message.id}`} className={`group flex scroll-mt-24 ${mine ? "justify-end" : "justify-start"}`}>
      <div className={`relative max-w-[85%] rounded-lg border px-3 py-2 sm:max-w-[75%] ${mine ? "border-brand-200 bg-brand-50" : "border-neutral-200 bg-white"}`}>
        {!mine && message.senderName ? (
          <p className="text-xs font-medium text-neutral-600">
            {message.senderName}
            {message.senderShortId ? <span className="font-mono"> · {message.senderShortId}</span> : null}
          </p>
        ) : null}
        {forwarded ? <p className="text-[11px] font-medium text-neutral-500 italic">Forwarded</p> : null}
        {message.deleted ? (
          <p className="text-sm text-neutral-500 italic">{message.body}</p>
        ) : editing ? (
          <div className="mt-1 flex flex-col gap-2">
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              rows={3}
              maxLength={8000}
              className="w-full rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm text-black"
            />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={!editText.trim()}
                onClick={() => {
                  setEditing(false);
                  onEdit({ ...message, body: editText.trim() });
                }}
                className="rounded-md bg-brand-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-60"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setEditText(message.body);
                }}
                className="rounded-md border border-neutral-300 px-3 py-1 text-xs"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            {message.reply ? (
              <button
                type="button"
                onClick={() => onJump(message.reply!.id)}
                title="Jump to original message"
                className="mb-1 block w-full truncate rounded border-l-2 border-brand-400 bg-white/60 px-2 py-1 text-left text-xs text-neutral-600 hover:bg-white"
              >
                <span className="font-medium text-black">{message.reply.senderName ?? "Member"}: </span>
                {message.reply.body}
              </button>
            ) : null}
            {message.body ? (
              <p className="whitespace-pre-wrap text-sm break-words text-black">
                <Linkified text={message.body} />
              </p>
            ) : null}
            {message.attachment ? (
              <AttachmentCard
                attachment={message.attachment}
                onAnalyze={() => onAnalyze(message)}
                onTranscribe={() => onTranscribe(message)}
                analyzing={analyzing}
                transcript={transcript}
                onError={onError}
              />
            ) : null}
            {reference ? <ReferenceCard reference={reference} /> : null}
            {analysis ? (
              <div className="mt-2 rounded-md border border-neutral-200 bg-white p-2">
                <p className="mb-1 text-[11px] font-semibold tracking-wide text-neutral-600 uppercase">
                  Shared analysis
                </p>
                <DynamicValue doc={analysis} />
              </div>
            ) : null}
          </>
        )}
        <p className="mt-1 flex flex-wrap items-center gap-x-2 font-mono text-[11px] text-neutral-500">
          <span>{new Date(message.createdAt).toLocaleString("en-US")}</span>
          {message.editedAt ? <span>· edited</span> : null}
          {message.read === true ? <span>· Read</span> : null}
          {message.read === false ? <span>· Sent</span> : null}
          {typeof message.readCount === "number" ? <span>· Seen by {message.readCount}</span> : null}
        </p>
        {message.reactions.length > 0 ? (
          <div className="mt-1 flex flex-wrap gap-1">
            {message.reactions.map((r) => (
              <button
                key={r.emoji}
                type="button"
                title={r.names.join(", ")}
                onClick={() => onReact(message, r.emoji)}
                className={`rounded-full border px-2 py-0.5 text-xs ${r.mine ? "border-brand-600 bg-brand-50" : "border-neutral-200 bg-white"}`}
              >
                {r.emoji} {r.count}
              </button>
            ))}
          </div>
        ) : null}

        {!message.deleted ? (
          <div ref={menuRef} className="absolute -top-3 right-2">
            <button
              type="button"
              aria-label="Message actions"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(!menuOpen)}
              className="rounded-full border border-neutral-300 bg-white px-2 py-0.5 text-xs text-neutral-600 shadow-sm hover:text-black focus:opacity-100 sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100"
            >
              •••
            </button>
            {menuOpen ? (
              <div className="absolute top-full right-0 z-20 w-44 rounded-md border border-neutral-200 bg-white py-1 shadow-lg">
                <button type="button" className={item} onClick={() => { setMenuOpen(false); onReply(message); }}>
                  Reply
                </button>
                <button type="button" className={item} onClick={() => { setMenuOpen(false); setPickerOpen(true); }}>
                  React
                </button>
                <button type="button" className={item} onClick={() => { setMenuOpen(false); onShareLink(message); }}>
                  Share link
                </button>
                <button
                  type="button"
                  className={item}
                  onClick={() => {
                    setMenuOpen(false);
                    navigator.clipboard?.writeText(message.body).catch(() => onError("Copying failed in this browser."));
                  }}
                >
                  Copy text
                </button>
                {canEdit ? (
                  <button type="button" className={item} onClick={() => { setMenuOpen(false); setEditing(true); }}>
                    Edit
                  </button>
                ) : null}
                <button type="button" className={item} onClick={() => { setMenuOpen(false); onForward(message); }}>
                  Forward
                </button>
                <button
                  type="button"
                  className={item}
                  onClick={() => {
                    setMenuOpen(false);
                    onDelete(message, "me");
                  }}
                >
                  Delete for me
                </button>
                {canDeleteEveryone ? (
                  <button
                    type="button"
                    className={`${item} text-red-700`}
                    onClick={() => {
                      setMenuOpen(false);
                      onDelete(message, "everyone");
                    }}
                  >
                    Delete for everyone
                  </button>
                ) : null}
              </div>
            ) : null}
            {pickerOpen ? (
              <div className="absolute top-full right-0 z-20 rounded-md border border-neutral-200 bg-white p-2 shadow-lg">
                <div className="grid grid-cols-4 gap-1">
                  {EMOJI_PALETTE.map((e) => (
                    <button
                      key={e}
                      type="button"
                      aria-label={`React with ${e}`}
                      onClick={() => {
                        setPickerOpen(false);
                        onReact(message, e);
                      }}
                      className="rounded px-1 py-0.5 text-lg hover:bg-neutral-100"
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}
