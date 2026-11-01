import { ProjectsPage } from "@/components/projects/ProjectsPage";
import { requireUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { ROUTES } from "@/lib/routes";

// This route loads protected, request-specific project data and is allowed to
// wait for the authenticated dashboard boundary.
export const instant = false;

export default async function ProjectsRoute() {
  const user = await requireUser();
  if (user.role === "provider") redirect(ROUTES.requests);
  return <ProjectsPage />;
}
