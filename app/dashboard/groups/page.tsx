import { GroupsPage } from "@/components/groups/GroupsPage";
import { requireUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { ROUTES } from "@/lib/routes";

export const instant = false;

export default async function GroupsRoute() {
  const user = await requireUser();
  if (user.role === "provider") redirect(ROUTES.requests);
  return <GroupsPage />;
}
