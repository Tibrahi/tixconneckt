"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useScreenSize } from "@/hooks/useScreenSize";
import { CloseIcon, MenuIcon } from "./icons";

const NAV_LINKS = [
  { label: "Community", href: "#community" },
  { label: "Opportunities", href: "#opportunities" },
  { label: "How it works", href: "#how-it-works" },
  { label: "Funding", href: "#funding" },
];

export default function Header() {
  const [open, setOpen] = useState(false);
  const screen = useScreenSize();

  // Auto-collapse the mobile menu once the viewport grows to desktop.
  useEffect(() => {
    const closeOnDesktop = () => {
      if (window.innerWidth >= 1024) setOpen(false);
    };
    window.addEventListener("resize", closeOnDesktop);
    return () => window.removeEventListener("resize", closeOnDesktop);
  }, []);

  return (
    <header
      data-breakpoint={screen.ready ? screen.breakpoint : undefined}
      data-orientation={screen.ready ? screen.orientation : undefined}
      className="sticky top-0 z-50 border-b border-neutral-200 bg-white/90 backdrop-blur"
    >
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:h-[4.5rem] lg:px-8">
        <a href="#top" className="flex items-center gap-2.5" aria-label="TixConneckt home">
          <Image
            src="/logo.png"
            alt="TixConneckt logo"
            width={40}
            height={40}
            priority
            className="h-9 w-9 rounded-lg object-cover"
          />
          <span className="text-lg font-bold tracking-tight text-black">
            TixConneckt
          </span>
        </a>

        <nav aria-label="Primary" className="hidden items-center gap-8 lg:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-black transition-colors hover:text-brand-700"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <a
            href="#funding"
            className="rounded-full px-4 py-2 text-sm font-semibold text-black transition-colors hover:text-brand-700"
          >
            Request support
          </a>
          <a
            href="#get-started"
            className="rounded-full bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
          >
            Join free
          </a>
        </div>

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? "Close menu" : "Open menu"}
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-black transition-colors hover:bg-brand-50 lg:hidden"
        >
          {open ? <CloseIcon className="h-6 w-6" /> : <MenuIcon className="h-6 w-6" />}
        </button>
      </div>

      {open ? (
        <div
          id="mobile-menu"
          className="border-t border-neutral-200 bg-white px-4 pt-2 pb-6 sm:px-6 lg:hidden"
        >
          <nav aria-label="Mobile" className="flex flex-col">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="border-b border-neutral-100 py-3.5 text-base font-medium text-black transition-colors last:border-0 hover:text-brand-700"
              >
                {link.label}
              </a>
            ))}
          </nav>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <a
              href="#funding"
              onClick={() => setOpen(false)}
              className="rounded-xl border border-neutral-300 px-5 py-3 text-center text-sm font-semibold text-black transition-colors hover:border-brand-600 hover:text-brand-700"
            >
              Request support
            </a>
            <a
              href="#get-started"
              onClick={() => setOpen(false)}
              className="rounded-xl bg-brand-600 px-5 py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-brand-700"
            >
              Join free
            </a>
          </div>
        </div>
      ) : null}
    </header>
  );
}
