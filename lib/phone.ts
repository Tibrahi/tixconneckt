import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

export interface NormalizedPhone {
  e164: string;
  country: string;
  callingCode: string;
  valid: boolean;
}

/** Normalize and validate a phone number against its ISO country code. */
export function normalizePhone(raw: string, country: CountryCode | string): NormalizedPhone {
  try {
    const parsed = parsePhoneNumberFromString(raw, (country as CountryCode) || undefined);
    if (!parsed || !parsed.isValid()) {
      return { e164: raw.trim(), country: String(country), callingCode: "", valid: false };
    }
    return {
      e164: parsed.number,
      country: parsed.country ?? String(country),
      callingCode: `+${parsed.countryCallingCode}`,
      valid: true,
    };
  } catch {
    return { e164: raw.trim(), country: String(country), callingCode: "", valid: false };
  }
}
