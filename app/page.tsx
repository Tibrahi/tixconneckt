import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getSession } from "@/lib/session";
import { ROUTES } from "@/lib/routes";
import { LandingPage } from "@/components/site/LandingPage";

/**
 * Application entry point: visitors see the landing page, with sign-in
 * and registration behind its buttons. Authenticated users go straight
 * to their dashboard.
 */
export const instant = false;

export default async function Home() {
  await connection();
  const session = await getSession();
  if (session && session.user.status === "active") {
    redirect(session.user.role === "admin" ? ROUTES.admin : ROUTES.dashboard);
  }
  return <LandingPage />;
}
