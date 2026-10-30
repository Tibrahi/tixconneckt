import { Suspense } from "react";
import { WorkspacePage } from "@/components/projects/WorkspacePage";
import { SkeletonList } from "@/components/ui/Feedback";

export const instant = false;

export default function ProjectRoute({ params }: { params: Promise<{ id: string }> }) {
  return <Suspense fallback={<SkeletonList rows={4} />}><ProjectContent params={params} /></Suspense>;
}

async function ProjectContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <WorkspacePage projectId={id} />;
}
