import { getConfigStatus } from "@/lib/config";
import { apiOk } from "@/lib/api-response";

/** Public liveness probe — never exposes secrets or private data. */
export async function GET() {
  const config = getConfigStatus();
  return apiOk({
    service: "tixconneckt",
    time: new Date().toISOString(),
    configured: config.ok,
    missing: config.missing,
  });
}
