"use client";

import { useEffect, useState } from "react";
import { SelectField } from "@/components/ui/Fields";
import { countryFlagForCode } from "@/lib/country-flag";

export interface CountryOption {
  name: string;
  cca2: string;
  callingCode: string;
  flag: string;
}

let countryCache: CountryOption[] | null = null;
let countryRequest: Promise<CountryOption[]> | null = null;

function loadCountries(): Promise<CountryOption[]> {
  if (countryCache) return Promise.resolve(countryCache.map(normalizeCountry));
  if (!countryRequest) {
    countryRequest = fetch("/api/meta/countries", { cache: "no-store" })
      .then((response) => response.json())
      .then((body: { ok: boolean; data?: CountryOption[] }) => {
        if (!body.ok || !body.data) throw new Error("Country list unavailable");
        countryCache = body.data.map(normalizeCountry);
        return countryCache;
      })
      .finally(() => { countryRequest = null; });
  }
  return countryRequest;
}

function normalizeCountry(country: CountryOption): CountryOption {
  return { ...country, flag: country.flag || countryFlagForCode(country.cca2) };
}

export function useCountries() {
  const [countries, setCountries] = useState<CountryOption[]>(countryCache ?? []);
  useEffect(() => {
    let active = true;
    loadCountries().then((items) => { if (active) setCountries(items); }).catch(() => {});
    return () => { active = false; };
  }, []);
  return countries;
}

export function CountrySelectField({
  label = "Country",
  value,
  onCountryChange,
  required,
  error,
}: {
  label?: string;
  value: string;
  onCountryChange: (country: CountryOption | null) => void;
  required?: boolean;
  error?: string;
}) {
  const countries = useCountries();
  const selected = countries.find((country) => country.name === value || country.cca2 === value);
  return (
    <div className="flex flex-col gap-1">
      <SelectField
        label={label}
        required={required}
        value={selected?.cca2 ?? ""}
        onChange={(event) => onCountryChange(countries.find((country) => country.cca2 === event.target.value) ?? null)}
        options={[
          { value: "", label: "Select country" },
          ...countries.map((country) => ({
            value: country.cca2,
            label: `${country.flag || countryFlagForCode(country.cca2)} ${country.name}${country.callingCode ? ` (${country.callingCode})` : ""}`,
          })),
        ]}
        error={error}
      />
      {selected ? <span className="-mt-1 text-xs text-neutral-600" aria-live="polite">{selected.flag || countryFlagForCode(selected.cca2)} {selected.name}{selected.callingCode ? ` · ${selected.callingCode}` : ""}</span> : null}
    </div>
  );
}

export function CountryLabel({ country, className = "" }: { country: string | null | undefined; className?: string }) {
  const countries = useCountries();
  if (!country) return <span className={className}>—</span>;
  const selected = countries.find((item) => item.name.toLowerCase() === country.toLowerCase() || item.cca2.toLowerCase() === country.toLowerCase());
  return <span className={className}>{selected ? `${selected.flag || countryFlagForCode(selected.cca2)} ${selected.name}` : country}</span>;
}
