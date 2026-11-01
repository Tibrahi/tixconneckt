"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ROUTES } from "@/lib/routes";
import { Icon } from "@/components/ui/Icon";

export type AuthVariant = "login" | "register" | "forgot" | "reset" | "verify";

interface AuthSlide {
  icon: string;
  title: string;
  text: string;
}

/** Task-tailored informational content per auth page (truthful product copy). */
const SLIDES: Record<AuthVariant, AuthSlide[]> = {
  login: [
    {
      icon: "message",
      title: "Pick up where you left off",
      text: "Your conversations, groups, projects, and notifications persist across sessions and devices.",
    },
    {
      icon: "shield",
      title: "Private and protected",
      text: "Email verification codes, secure sessions, and alerts when a new device signs in.",
    },
    {
      icon: "diagram-project",
      title: "Work stays connected",
      text: "Projects, requests, funding records, and decisions remain linked to the people behind them.",
    },
  ],
  register: [
    {
      icon: "user-plus",
      title: "One account, many ways to collaborate",
      text: "Get a unique short identifier others use to find you, then complete your skills and objectives.",
    },
    {
      icon: "wand-magic-sparkles",
      title: "Find complementary people",
      text: "Matching surfaces collaborators whose capabilities fit the work you want to do.",
    },
    {
      icon: "users",
      title: "Join groups and projects",
      text: "Connect, chat, call one-to-one, form groups, and develop shared projects together.",
    },
  ],
  forgot: [
    {
      icon: "envelope",
      title: "Recover with your email",
      text: "We send a time-limited verification code to the address on your account.",
    },
    {
      icon: "shield",
      title: "Verified before reset",
      text: "Your identity is confirmed before any password change is allowed to proceed.",
    },
    {
      icon: "bell",
      title: "Always notified",
      text: "Recovery requests and password changes trigger security notifications to your email.",
    },
  ],
  reset: [
    {
      icon: "key",
      title: "Choose a strong password",
      text: "Use at least 8 characters with upper and lower case letters and a digit.",
    },
    {
      icon: "shield",
      title: "Sessions stay safe",
      text: "Changing your password signs out other sessions that may no longer be yours.",
    },
    {
      icon: "check",
      title: "One step and done",
      text: "After saving, sign in with your new password to continue where you left off.",
    },
  ],
  verify: [
    {
      icon: "envelope",
      title: "Check your inbox",
      text: "Enter the 6-digit code we sent to your email address to activate your account.",
    },
    {
      icon: "clock",
      title: "Codes expire",
      text: "Each code works for a limited time with limited attempts — request a new one if needed.",
    },
    {
      icon: "check",
      title: "Then you're in",
      text: "Verified accounts can sign in, complete a profile, and start collaborating.",
    },
  ],
};

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/**
 * Two-region auth layout (role-aware §E2): an informational carousel region
 * on the left and the requested form on the right. On small screens the
 * carousel comes first, followed by the form. Auto-advance pauses on hover/focus
 * and is disabled
 * for reduced-motion users; controls are keyboard and screen-reader ready.
 */
export function AuthLayout({ variant, children }: { variant: AuthVariant; children: ReactNode }) {
  const slides = SLIDES[variant];
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (paused || reducedMotion || slides.length < 2) return;
    timer.current = setTimeout(() => setIndex((i) => (i + 1) % slides.length), 6000);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [index, paused, reducedMotion, slides.length]);

  const slide = slides[index];

  return (
    <main className="flex min-h-screen flex-col bg-neutral-50 lg:flex-row">
      {/* Carousel comes first on small screens and occupies the left region on desktop. */}
      <div
        className="flex flex-1 flex-col justify-center bg-brand-950 px-6 py-10 text-white sm:px-10 lg:min-h-screen lg:py-0"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={() => setPaused(false)}
      >
        <div className="mx-auto w-full max-w-md">
          <Link href={ROUTES.landing} className="flex items-center gap-2.5" aria-label="TIXCONNECKT home">
            <Image src="/logo.png" alt="" width={36} height={36} className="h-9 w-9 rounded-lg" />
            <span className="text-base font-bold tracking-tight">TIXCONNECKT</span>
          </Link>
          <section
            aria-roledescription="carousel"
            aria-label="About TIXCONNECKT"
            className="mt-10"
          >
            <div aria-live="polite" aria-atomic="true">
              <p aria-hidden="true" className="flex h-12 w-12 items-center justify-center rounded-lg bg-white/10 text-xl">
                <Icon name={slide.icon} />
              </p>
              <h2 className="mt-4 text-2xl font-bold tracking-tight">{slide.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-brand-100">{slide.text}</p>
            </div>
            <div className="mt-6 flex items-center gap-3">
              <button
                type="button"
                aria-label="Previous"
                onClick={() => setIndex((index - 1 + slides.length) % slides.length)}
                className="rounded-md border border-white/20 px-3 py-1.5 text-sm hover:bg-white/10"
              >
                ‹
              </button>
              <div role="tablist" aria-label="Slides" className="flex gap-2">
                {slides.map((s, i) => (
                  <button
                    key={s.title}
                    type="button"
                    role="tab"
                    aria-selected={i === index}
                    aria-label={`Slide ${i + 1}: ${s.title}`}
                    onClick={() => setIndex(i)}
                    className={`h-2 rounded-full transition-all motion-reduce:transition-none ${
                      i === index ? "w-6 bg-white" : "w-2 bg-white/40 hover:bg-white/70"
                    }`}
                  />
                ))}
              </div>
              <button
                type="button"
                aria-label="Next"
                onClick={() => setIndex((index + 1) % slides.length)}
                className="rounded-md border border-white/20 px-3 py-1.5 text-sm hover:bg-white/10"
              >
                ›
              </button>
            </div>
          </section>
          <p className="mt-10 text-xs text-brand-100">
            Protected by server-side authorization. Read the{" "}
            <Link href={ROUTES.legalPrivacy} className="underline hover:text-white">Privacy Policy</Link>,{" "}
            <Link href={ROUTES.legalTerms} className="underline hover:text-white">Terms</Link>, and{" "}
            <Link href={ROUTES.legalAgreement} className="underline hover:text-white">Agreement</Link>.
          </p>
        </div>
      </div>

      {/* The form follows the carousel on mobile and sits in the right region on desktop. */}
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </main>
  );
}
