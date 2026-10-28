"use client";

import Image from "next/image";
import { useScreenSize } from "@/hooks/useScreenSize";
import { ArrowRightIcon, CheckIcon } from "./icons";

const AVATARS = [
  { initials: "AO", shade: "bg-brand-600" },
  { initials: "JM", shade: "bg-brand-800" },
  { initials: "KS", shade: "bg-black" },
  { initials: "RT", shade: "bg-brand-400" },
];

export default function Hero() {
  const { ready, isShortHeight } = useScreenSize();
  const compact = ready && isShortHeight;

  return (
    <section id="top" className="relative overflow-hidden bg-white">
      <div
        aria-hidden="true"
        className="absolute inset-0 [background-image:linear-gradient(to_right,#eff6ff_1px,transparent_1px),linear-gradient(to_bottom,#eff6ff_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(ellipse_65%_60%_at_50%_35%,black,transparent)]"
      />
      <div className="relative mx-auto grid w-full max-w-7xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-[1.02fr_0.98fr] lg:gap-16 lg:px-8 lg:min-h-[calc(100svh-4.5rem)]">
        <div className={compact ? "py-10 lg:py-12" : "py-14 sm:py-16 lg:py-20"}>
          <p className="flex items-center gap-2.5 font-mono text-xs font-medium tracking-[0.18em] text-brand-700 uppercase">
            <span aria-hidden="true" className="inline-block h-2 w-2 bg-brand-600" />
            Graduates · Undergraduates · Every learner
          </p>
          <h1 className="mt-5 text-4xl font-bold tracking-tight text-black sm:text-5xl xl:text-6xl">
            Where learners at every level connect and{" "}
            <span className="text-brand-700">build big</span>.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-neutral-700 sm:text-lg">
            TixConneckt brings together graduates, undergraduates, and students
            from higher and lower education — find co-builders, join real
            projects, get mentored, and request a loan or support to fund what
            you start.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <a
              href="#get-started"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
            >
              Join the network
              <ArrowRightIcon className="h-4 w-4" />
            </a>
            <a
              href="#funding"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-neutral-300 px-6 py-3.5 text-sm font-semibold text-black transition-colors hover:border-brand-600 hover:text-brand-700"
            >
              Request loan or support
            </a>
          </div>
          <div className="mt-9 flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="flex -space-x-2.5">
              {AVATARS.map((avatar) => (
                <span
                  key={avatar.initials}
                  aria-hidden="true"
                  className={`flex h-9 w-9 items-center justify-center rounded-full border-2 border-white font-mono text-[11px] font-semibold text-white ${avatar.shade}`}
                >
                  {avatar.initials}
                </span>
              ))}
            </div>
            <p className="font-mono text-xs leading-relaxed tracking-wide text-black uppercase">
              120K+ members · 850+ institutions · 40+ countries
            </p>
          </div>
        </div>

        <div
          className={`flex flex-col gap-4 pb-14 sm:pb-16 lg:pb-20 lg:pl-4 ${
            compact ? "lg:gap-3" : "lg:gap-5"
          }`}
        >
          <article className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-xl sm:p-6 lg:ml-10">
            <div className="flex items-center justify-between gap-3">
              <p className="font-mono text-[11px] font-semibold tracking-[0.16em] text-brand-700 uppercase">
                Project · Open
              </p>
              <p className="font-mono text-[11px] text-neutral-600">LAGOS · REMOTE</p>
            </div>
            <h2 className="mt-2.5 text-lg font-bold tracking-tight text-black">
              Solar study kiosk for rural campuses
            </h2>
            <div
              className="mt-4 h-2 overflow-hidden rounded-full bg-neutral-100"
              role="progressbar"
              aria-valuenow={68}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Project progress"
            >
              <div className="h-full w-[68%] rounded-full bg-brand-600" />
            </div>
            <div className="mt-4 flex items-center justify-between gap-3">
              <div className="flex -space-x-2">
                {AVATARS.slice(0, 3).map((avatar) => (
                  <span
                    key={avatar.initials}
                    aria-hidden="true"
                    className={`flex h-7 w-7 items-center justify-center rounded-full border-2 border-white font-mono text-[9px] font-semibold text-white ${avatar.shade}`}
                  >
                    {avatar.initials}
                  </span>
                ))}
              </div>
              <p className="text-xs font-medium text-black">
                Seeking <span className="font-bold">2 undergrads</span>
              </p>
            </div>
          </article>

          <article className="flex items-center gap-4 rounded-xl border border-neutral-200 bg-white p-5 shadow-xl sm:p-6 lg:mr-10">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white">
              <CheckIcon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold text-black">Support approved</p>
              <p className="mt-0.5 font-mono text-xs tracking-wide text-neutral-700">
                $4,500 · PROJECT GRANT · 48HRS
              </p>
            </div>
          </article>

          <article className="flex items-center gap-4 rounded-xl border border-neutral-200 bg-white p-5 shadow-xl sm:p-6 lg:ml-16 [@media(max-height:800px)]:hidden">
            <Image
              src="/logo.png"
              alt=""
              width={44}
              height={44}
              className="h-11 w-11 shrink-0 rounded-full object-cover"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-black">
                Amara O. accepted your invite
              </p>
              <p className="mt-0.5 font-mono text-xs tracking-wide text-neutral-700">
                GRADUATE · COMPUTER SCIENCE
              </p>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
