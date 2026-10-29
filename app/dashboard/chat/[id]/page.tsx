import { requireUser } from "@/lib/session";
import { ChatThreadPage } from "@/components/chat/ChatThreadPage";

export default async function ChatThreadRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  return <ChatThreadPage conversationId={id} myUserId={user.id} />;
}
