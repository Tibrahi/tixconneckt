import countries from "world-countries";

export interface CountryOption {
  name: string;
  cca2: string;
  callingCode: string;
}

let cached: CountryOption[] | null = null;

/** Country names + calling codes for registration and profile forms. */
export function getCountries(): CountryOption[] {
  if (cached) return cached;
  cached = (
    countries as Array<{
      name: { common: string };
      cca2: string;
      idd: { root?: string; suffixes?: string[] };
    }>
  )
    .map((c) => ({
      name: c.name.common,
      cca2: c.cca2,
      callingCode:
        c.idd?.root && c.idd.suffixes?.length ? `${c.idd.root}${c.idd.suffixes[0]}` : "",
    }))
    .filter((c) => c.callingCode !== "")
    .sort((a, b) => a.name.localeCompare(b.name));
  return cached;
}

export function findCountry(cca2OrName: string): CountryOption | undefined {
  const needle = cca2OrName.trim().toLowerCase();
  return getCountries().find(
    (c) => c.cca2.toLowerCase() === needle || c.name.toLowerCase() === needle,
  );
}
