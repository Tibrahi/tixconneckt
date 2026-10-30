import { ProjectsPage } from "@/components/projects/ProjectsPage";

// This route loads protected, request-specific project data and is allowed to
// wait for the authenticated dashboard boundary.
export const instant = false;

export default function ProjectsRoute() {
  return <ProjectsPage />;
}
