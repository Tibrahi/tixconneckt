import { Suspense } from "react";
import { connection } from "next/server";
import { requireUser } from "@/lib/session";
import { ChatThreadPage } from "@/components/chat/ChatThreadPage";
import { SkeletonList } from "@/components/ui/Feedback";

export const instant = false;

export default function ChatThreadRoute({ params }: { params: Promise<{ id: string }> }) {
  return <Suspense fallback={<SkeletonList rows={4} />}><ChatThreadContent params={params} /></Suspense>;
}

async function ChatThreadContent({ params }: { params: Promise<{ id: string }> }) {
  // Dynamic per request: this Suspense unit prerenders independently, so it
  // needs its own marker before touching the session (same as the layout).
  await connection();
  const { id } = await params;
  const user = await requireUser();
  return <ChatThreadPage conversationId={id} myUserId={user.id} myUserName={user.name} />;
}
