"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { ArrowRightIcon, CheckIcon } from "./icons";

export default function CtaBanner() {
  const [email, setEmail] = useState("");
  const [joined, setJoined] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (email.trim()) setJoined(true);
  }

  return (
    <section id="get-started" className="scroll-mt-24 bg-white">
      <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
        <div className="grid items-center gap-10 rounded-3xl bg-brand-700 px-6 py-12 sm:px-10 sm:py-14 lg:grid-cols-2 lg:gap-12 lg:px-16">
          <div>
            <p className="flex items-center gap-2.5 font-mono text-xs font-medium tracking-[0.18em] text-brand-200 uppercase">
              <span aria-hidden="true" className="inline-block h-2 w-2 bg-white" />
              Get started
            </p>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Ready to build something big?
            </h2>
            <p className="mt-4 max-w-md text-base leading-relaxed text-brand-100 sm:text-lg">
              Join 120,000+ graduates, undergraduates, and learners already
              connecting, collaborating, and shipping on TixConneckt.
            </p>
          </div>
          <div>
            {joined ? (
              <div className="rounded-2xl bg-white p-6 sm:p-7">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-600 text-white">
                  <CheckIcon className="h-5 w-5" />
                </span>
                <p className="mt-4 text-lg font-bold text-black">
                  You’re on the list.
                </p>
                <p className="mt-1 text-sm leading-relaxed text-neutral-700">
                  We sent your invite to <span className="font-semibold text-black">{email}</span>.
                  Check your inbox to claim your profile.
                </p>
              </div>
            ) : (
              <form
                onSubmit={handleSubmit}
                className="rounded-2xl bg-white p-6 sm:p-7"
              >
                <label
                  htmlFor="cta-email"
                  className="mb-1.5 block text-sm font-semibold text-black"
                >
                  Email address
                </label>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <input
                    id="cta-email"
                    type="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-sm text-black placeholder:text-neutral-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
                  >
                    Join free
                    <ArrowRightIcon className="h-4 w-4" />
                  </button>
                </div>
                <p className="mt-3 font-mono text-[11px] tracking-wide text-neutral-600 uppercase">
                  Free for learners · No credit card
                </p>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
