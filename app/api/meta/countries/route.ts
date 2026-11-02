import { getCountries } from "@/lib/countries";
import { apiOk } from "@/lib/api-response";

/** Public country + calling-code metadata for registration forms. */
export async function GET() {
  return apiOk(getCountries(), 200, { "Cache-Control": "no-store, max-age=0" });
}
