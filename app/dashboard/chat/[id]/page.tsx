import { Suspense } from "react";
import { requireUser } from "@/lib/session";
import { ChatThreadPage } from "@/components/chat/ChatThreadPage";
import { SkeletonList } from "@/components/ui/Feedback";

export default function ChatThreadRoute({ params }: { params: Promise<{ id: string }> }) {
  return <Suspense fallback={<SkeletonList rows={4} />}><ChatThreadContent params={params} /></Suspense>;
}

async function ChatThreadContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  return <ChatThreadPage conversationId={id} myUserId={user.id} />;
}
