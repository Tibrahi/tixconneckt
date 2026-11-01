import { OrganizationsPage } from "@/components/organizations/OrganizationsPage";
import { requireUser } from "@/lib/session";

export const instant = false;

export default async function OrganizationsRoute() {
  const user = await requireUser();
  return <OrganizationsPage accountCategory={user.category} />;
}
