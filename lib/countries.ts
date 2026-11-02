import countries from "world-countries";
import { countryFlagForCode } from "./country-flag";

export interface CountryOption {
  name: string;
  cca2: string;
  callingCode: string;
  flag: string;
}

let cached: CountryOption[] | null = null;

/** Preserve the complete world-countries dataset, including entries without a calling code. */
export function getCountries(): CountryOption[] {
  if (cached) return cached;
  cached = (
    countries as Array<{
      name: { common: string };
      cca2: string;
      flag: string;
      idd: { root?: string; suffixes?: string[] };
    }>
  )
    .map((c) => ({
      name: c.name.common,
      cca2: c.cca2,
      flag: c.flag || countryFlagForCode(c.cca2),
      callingCode:
        c.idd?.root && c.idd.suffixes?.length ? `${c.idd.root}${c.idd.suffixes[0]}` : "",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return cached;
}

export function findCountry(cca2OrName: string): CountryOption | undefined {
  const needle = cca2OrName.trim().toLowerCase();
  return getCountries().find(
    (c) => c.cca2.toLowerCase() === needle || c.name.toLowerCase() === needle,
  );
}
