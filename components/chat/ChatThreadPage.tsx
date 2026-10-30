"use client";

import { useState } from "react";
import { ErrorDialog } from "@/components/ui/Modal";
import { ConversationPanel } from "./ConversationPanel";
import { ThreadView } from "./ThreadView";

export function ChatThreadPage({ conversationId, myUserId }: { conversationId: string; myUserId: string }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <div className="flex h-[calc(100dvh-8rem)] min-h-[32rem] gap-4">
        <div className="hidden w-80 shrink-0 overflow-y-auto lg:block">
          <ConversationPanel activeId={conversationId} compact onError={setError} />
        </div>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white">
          <ThreadView key={conversationId} conversationId={conversationId} myUserId={myUserId} onError={setError} />
        </div>
      </div>
      {error ? <ErrorDialog message={error} onClose={() => setError(null)} /> : null}
    </>
  );
}
