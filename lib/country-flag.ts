/** Convert an ISO 3166-1 alpha-2 code to its regional-indicator flag emoji. */
export function countryFlagForCode(cca2: string): string {
  const code = cca2.toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return "";
  return [...code].map((letter) => String.fromCodePoint(letter.charCodeAt(0) + 127397)).join("");
}
