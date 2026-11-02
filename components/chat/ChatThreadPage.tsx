"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ErrorDialog } from "@/components/ui/Modal";
import { useContextNavigation } from "@/components/layout/ContextNavigation";
import { ROUTES } from "@/lib/routes";
import { ConversationPanel } from "./ConversationPanel";
import { ThreadView } from "./ThreadView";

export function ChatThreadPage({
  conversationId,
  myUserId,
  myUserName,
}: {
  conversationId: string;
  myUserId: string;
  myUserName: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const { setNavigation } = useContextNavigation();
  const showError = useCallback((message: string) => setError(message), []);
  const navigation = useMemo(
    () => ({
      title: "Conversations",
      backHref: ROUTES.chat,
      backLabel: "All chats",
      content: <ConversationPanel activeId={conversationId} compact onError={showError} />,
    }),
    [conversationId, showError],
  );

  useEffect(() => {
    setNavigation(navigation);
    return () => setNavigation(null);
  }, [navigation, setNavigation]);

  return (
    <>
      <div className="flex h-[calc(100dvh-7rem)] min-h-[28rem] flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white sm:h-[calc(100dvh-8rem)] sm:min-h-[32rem]">
          <ThreadView
            key={conversationId}
            conversationId={conversationId}
            myUserId={myUserId}
            myUserName={myUserName}
            onError={showError}
          />
      </div>
      {error ? <ErrorDialog message={error} onClose={() => setError(null)} /> : null}
    </>
  );
}
