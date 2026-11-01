"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { extensionForMime, useVoiceRecorder } from "@/hooks/use-voice-recorder";
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
 * voice notes (record, pause, preview, then send), reply context, and
 * per-conversation draft preservation.
 * Enter sends, Shift+Enter adds a line, Escape clears pickers and replies.
 */
export function Composer({
  conversationId,
  replyTo,
  onClearReply,
  onTyping,
  onSent,
  onSending,
  onSendFailed,
  onError,
  seed,
}: {
  conversationId: string;
  replyTo: ChatMessage | null;
  onClearReply: () => void;
  onTyping: () => void;
  onSent: () => void;
  onSending: (draft: { clientMessageId: string; body: string; replyTo: ChatMessage | null }) => void;
  onSendFailed: (clientMessageId: string) => void;
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
  const fileRef = useRef<HTMLInputElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const voice = useVoiceRecorder();
  const voiceBusy = voice.state === "recording" || voice.state === "paused";

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
    // A previewed voice note uploads first, then sends with the message.
    let voiceAttachment = attachment;
    if (voice.state === "preview" && voice.audioBlob) {
      const ext = extensionForMime(voice.audioMime);
      try {
        const data = await uploadWithProgress(
          new File([voice.audioBlob], `voice-note-${Date.now()}.${ext}`, { type: voice.audioBlob.type }),
          setUploadPct,
        );
        voiceAttachment = { documentId: data.documentId, name: `voice-note.${ext}` };
      } catch (error) {
        onError(error instanceof Error ? error.message : "Voice note upload failed. Retry to try again.");
        setUploadPct(null);
        return;
      } finally {
        setUploadPct(null);
      }
    }
    if ((!body && !voiceAttachment) || sending) return;
    const clientMessageId = crypto.randomUUID();
    setSending(true);
    onSending({ clientMessageId, body, replyTo });
    try {
      const res = await fetch(`/api/chat/${encodeURIComponent(conversationId)}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body,
          clientMessageId,
          replyToId: replyTo?.id,
          attachmentId: voiceAttachment?.documentId,
        }),
      });
      await readApi(res);
      setText("");
      setAttachment(null);
      voice.cancel();
      onClearReply();
      try {
        localStorage.removeItem(draftKey);
      } catch {
        /* ignore */
      }
      onSent();
    } catch (error) {
      // Drop the optimistic bubble but keep the text so a retry loses nothing.
      onSendFailed(clientMessageId);
      onError(error instanceof Error ? error.message : "We couldn't send this message. Retry to try again.");
    } finally {
      setSending(false);
    }
  }

  async function attach(file: File) {
    // One attachment per message: a file replaces any voice preview.
    if (voice.state === "preview") voice.cancel();
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

  function toggleRecording() {
    if (voice.state === "recording" || voice.state === "paused") {
      voice.stop();
      return;
    }
    if (voice.state === "preview") {
      voice.cancel();
      return;
    }
    // One attachment per message: recording replaces any attached file.
    setAttachment(null);
    void voice.start();
  }

  useEffect(() => {
    if (voice.error) onError(voice.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice.error]);

  return (
    <div className="border-t border-neutral-200 bg-white p-3">
      {replyTo ? (
        <div className="mb-2 flex items-center justify-between gap-2 rounded-md bg-neutral-100 px-3 py-1.5 text-xs">
          <p className="truncate text-neutral-600">
            <span className="font-medium text-black">Replying to {replyTo.senderName ?? "Member"}: </span>
            {replyTo.body.slice(0, 120)}
          </p>
          <button type="button" onClick={onClearReply} aria-label="Cancel reply" title="Cancel reply" className="shrink-0 rounded p-1 text-neutral-600 hover:bg-neutral-200 hover:text-black">
            <Icon name="xmark" />
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
      {voiceBusy ? (
        <div className="mb-2 flex items-center gap-2 rounded-md bg-blue-50 px-3 py-1.5 text-xs" role="status">
          <span aria-hidden="true" className="h-2 w-2 animate-pulse rounded-full bg-blue-600" />
          <span className="font-medium text-blue-700">
            {voice.state === "paused" ? "Paused" : "Recording"} · {voice.durationLabel}
          </span>
          {voice.state === "recording" ? (
            <button type="button" onClick={voice.pause} aria-label="Pause recording" className="font-medium text-brand-700 hover:underline">
              Pause
            </button>
          ) : (
            <button type="button" onClick={voice.resume} aria-label="Resume recording" className="font-medium text-brand-700 hover:underline">
              Resume
            </button>
          )}
          <button type="button" onClick={voice.stop} aria-label="Finish recording" className="font-medium text-brand-700 hover:underline">
            Finish
          </button>
          <button type="button" onClick={voice.cancel} aria-label="Discard recording" className="font-medium text-neutral-600 hover:underline">
            Discard
          </button>
        </div>
      ) : null}
      {voice.state === "preview" && voice.audioUrl ? (
        <div className="mb-2 flex items-center gap-2 rounded-md bg-brand-50 px-3 py-1.5 text-xs">
          <audio controls src={voice.audioUrl} className="h-8 min-w-0 flex-1" aria-label="Voice note preview" />
          <span className="shrink-0 font-mono text-neutral-600">{voice.durationLabel}</span>
          <button type="button" onClick={voice.cancel} aria-label="Delete voice note" className="shrink-0 font-medium text-brand-700 hover:underline">
            Delete
          </button>
        </div>
      ) : null}
      <div className="flex items-end gap-1.5">
        <div className="relative">
          <button
            type="button"
            aria-label="Insert emoji"
            title="Insert emoji"
            aria-expanded={emojiOpen}
            onClick={() => setEmojiOpen(!emojiOpen)}
            className="rounded-md border border-neutral-300 px-2.5 py-2 text-neutral-700 hover:bg-neutral-100"
          >
            <Icon name="face-smile" />
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
          title="Attach a file"
          onClick={() => fileRef.current?.click()}
          className="rounded-md border border-neutral-300 px-2.5 py-2 text-neutral-700 hover:bg-neutral-100"
        >
          <Icon name="paperclip" />
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
          aria-label={voiceBusy ? "Stop recording" : voice.state === "preview" ? "Discard voice note" : "Record a voice note"}
          title={voiceBusy ? "Stop recording" : voice.state === "preview" ? "Discard voice note" : "Record a voice note"}
          onClick={toggleRecording}
          className={`rounded-md border px-2.5 py-2 ${voiceBusy ? "border-blue-300 bg-blue-100 text-blue-700" : "border-neutral-300 text-neutral-700 hover:bg-neutral-100"}`}
        >
          <Icon name={voiceBusy ? "microphone-slash" : "microphone"} />
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
          placeholder={voiceBusy ? "Recording… tap stop, then send." : "Write a message… (Enter to send, Shift+Enter for a new line)"}
          aria-label="Message text"
          className="max-h-40 min-h-10 flex-1 resize-none rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-black"
        />
        <button
          type="button"
          onClick={send}
          disabled={sending || (!text.trim() && !attachment && voice.state !== "preview")}
          aria-label={sending ? "Sending message" : "Send message"}
          title="Send (Enter)"
          className="shrink-0 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          <Icon name={sending ? "spinner" : "send"} spin={sending} />
        </button>
      </div>
    </div>
  );
}
