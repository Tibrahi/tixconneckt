import { ConnecktPage } from "@/components/conneckt/ConnecktPage";
import { requireUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { ROUTES } from "@/lib/routes";

export const instant = false;

export default async function ConnecktRoute() {
  const user = await requireUser();
  if (user.role === "provider") redirect(ROUTES.requests);
  return <ConnecktPage />;
}
