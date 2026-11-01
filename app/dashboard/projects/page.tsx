import { ProjectsPage } from "@/components/projects/ProjectsPage";
import { requireUser } from "@/lib/session";

// This route loads protected, request-specific project data and is allowed to
// wait for the authenticated dashboard boundary.
export const instant = false;

export default async function ProjectsRoute() {
  const user = await requireUser();
  return <ProjectsPage accountRole={user.role} accountCategory={user.category} />;
}
