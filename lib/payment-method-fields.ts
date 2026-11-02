/**
 * Per-method payment field specifications. Each rail asks only for its own
 * PUBLIC, non-sensitive details — the exact fields its documentation and
 * industry practice require to identify the destination later:
 *
 * - Cards (PCI DSS): brand + last4 + expiry + holder name. Full PAN and CVV
 *   are NEVER requested, accepted, or stored.
 * - MTN MoMo / Airtel Money: provider + country + MSISDN phone (validated
 *   per ITU/libphonenumber rules) + registered account name. PINs are NEVER
 *   requested — MoMo collections are approved on the customer's own handset.
 * - Crypto: coin + network + public address (+ optional memo/tag). Private
 *   keys and seed phrases are NEVER requested.
 * - Bank: bank + account name + last4 only.
 *
 * One module drives BOTH the client form and server validation, so the UI
 * can never offer a field the server would reject (or vice versa).
 */

import { parsePhoneNumberFromString } from "libphonenumber-js";
import { normalizePhone } from "./phone";

export const METHOD_OPTION_KEYS = ["visa", "mastercard", "mtn", "airtel", "crypto", "bank"] as const;

export type MethodOptionKey = (typeof METHOD_OPTION_KEYS)[number];

export interface FieldOption {
  value: string;
  label: string;
}

export interface FieldSpec {
  key: string;
  label: string;
  kind: "text" | "select" | "tel" | "digits4" | "month" | "year";
  required: boolean;
  placeholder?: string;
  hint?: string;
  maxLength?: number;
  options?: FieldOption[];
}

export interface MethodOption {
  key: MethodOptionKey;
  /** Stored payment_methods.type — keeps legacy rows and reports working. */
  type: "card" | "mobile_money" | "crypto" | "bank";
  label: string;
  icon: string;
  blurb: string;
  fields: FieldSpec[];
}

/** MTN Mobile Money operating footprint (country, calling code, currency). */
export const MTN_COUNTRIES: FieldOption[] = [
  { value: "UG", label: "Uganda (+256 · UGX)" },
  { value: "RW", label: "Rwanda (+250 · RWF)" },
  { value: "GH", label: "Ghana (+233 · GHS)" },
  { value: "ZM", label: "Zambia (+260 · ZMW)" },
  { value: "CM", label: "Cameroon (+237 · XAF)" },
  { value: "CI", label: "Côte d’Ivoire (+225 · XOF)" },
  { value: "BJ", label: "Benin (+229 · XOF)" },
  { value: "CG", label: "Congo (+242 · XAF)" },
  { value: "GN", label: "Guinea (+224 · GNF)" },
  { value: "LR", label: "Liberia (+231 · LRD)" },
];

/** Airtel Money operating footprint (country, calling code, currency). */
export const AIRTEL_COUNTRIES: FieldOption[] = [
  { value: "UG", label: "Uganda (+256 · UGX)" },
  { value: "KE", label: "Kenya (+254 · KES)" },
  { value: "TZ", label: "Tanzania (+255 · TZS)" },
  { value: "RW", label: "Rwanda (+250 · RWF)" },
  { value: "ZM", label: "Zambia (+260 · ZMW)" },
  { value: "MW", label: "Malawi (+265 · MWK)" },
  { value: "CD", label: "DR Congo (+243 · CDF)" },
  { value: "NG", label: "Nigeria (+234 · NGN)" },
  { value: "TD", label: "Chad (+235 · XAF)" },
  { value: "MG", label: "Madagascar (+261 · MGA)" },
];

export const CRYPTO_COINS: FieldOption[] = [
  { value: "BTC", label: "Bitcoin (BTC)" },
  { value: "ETH", label: "Ethereum (ETH)" },
  { value: "USDT", label: "Tether (USDT)" },
  { value: "USDC", label: "USD Coin (USDC)" },
  { value: "BNB", label: "BNB (BNB)" },
  { value: "TRX", label: "Tron (TRX)" },
  { value: "SOL", label: "Solana (SOL)" },
];

export const CRYPTO_NETWORKS: FieldOption[] = [
  { value: "Bitcoin", label: "Bitcoin" },
  { value: "Ethereum", label: "Ethereum (ERC-20)" },
  { value: "BNB Chain", label: "BNB Chain (BEP-20)" },
  { value: "Tron", label: "Tron (TRC-20)" },
  { value: "Solana", label: "Solana" },
  { value: "Polygon", label: "Polygon" },
];

function cardFields(brand: "Visa" | "Mastercard"): FieldSpec[] {
  return [
    {
      key: "brand",
      label: "Card brand",
      kind: "select",
      required: true,
      options: [
        { value: "Visa", label: "Visa" },
        { value: "Mastercard", label: "Mastercard" },
      ],
      hint: `Preselected ${brand}; change it if this card differs.`,
    },
    { key: "holderName", label: "Name on card", kind: "text", required: true, placeholder: "AMA SERWAA", maxLength: 60 },
    {
      key: "last4",
      label: "Last 4 digits",
      kind: "digits4",
      required: true,
      placeholder: "4242",
      hint: "Only the last 4 digits — never type the full card number.",
    },
    { key: "expMonth", label: "Expiry month", kind: "month", required: true },
    { key: "expYear", label: "Expiry year", kind: "year", required: true },
  ];
}

function momoFields(provider: "MTN" | "Airtel", countries: FieldOption[]): FieldSpec[] {
  return [
    {
      key: "provider",
      label: "Provider",
      kind: "select",
      required: true,
      options: [{ value: provider, label: `${provider} Money` }],
      hint: "Fixed by the method you selected.",
    },
    { key: "country", label: "Country", kind: "select", required: true, options: countries },
    {
      key: "phone",
      label: "Mobile-money phone",
      kind: "tel",
      required: true,
      placeholder: "771 234 567",
      hint: `The ${provider} number that will approve payments on its own handset. Never enter your PIN.`,
      maxLength: 24,
    },
    {
      key: "accountName",
      label: "Registered account name",
      kind: "text",
      required: true,
      placeholder: "As shown on the mobile-money account",
      maxLength: 60,
    },
  ];
}

export const METHOD_OPTIONS: MethodOption[] = [
  {
    key: "visa",
    type: "card",
    label: "Visa",
    icon: "credit-card",
    blurb: "Visa debit or credit card — brand, last 4, expiry.",
    fields: cardFields("Visa"),
  },
  {
    key: "mastercard",
    type: "card",
    label: "Mastercard",
    icon: "credit-card",
    blurb: "Mastercard debit or credit card — brand, last 4, expiry.",
    fields: cardFields("Mastercard"),
  },
  {
    key: "mtn",
    type: "mobile_money",
    label: "MTN MoMo",
    icon: "mobile-screen",
    blurb: "MTN Mobile Money — country, phone, account name.",
    fields: momoFields("MTN", MTN_COUNTRIES),
  },
  {
    key: "airtel",
    type: "mobile_money",
    label: "Airtel Money",
    icon: "mobile-screen",
    blurb: "Airtel Money — country, phone, account name.",
    fields: momoFields("Airtel", AIRTEL_COUNTRIES),
  },
  {
    key: "crypto",
    type: "crypto",
    label: "Crypto",
    icon: "coins",
    blurb: "Public wallet address — coin, network, address.",
    fields: [
      { key: "coin", label: "Coin", kind: "select", required: true, options: CRYPTO_COINS },
      { key: "network", label: "Network", kind: "select", required: true, options: CRYPTO_NETWORKS },
      {
        key: "address",
        label: "Public wallet address",
        kind: "text",
        required: true,
        placeholder: "Paste the receiving address",
        hint: "Public address only — never a private key or seed phrase.",
        maxLength: 128,
      },
      {
        key: "memo",
        label: "Memo / tag (if required)",
        kind: "text",
        required: false,
        placeholder: "Only for chains that require one",
        maxLength: 64,
      },
    ],
  },
  {
    key: "bank",
    type: "bank",
    label: "Bank transfer",
    icon: "landmark",
    blurb: "Bank account — bank, name, last 4.",
    fields: [
      { key: "bankName", label: "Bank name", kind: "text", required: true, placeholder: "Stanbic Bank", maxLength: 60 },
      { key: "accountName", label: "Account name", kind: "text", required: true, placeholder: "Full account name", maxLength: 60 },
      {
        key: "last4",
        label: "Last 4 digits",
        kind: "digits4",
        required: true,
        placeholder: "1234",
        hint: "Only the last 4 digits of the account number.",
      },
    ],
  },
];

export function methodOption(key: string): MethodOption | undefined {
  return METHOD_OPTIONS.find((o) => o.key === key);
}

/** Keys that must never appear in stored details (defense in depth). */
const FORBIDDEN_DETAIL_KEYS = [
  "cvv",
  "cvc",
  "pin",
  "password",
  "passcode",
  "seed",
  "seedphrase",
  "privatekey",
  "private_key",
  "secret",
  "cardnumber",
  "card_number",
  "pan",
  "expiry_cvv",
];

export interface DetailsValidation {
  ok: boolean;
  errors: string[];
  /** Canonical, trimmed values ready to store (phone in E.164). */
  normalized: Record<string, string>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Standard public-address shapes per coin family (prefix + charset + length). */
function validCryptoAddress(coin: string, address: string): boolean {
  if (/\s/.test(address) || address.length < 20 || address.length > 128) return false;
  switch (coin) {
    case "BTC":
      return /^(bc1[a-z0-9]{25,59}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/.test(address);
    case "ETH":
    case "USDT":
    case "USDC":
    case "BNB":
      // EVM-style 0x address (covers ERC-20/BEP-20 USDT/USDC/BNB defaults).
      return /^0x[a-fA-F0-9]{40}$/.test(address);
    case "TRX":
      return /^T[a-zA-Z0-9]{33}$/.test(address);
    case "SOL":
      return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
    default:
      return false;
  }
}

/** Validate one method's details exactly as its rail requires. Pure and unit-tested. */
export function validateMethodDetails(optionKey: string, details: unknown): DetailsValidation {
  const option = methodOption(optionKey);
  if (!option) return { ok: false, errors: ["Unknown payment method."], normalized: {} };
  if (!isRecord(details)) return { ok: false, errors: ["Payment details are required."], normalized: {} };

  const errors: string[] = [];
  const normalized: Record<string, string> = {};

  for (const key of Object.keys(details)) {
    const compact = key.toLowerCase().replace(/[^a-z]/g, "");
    if (FORBIDDEN_DETAIL_KEYS.includes(compact)) {
      return { ok: false, errors: ["That field must never be submitted. Only public details are accepted."], normalized: {} };
    }
  }

  const take = (key: string): string => {
    const value = asText(details[key]);
    normalized[key] = value;
    return value;
  };

  for (const field of option.fields) {
    const value = take(field.key);
    if (!value) {
      if (field.required) errors.push(`${field.label} is required.`);
      continue;
    }
    if (field.maxLength && value.length > field.maxLength) {
      errors.push(`${field.label} is too long.`);
    }
  }

  if (option.key === "visa" || option.key === "mastercard") {
    if (normalized.brand && !["Visa", "Mastercard"].includes(normalized.brand)) {
      errors.push("Card brand must be Visa or Mastercard.");
    } else if (!normalized.brand) {
      normalized.brand = option.key === "visa" ? "Visa" : "Mastercard";
    }
    if (normalized.holderName && normalized.holderName.length < 2) errors.push("Name on card is too short.");
    if (normalized.last4 && !/^\d{4}$/.test(normalized.last4)) {
      errors.push("Last 4 digits must be exactly 4 numbers.");
    }
    const month = Number(normalized.expMonth);
    const year = Number(normalized.expYear);
    if (normalized.expMonth && !(month >= 1 && month <= 12)) errors.push("Expiry month must be 01–12.");
    const currentYear = new Date().getFullYear();
    if (normalized.expYear && !(year >= currentYear && year <= currentYear + 15)) {
      errors.push("Expiry year is out of range.");
    }
    if (month >= 1 && month <= 12 && year >= currentYear && year <= currentYear + 15) {
      const endOfMonth = new Date(year, month, 0, 23, 59, 59);
      if (endOfMonth < new Date()) errors.push("This card is expired.");
    }
    // A full PAN smuggled into any card field is rejected outright.
    for (const value of Object.values(normalized)) {
      const digits = value.replace(/[^0-9]/g, "");
      if (digits.length >= 13 && /\d(?:[ -]?\d){12,18}/.test(value)) {
        return { ok: false, errors: ["Never enter a full card number — last 4 digits only."], normalized: {} };
      }
    }
  }

  if (option.key === "mtn" || option.key === "airtel") {
    const countries = option.key === "mtn" ? MTN_COUNTRIES : AIRTEL_COUNTRIES;
    const expectedProvider = option.key === "mtn" ? "MTN" : "Airtel";
    if (normalized.provider && normalized.provider !== expectedProvider) {
      errors.push(`Provider must be ${expectedProvider} for this method.`);
    } else {
      normalized.provider = expectedProvider;
    }
    if (normalized.country && !countries.some((c) => c.value === normalized.country)) {
      errors.push(`${expectedProvider} Money is not supported in the selected country.`);
    }
    if (normalized.accountName && normalized.accountName.length < 2) {
      errors.push("Registered account name is too short.");
    }
    if (normalized.phone) {
      if (/^(?:pin|password)\s*[:=]?/i.test(normalized.phone)) {
        return { ok: false, errors: ["Never enter your mobile-money PIN."], normalized: {} };
      }
      const checked = normalizePhone(normalized.phone, normalized.country || "UG");
      if (!checked.valid) {
        errors.push("That phone number is not valid for the selected country.");
      } else {
        normalized.phone = checked.e164;
      }
    }
  }

  if (option.key === "crypto") {
    if (normalized.coin && !CRYPTO_COINS.some((c) => c.value === normalized.coin)) {
      errors.push("Unknown coin.");
    }
    if (normalized.network && !CRYPTO_NETWORKS.some((n) => n.value === normalized.network)) {
      errors.push("Unknown network.");
    }
    if (normalized.address && normalized.coin && !validCryptoAddress(normalized.coin, normalized.address)) {
      errors.push(`That address is not a valid ${normalized.coin} address.`);
    }
    if (normalized.memo && normalized.memo.split(/\s+/).length > 12) {
      errors.push("Memo/tag looks like a seed phrase — only short destination tags are accepted.");
    }
  }

  if (option.key === "bank") {
    if (normalized.bankName && normalized.bankName.length < 2) errors.push("Bank name is too short.");
    if (normalized.accountName && normalized.accountName.length < 2) errors.push("Account name is too short.");
    if (normalized.last4 && !/^\d{4}$/.test(normalized.last4)) {
      errors.push("Last 4 digits must be exactly 4 numbers.");
    }
  }

  // Credential-shaped values anywhere are rejected, whatever the field.
  if (errors.length === 0) {
    for (const value of Object.values(normalized)) {
      if (/^(?:pin|cvv|cvc|password)\s*[:=]?\s*\S+/i.test(value)) {
        return { ok: false, errors: ["Never enter PINs, CVVs, or passwords."], normalized: {} };
      }
    }
  }

  return errors.length ? { ok: false, errors, normalized: {} } : { ok: true, errors: [], normalized };
}

/** Mask an E.164 phone for display: +256 ••• 123 (calling code + last 3 only). */
export function maskPhone(e164: string): string {
  try {
    const parsed = parsePhoneNumberFromString(e164);
    if (parsed) return `+${parsed.countryCallingCode} ••• ${parsed.nationalNumber.slice(-3)}`;
  } catch {
    /* fall through to the digit fallback */
  }
  const digits = e164.replace(/[^0-9]/g, "");
  if (digits.length < 7) return "•••";
  return `+${digits.slice(0, 3)} ••• ${digits.slice(-3)}`;
}

/** Mask a wallet address for display: bc1…9f3k. */
export function maskAddress(address: string): string {
  const clean = address.trim();
  if (clean.length <= 10) return clean;
  return `${clean.slice(0, 4)}…${clean.slice(-4)}`;
}

/** Authoritative display label built from validated details (server-side). */
export function buildDisplayLabel(optionKey: string, normalized: Record<string, string>): string {
  switch (optionKey) {
    case "visa":
    case "mastercard": {
      const brand = normalized.brand || (optionKey === "visa" ? "Visa" : "Mastercard");
      const month = normalized.expMonth?.padStart(2, "0") ?? "";
      const year = normalized.expYear?.slice(-2) ?? "";
      return `${brand} •• ${normalized.last4}${month && year ? ` · ${month}/${year}` : ""}`.slice(0, 60);
    }
    case "mtn":
    case "airtel": {
      const provider = optionKey === "mtn" ? "MTN MoMo" : "Airtel Money";
      return `${provider} ${maskPhone(normalized.phone ?? "")}${normalized.accountName ? ` · ${normalized.accountName}` : ""}`.slice(0, 60);
    }
    case "crypto":
      return `${normalized.coin} · ${maskAddress(normalized.address ?? "")} (${normalized.network})`.slice(0, 60);
    case "bank":
      return `${normalized.bankName} •• ${normalized.last4}`.slice(0, 60);
    default:
      return "Payment method";
  }
}

/** Default option per stored type (used when upgrading legacy label-only rows). */
export function defaultOptionForType(type: string): MethodOptionKey {
  switch (type) {
    case "mobile_money":
      return "mtn";
    case "crypto":
      return "crypto";
    case "bank":
      return "bank";
    default:
      return "visa";
  }
}
