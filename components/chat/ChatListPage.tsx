"use client";

import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { ErrorDialog } from "@/components/ui/Modal";
import { ConversationPanel } from "./ConversationPanel";

export function ChatListPage() {
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <PageHeader
        title="Chat"
        description="Individual, group, provider, and project conversations stay here — always in sync."
      />
      <ConversationPanel onError={setError} />
      {error ? <ErrorDialog message={error} onClose={() => setError(null)} /> : null}
    </>
  );
}
