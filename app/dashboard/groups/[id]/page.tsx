import { Suspense } from "react";
import { GroupDetailPage } from "@/components/groups/GroupDetailPage";
import { SkeletonList } from "@/components/ui/Feedback";

export const instant = false;

export default function GroupRoute({ params }: { params: Promise<{ id: string }> }) {
  return <Suspense fallback={<SkeletonList rows={4} />}><GroupContent params={params} /></Suspense>;
}

async function GroupContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <GroupDetailPage groupId={id} />;
}
