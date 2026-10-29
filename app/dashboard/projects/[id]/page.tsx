import { ProjectDetailPage } from "@/components/projects/ProjectDetailPage";

export const instant = false;

export default async function ProjectRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProjectDetailPage projectId={id} />;
}
