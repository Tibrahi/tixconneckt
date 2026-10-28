"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useScreenSize } from "@/hooks/useScreenSize";
import SectionHeading from "./SectionHeading";
import { BanknoteIcon, CheckIcon, FlagIcon, ShieldIcon } from "./icons";

const SUPPORT_TYPES = [
  {
    id: "loan",
    icon: BanknoteIcon,
    tag: "LOANS",
    title: "Education loans",
    description:
      "Cover tuition, devices, books, and living costs — then repay on terms built for learners.",
  },
  {
    id: "grant",
    icon: FlagIcon,
    tag: "GRANTS",
    title: "Project grants",
    description:
      "Non-repayable funding for team builds, research, and community projects with a clear plan.",
  },
  {
    id: "emergency",
    icon: ShieldIcon,
    tag: "FAST HELP",
    title: "Emergency support",
    description:
      "Small, fast disbursements when life happens — fees, transport, tools, or a broken laptop.",
  },
];

const LEVELS = [
  "Undergraduate",
  "Graduate / Alumni",
  "Higher education (university / college)",
  "Secondary / High school",
  "Vocational / Technical",
  "Other",
];

const AMOUNTS = [
  "Under $500",
  "$500 – $2,000",
  "$2,000 – $10,000",
  "$10,000 – $50,000",
  "Over $50,000",
];

const inputClass =
  "w-full rounded-lg border border-neutral-300 bg-white px-3.5 py-2.5 text-sm text-black placeholder:text-neutral-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 focus:outline-none";

function newReference(): string {
  return `TXC-${Date.now().toString(36).toUpperCase().slice(-6)}`;
}

export default function LoanSupport() {
  const { ready, isMobile } = useScreenSize();
  const [supportType, setSupportType] = useState("grant");
  const [reference, setReference] = useState<string | null>(null);

  // Small screens see only the selected support type's detail; larger
  // screens list every option. Driven by live viewport detection.
  const showAllTypes = ready ? !isMobile : true;
  const visibleTypes = showAllTypes
    ? SUPPORT_TYPES
    : SUPPORT_TYPES.filter((type) => type.id === supportType);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setReference(newReference());
  }

  return (
    <section id="funding" className="scroll-mt-24 bg-white">
      <div className="mx-auto grid w-full max-w-7xl gap-12 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[1fr_1.05fr] lg:gap-16 lg:px-8 lg:py-24">
        <div>
          <SectionHeading
            eyebrow="Loans & support"
            title="Fuel your education and your ideas"
            description="Great builders shouldn't stall for lack of funds. Request a loan, a grant, or emergency support — reviewed by people, decided in days."
          />
          <ul className="mt-8 space-y-5 sm:mt-10">
            {visibleTypes.map((type) => (
              <li key={type.id} className="flex gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white">
                  <type.icon className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-mono text-[11px] font-semibold tracking-[0.16em] text-brand-700 uppercase">
                    {type.tag}
                  </p>
                  <h3 className="mt-1 text-base font-bold text-black sm:text-lg">
                    {type.title}
                  </h3>
                  <p className="mt-1 text-sm leading-relaxed text-neutral-700">
                    {type.description}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-8 flex items-start gap-3 rounded-xl border border-neutral-200 bg-brand-50/60 p-4">
            <ShieldIcon className="mt-0.5 h-5 w-5 shrink-0 text-brand-700" />
            <p className="text-sm leading-relaxed text-black">
              <span className="font-bold">Fair, transparent terms.</span> No
              hidden fees, no confusing fine print — every offer shows the full
              cost before you accept.
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-xl sm:p-8 lg:self-start">
          {reference ? (
            <div className="flex min-h-80 flex-col items-start justify-center py-8">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-white">
                <CheckIcon className="h-7 w-7" />
              </span>
              <h3 className="mt-6 text-2xl font-bold tracking-tight text-black">
                Request received
              </h3>
              <p className="mt-2 font-mono text-sm font-semibold tracking-wide text-brand-700">
                REF · {reference}
              </p>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-neutral-700 sm:text-base">
                Our support team reviews every request by hand and replies
                within 2 business days. Keep an eye on your inbox — we may ask
                one or two follow-up questions.
              </p>
              <button
                type="button"
                onClick={() => setReference(null)}
                className="mt-6 rounded-xl border border-neutral-300 px-5 py-2.5 text-sm font-semibold text-black transition-colors hover:border-brand-600 hover:text-brand-700"
              >
                Submit another request
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <h3 className="text-xl font-bold tracking-tight text-black">
                Request loan or support
              </h3>
              <p className="mt-1.5 font-mono text-xs tracking-wide text-neutral-600 uppercase">
                Takes ~2 min · Reply within 2 days
              </p>

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label htmlFor="funding-name" className="mb-1.5 block text-sm font-semibold text-black">
                    Full name
                  </label>
                  <input
                    id="funding-name"
                    name="name"
                    type="text"
                    required
                    autoComplete="name"
                    placeholder="Adaeze Nwosu"
                    className={inputClass}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="funding-email" className="mb-1.5 block text-sm font-semibold text-black">
                    Email
                  </label>
                  <input
                    id="funding-email"
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="you@example.com"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="funding-level" className="mb-1.5 block text-sm font-semibold text-black">
                    Education level
                  </label>
                  <select id="funding-level" name="level" required defaultValue="" className={inputClass}>
                    <option value="" disabled>
                      Select level
                    </option>
                    {LEVELS.map((level) => (
                      <option key={level} value={level}>
                        {level}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="funding-amount" className="mb-1.5 block text-sm font-semibold text-black">
                    Amount needed
                  </label>
                  <select id="funding-amount" name="amount" required defaultValue="" className={inputClass}>
                    <option value="" disabled>
                      Select range
                    </option>
                    {AMOUNTS.map((amount) => (
                      <option key={amount} value={amount}>
                        {amount}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <fieldset className="mt-4">
                <legend className="mb-1.5 text-sm font-semibold text-black">
                  Support type
                </legend>
                <div className="grid gap-2 sm:grid-cols-3">
                  {SUPPORT_TYPES.map((type) => (
                    <label
                      key={type.id}
                      className={`cursor-pointer rounded-lg border px-3 py-2.5 text-center text-sm font-semibold transition-colors ${
                        supportType === type.id
                          ? "border-brand-600 bg-brand-50 text-brand-800"
                          : "border-neutral-300 text-black hover:border-brand-400"
                      }`}
                    >
                      <input
                        type="radio"
                        name="supportType"
                        value={type.id}
                        checked={supportType === type.id}
                        onChange={() => setSupportType(type.id)}
                        className="sr-only"
                      />
                      {type.title}
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="mt-4">
                <label htmlFor="funding-purpose" className="mb-1.5 block text-sm font-semibold text-black">
                  What will it fund?
                </label>
                <textarea
                  id="funding-purpose"
                  name="purpose"
                  required
                  rows={4}
                  minLength={20}
                  placeholder="Tell us briefly: fees, a project, equipment… (min. 20 characters)"
                  className={`${inputClass} resize-y`}
                />
              </div>

              <button
                type="submit"
                className="mt-6 w-full rounded-xl bg-brand-600 px-6 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
              >
                Submit request
              </button>
              <p className="mt-3 text-center font-mono text-[11px] tracking-wide text-neutral-600 uppercase">
                No fees to apply · Cancel anytime
              </p>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
