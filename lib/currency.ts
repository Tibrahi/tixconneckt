/** Format minor-unit amounts with Intl. */
export function formatMoney(amountMinor: number, currency = "USD", locale = "en-US"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).format(amountMinor / 100);
}

/** Currencies the wallet accepts for contributions and withdrawals. */
export const SUPPORTED_CURRENCIES = ["RWF", "USD", "EUR", "GBP", "KES", "UGX", "TZS"] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export function normalizeCurrency(value: string): string {
  return value.trim().toUpperCase();
}

export function isSupportedCurrency(value: string): boolean {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(normalizeCurrency(value));
}

export function formatDateTime(date: Date | string, timeZone = "UTC", locale = "en-US"): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(new Date(date));
}

export interface ConversionResult {
  ok: boolean;
  convertedMinor?: number;
  rate?: number;
  pendingReason?: string;
  error?: string;
}

/**
 * Currency conversion via Frankfurter (https://api.frankfurter.app).
 * Explicitly sourced; failures are reported, never faked.
 */
export async function convertCurrency(
  amountMinor: number,
  from: string,
  to: string,
): Promise<ConversionResult> {
  if (from === to) return { ok: true, convertedMinor: amountMinor, rate: 1 };
  try {
    const res = await fetch(
      `https://api.frankfurter.app/latest?amount=${amountMinor / 100}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      { next: { revalidate: 3600 } },
    );
    if (!res.ok) return { ok: false, error: `Frankfurter returned HTTP ${res.status}` };
    const data = (await res.json()) as { rates?: Record<string, number> };
    const converted = data.rates?.[to];
    if (typeof converted !== "number") {
      return { ok: false, error: "Frankfurter returned no rate" };
    }
    return {
      ok: true,
      convertedMinor: Math.round(converted * 100),
      rate: converted / (amountMinor / 100),
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Conversion failed" };
  }
}
