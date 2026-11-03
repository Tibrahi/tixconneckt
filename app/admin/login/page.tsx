import { redirect } from "next/navigation";
import { ROUTES } from "@/lib/routes";

export const instant = false;

/** Administrator accounts use the standard sign-in page without a separate public entry form. */
export default function AdminLoginPage() {
  redirect(ROUTES.login);
}
