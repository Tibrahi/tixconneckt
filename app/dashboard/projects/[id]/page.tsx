import { WorkspacePage } from "@/components/projects/WorkspacePage";

export const instant = false;

export default async function ProjectRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <WorkspacePage projectId={id} />;
}
