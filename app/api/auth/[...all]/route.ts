import { getAuth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

/**
 * Better Auth handler: sign-out, session fetch, and related endpoints.
 * The auth instance is created per request so builds never require live config.
 */
function handler() {
  return toNextJsHandler(getAuth());
}

export async function GET(req: Request) {
  return handler().GET(req);
}

export async function POST(req: Request) {
  return handler().POST(req);
}
