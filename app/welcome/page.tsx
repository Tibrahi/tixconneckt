import { redirect } from "next/navigation";
import { ROUTES } from "@/lib/routes";

/** Legacy alias — the landing page lives at `/` now. */
export default function WelcomeAlias() {
  redirect(ROUTES.root);
}
