"use client";

import { useEffect, useRef, useState } from "react";
import { EMOJI_PALETTE } from "./MessageBubble";
import { readApi, type ChatMessage } from "./types";

function uploadWithProgress(file: File, onProgress: (pct: number) => void): Promise<{ documentId: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/documents");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      try {
        const body = JSON.parse(xhr.responseText) as { ok: boolean; data?: { documentId: string }; error?: string };
        if (xhr.status >= 200 && xhr.status < 300 && body.ok && body.data) resolve(body.data);
        else reject(new Error(body.error ?? "Upload failed."));
      } catch {
        reject(new Error("Upload failed."));
      }
    };
    xhr.onerror = () => reject(new Error("Your connection was interrupted during upload."));
    const form = new FormData();
    form.append("file", file);
    form.append("module", "chat");
    xhr.send(form);
  });
}

/**
 * Message composer: multiline input, emoji, file attachments with progress,
 * voice notes, reply context, and per-conversation draft preservation.
 * Enter sends, Shift+Enter adds a line, Escape clears pickers and replies.
 */
export function Composer({
  conversationId,
  replyTo,
  onClearReply,
  onTyping,
  onSent,
  onError,
  seed,
}: {
  conversationId: string;
  replyTo: ChatMessage | null;
  onClearReply: () => void;
  onTyping: () => void;
  onSent: () => void;
  onError: (m: string) => void;
  seed: { text: string; nonce: number } | null;
}) {
  const draftKey = `chat:draft:${conversationId}`;
  const [text, setText] = useState(() => {
    try {
      return localStorage.getItem(draftKey) ?? "";
    } catch {
      return "";
    }
  });
  const [sending, setSending] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [attachment, setAttachment] = useState<{ documentId: string; name: string } | null>(null);
  const [recording, setRecording] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    try {
      if (text) localStorage.setItem(draftKey, text);
      else localStorage.removeItem(draftKey);
    } catch {
      /* drafts are best-effort */
    }
  }, [text, draftKey]);

  useEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    area.style.height = "auto";
    area.style.height = `${Math.min(area.scrollHeight, 160)}px`;
  }, [text]);

  const lastSeed = useRef(0);
  useEffect(() => {
    if (seed && seed.nonce !== lastSeed.current) {
      lastSeed.current = seed.nonce;
      setText((t) => (t ? `${t}\n${seed.text}` : seed.text));
      areaRef.current?.focus();
    }
  }, [seed]);

  async function send() {
    const body = text.trim();
    if ((!body && !attachment) || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/chat/${encodeURIComponent(conversationId)}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body,
          clientMessageId: crypto.randomUUID(),
          replyToId: replyTo?.id,
          attachmentId: attachment?.documentId,
        }),
      });
      await readApi(res);
      setText("");
      setAttachment(null);
      onClearReply();
      try {
        localStorage.removeItem(draftKey);
      } catch {
        /* ignore */
      }
      onSent();
    } catch (error) {
      // Keep the text so a retry loses nothing.
      onError(error instanceof Error ? error.message : "We couldn't send this message. Retry to try again.");
    } finally {
      setSending(false);
    }
  }

  async function attach(file: File) {
    setUploadPct(0);
    try {
      const data = await uploadWithProgress(file, setUploadPct);
      setAttachment({ documentId: data.documentId, name: file.name });
    } catch (error) {
      onError(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setUploadPct(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function toggleRecording() {
    if (recording) {
      mediaRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        setRecording(false);
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        if (blob.size === 0) return;
        await attach(new File([blob], `voice-note-${Date.now()}.webm`, { type: "audio/webm" }));
      };
      mediaRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      onError("Microphone access was denied. Attach a file instead.");
    }
  }

  return (
    <div className="border-t border-neutral-200 bg-white p-3">
      {replyTo ? (
        <div className="mb-2 flex items-center justify-between gap-2 rounded-md bg-neutral-100 px-3 py-1.5 text-xs">
          <p className="truncate text-neutral-600">
            <span className="font-medium text-black">Replying to {replyTo.senderName ?? "Member"}: </span>
            {replyTo.body.slice(0, 120)}
          </p>
          <button type="button" onClick={onClearReply} aria-label="Cancel reply" className="shrink-0 font-bold text-neutral-600 hover:text-black">
            ✕
          </button>
        </div>
      ) : null}
      {attachment ? (
        <div className="mb-2 flex items-center justify-between gap-2 rounded-md bg-brand-50 px-3 py-1.5 text-xs">
          <p className="truncate text-black">Attached: {attachment.name}</p>
          <button type="button" onClick={() => setAttachment(null)} className="shrink-0 font-medium text-brand-700 hover:underline">
            Remove
          </button>
        </div>
      ) : null}
      {uploadPct !== null ? (
        <div className="mb-2">
          <div className="h-1.5 w-full rounded-full bg-neutral-200" role="progressbar" aria-valuenow={uploadPct} aria-valuemin={0} aria-valuemax={100} aria-label="Upload progress">
            <div className="h-1.5 rounded-full bg-brand-600" style={{ width: `${uploadPct}%` }} />
          </div>
          <p className="mt-0.5 text-xs text-neutral-600">Uploading… {uploadPct}%</p>
        </div>
      ) : null}
      <div className="flex items-end gap-2">
        <div className="relative">
          <button
            type="button"
            aria-label="Insert emoji"
            aria-expanded={emojiOpen}
            onClick={() => setEmojiOpen(!emojiOpen)}
            className="rounded-md border border-neutral-300 px-2 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
          >
            Emoji
          </button>
          {emojiOpen ? (
            <div className="absolute bottom-full left-0 z-20 mb-1 rounded-md border border-neutral-200 bg-white p-2 shadow-lg">
              <div className="grid grid-cols-4 gap-1">
                {EMOJI_PALETTE.map((e) => (
                  <button
                    key={e}
                    type="button"
                    aria-label={`Insert ${e}`}
                    onClick={() => {
                      setText((t) => `${t}${e}`);
                      setEmojiOpen(false);
                      areaRef.current?.focus();
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
        <button
          type="button"
          aria-label="Attach a file"
          onClick={() => fileRef.current?.click()}
          className="rounded-md border border-neutral-300 px-2 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
        >
          Attach
        </button>
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          aria-hidden
          tabIndex={-1}
          accept="image/*,application/pdf,text/plain,audio/*,video/mp4,video/webm"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) attach(file);
          }}
        />
        <button
          type="button"
          aria-label={recording ? "Stop recording" : "Record a voice note"}
          onClick={toggleRecording}
          className={`rounded-md border px-2 py-2 text-xs font-medium ${recording ? "border-red-300 bg-red-100 text-red-700" : "border-neutral-300 text-neutral-700 hover:bg-neutral-100"}`}
        >
          {recording ? "Stop" : "Voice"}
        </button>
        <textarea
          ref={areaRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            onTyping();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            } else if (e.key === "Escape") {
              setEmojiOpen(false);
              if (replyTo) onClearReply();
            }
          }}
          rows={1}
          maxLength={8000}
          placeholder={recording ? "Recording… tap stop, then send." : "Write a message… (Enter to send, Shift+Enter for a new line)"}
          aria-label="Message text"
          className="max-h-40 min-h-10 flex-1 resize-none rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-black"
        />
        <button
          type="button"
          onClick={send}
          disabled={sending || (!text.trim() && !attachment)}
          className="shrink-0 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {sending ? "Sending…" : "Send"}
        </button>
      </div>
    </div>
  );
}
