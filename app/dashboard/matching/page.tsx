import { MatchingPage } from "@/components/matching/MatchingPage";
import { requireUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { ROUTES } from "@/lib/routes";

export const instant = false;

export default async function MatchingRoute() {
  const user = await requireUser();
  if (user.role === "provider") redirect(ROUTES.requests);
  return <MatchingPage />;
}
