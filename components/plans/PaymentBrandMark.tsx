import type { MethodOptionKey } from "@/lib/payment-method-fields";
import Image from "next/image";

/** Familiar provider wordmarks for the payment rails offered in this form. */
export function PaymentBrandMark({ method, selected = false }: { method: MethodOptionKey; selected?: boolean }) {
  const className = selected ? "h-7 w-12 shrink-0" : "h-8 w-12 shrink-0";

  if (method === "visa") {
    return (
      <svg className={className} viewBox="0 0 48 30" role="img" aria-label="Visa">
        <rect x=".5" y=".5" width="47" height="29" rx="4" fill="white" />
        <path fill="#1434CB" d="M19.4 20.5h-3.2l2-12h3.2l-2 12Zm12.1-11.7c-.6-.2-1.6-.5-2.8-.5-3.1 0-5.2 1.6-5.2 3.9 0 1.7 1.6 2.6 2.8 3.2 1.2.6 1.6 1 1.6 1.5 0 .8-1 1.2-1.9 1.2-1.3 0-2-.2-3.1-.7l-.4-.2-.5 2.8c.8.4 2.2.7 3.7.7 3.3 0 5.4-1.6 5.4-4.1 0-1.4-.9-2.5-2.7-3.3-1.1-.6-1.8-.9-1.8-1.5 0-.5.6-1 1.8-1 .9 0 1.7.2 2.3.4l.3.2.5-2.6Zm8.2-.3h-2.5c-.8 0-1.4.2-1.8 1l-5.1 11h3.3l.7-1.8h4l.4 1.8h2.9l-2.5-12Zm-4.5 7.8 1.3-3.4.7 3.4h-2Zm-19.4-7.8-3.1 8.2-.3-1.7c-.6-2-2.4-4.1-4.5-5.2l2.8 10.7h3.4l5.1-12h-3.4Z" />
        <path fill="#F7A600" d="M7.9 8.5H2.8l-.1.3c4 .9 6.7 3.1 7.8 5.8l-1.1-5c-.2-.7-.7-1.1-1.5-1.1Z" />
      </svg>
    );
  }

  if (method === "mastercard") {
    return (
      <svg className={className} viewBox="0 0 48 30" role="img" aria-label="Mastercard">
        <rect x=".5" y=".5" width="47" height="29" rx="4" fill="white" />
        <circle cx="19" cy="15" r="9" fill="#EB001B" />
        <circle cx="29" cy="15" r="9" fill="#F79E1B" />
        <path fill="#FF5F00" d="M24 8.2a9 9 0 0 1 0 13.6 9 9 0 0 1 0-13.6Z" />
      </svg>
    );
  }

  if (method === "mtn") {
    return (
      <Image
        className={`${className} object-contain`}
        src="https://momoapi.mtn.com/content/momo_mtnb.png"
        width={96}
        height={48}
        unoptimized
        alt="MTN MoMo"
      />
    );
  }

  if (method === "airtel") {
    return (
      <Image
        className={`${className} object-contain`}
        src="https://s3-ap-southeast-1.amazonaws.com/bsy/iportal/images/airtel-logo-red-text-horizontal.jpg"
        width={96}
        height={48}
        unoptimized
        alt="Airtel"
      />
    );
  }

  if (method === "crypto") {
    return (
      <span className={`inline-flex ${className} items-center justify-center rounded-full bg-[#F7931A] text-lg font-bold text-white`} role="img" aria-label="Cryptocurrency">
        ₿
      </span>
    );
  }

  return (
    <span className={`inline-flex ${className} items-center justify-center rounded border border-neutral-300 bg-white text-[10px] font-semibold text-neutral-700`} aria-label="Bank transfer">
      BANK
    </span>
  );
}
