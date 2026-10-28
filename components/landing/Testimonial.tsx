import { QuoteIcon } from "./icons";

export default function Testimonial() {
  return (
    <section aria-label="Member story" className="border-y border-neutral-200 bg-brand-50/50">
      <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <div className="max-w-3xl">
          <QuoteIcon className="h-10 w-10 text-brand-600" />
          <blockquote className="mt-6 text-2xl font-semibold tracking-tight text-black sm:text-3xl">
            “I met my co-founders in my second year and got a project grant in
            my third — we shipped before I graduated.”
          </blockquote>
          <p className="mt-6 text-base font-bold text-black">
            Ngozi E. <span className="font-normal text-neutral-700">— Graduate, Electrical Engineering</span>
          </p>
          <p className="mt-1.5 font-mono text-xs tracking-[0.16em] text-brand-700 uppercase">
            Built on TixConneckt · Funded project
          </p>
        </div>
      </div>
    </section>
  );
}
