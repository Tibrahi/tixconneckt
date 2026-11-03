import { redirect } from "next/navigation";
import { ROUTES } from "@/lib/routes";

export const instant = false;

/** First-owner provisioning is handled outside the public registration flow. */
export default function AdminRegisterPage() {
  redirect(ROUTES.login);
}
