import { getCountries } from "@/lib/countries";
import { apiOk } from "@/lib/api-response";

/** Public country + calling-code metadata for registration forms. */
export async function GET() {
  return apiOk(getCountries());
}
