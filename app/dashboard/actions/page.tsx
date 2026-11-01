import { ActionsPage } from "@/components/actions/ActionsPage";
import { requireUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { ROUTES } from "@/lib/routes";

export const instant = false;

export default async function ActionsRoute() {
  const user = await requireUser();
  if (user.role === "provider") redirect(ROUTES.requests);
  return <ActionsPage />;
}
