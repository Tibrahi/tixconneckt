import Image from "next/image";
import Link from "next/link";
import { ROUTES } from "@/lib/routes";
import {
  HOMEPAGE_CAPABILITIES,
  HOMEPAGE_FOOTER_GROUPS,
  HOMEPAGE_NAV_LINKS,
  HOMEPAGE_SECTIONS,
  HOMEPAGE_STEPS,
  type HomepageSectionId,
} from "@/lib/site-content";
import { Icon } from "@/components/ui/Icon";

/**
 * Public landing page: describes only the actual digital collaboration
 * service. No invented statistics, testimonials, partner logos, or
 * unsupported claims. Clearly states what is still in development.
 * Rendered at `/` for visitors; account access lives behind its buttons.
 *
 * All public copy comes from the reviewed content module
 * (`lib/site-content.ts`); this component only lays it out.
 */

function sectionHeading(id: HomepageSectionId): string {
  return HOMEPAGE_SECTIONS.find((section) => section.id === id)?.heading ?? "";
}

export function LandingPage() {
  return (
    <div className="min-h-screen bg-[#f8fbff] text-[#172033]">
      <header className="sticky top-0 z-50 border-b border-[#dbeafe] bg-[#f8fbff]/95 backdrop-blur">
        <div className="mx-auto flex h-[4.5rem] w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="#top" className="flex items-center gap-2.5" aria-label="TIXCONNECKT home">
            <Image
              src="/logo.png"
              alt="TIXCONNECKT logo"
              width={40}
              height={40}
              priority
              className="h-10 w-10 rounded-lg object-cover"
            />
            <span className="text-base font-bold tracking-tight sm:text-lg">TIXCONNECKT</span>
          </Link>
          <nav aria-label="Main" className="hidden items-center gap-7 text-sm font-medium lg:flex">
            {HOMEPAGE_NAV_LINKS.map((link) => (
              <Link key={link.href} href={link.href} className="text-neutral-700 hover:text-[#2563eb]">
                {link.label}
              </Link>
            ))}
          </nav>
          <nav aria-label="Account" className="flex items-center gap-1.5 sm:gap-3">
            <Link
              href={ROUTES.login}
              className="rounded-md px-3 py-2 text-sm font-semibold hover:text-[#2563eb] sm:px-4"
            >
              Sign in
            </Link>
            <Link
              href={ROUTES.register}
              className="rounded-md bg-[#2563eb] px-3 py-2 text-sm font-semibold text-white hover:bg-[#1e40af] sm:px-4"
            >
              <span className="hidden sm:inline">Create account</span>
              <span className="sm:hidden">Join</span>
            </Link>
          </nav>
        </div>
      </header>

      <main id="top">
        <section className="mx-auto grid w-full max-w-7xl items-center gap-12 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:px-8 lg:py-24">
          <div>
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-[#2563eb]">
              A home for digital collaboration
            </p>
            <h1 className="mt-5 max-w-3xl text-4xl font-bold leading-[1.08] sm:text-5xl lg:text-[3.5rem]">
              Turn skills and ideas into work that moves forward.
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-relaxed text-[#526078] sm:text-lg">
              TIXCONNECKT brings people, digital projects, and practical support into one
              collaborative system. Find the right team, do meaningful work together, and make
              progress visible.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href={ROUTES.register}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-[#2563eb] px-6 py-3 text-sm font-semibold text-white hover:bg-[#1e40af]"
              >
                Start collaborating <span aria-hidden="true">&#8594;</span>
              </Link>
              <Link
                href="#platform"
                className="inline-flex items-center justify-center gap-2 rounded-md border border-[#bfdbfe] px-6 py-3 text-sm font-semibold hover:border-[#2563eb]"
              >
                Explore the platform
              </Link>
            </div>
            <p className="mt-5 text-xs leading-relaxed text-neutral-600">
              Built for individuals, teams, providers, and people backing digital work.
            </p>
          </div>
          <div className="relative overflow-hidden rounded-lg bg-[#172554] p-6 text-white sm:p-8">
            <div className="flex items-center justify-between border-b border-white/15 pb-5">
              <div className="flex items-center gap-3">
                <Image src="/logo.png" alt="" width={44} height={44} className="h-11 w-11 rounded-md" />
                <div>
                  <p className="text-sm font-semibold">One connected workflow</p>
                  <p className="mt-0.5 text-xs text-[#bfdbfe]">From first connection to shared progress</p>
                </div>
              </div>
              <span className="h-2.5 w-2.5 rounded-full bg-[#93c5fd]" aria-hidden="true" />
            </div>
            <ol className="mt-6 space-y-3">
              <li className="flex items-center gap-4 rounded-md border border-white/10 bg-white/[0.06] p-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#dbeafe] text-[#172554]" aria-hidden="true"><Icon name="users" /></span>
                <span><span className="block text-sm font-semibold">Discover people</span><span className="mt-1 block text-xs text-[#bfdbfe]">Match skills, goals, and complementary experience</span></span>
                <span className="ml-auto font-mono text-xs text-[#93c5fd]">01</span>
              </li>
              <li className="flex items-center gap-4 rounded-md border border-white/10 bg-white/[0.06] p-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#bfdbfe] text-[#172554]" aria-hidden="true"><Icon name="diagram-project" /></span>
                <span><span className="block text-sm font-semibold">Build together</span><span className="mt-1 block text-xs text-[#bfdbfe]">Organize projects, groups, conversations, and calls</span></span>
                <span className="ml-auto font-mono text-xs text-[#bfdbfe]">02</span>
              </li>
              <li className="flex items-center gap-4 rounded-md border border-white/10 bg-white/[0.06] p-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#93c5fd] text-[#172554]" aria-hidden="true"><Icon name="funding" /></span>
                <span><span className="block text-sm font-semibold">Move work forward</span><span className="mt-1 block text-xs text-[#bfdbfe]">Request support and track contributions transparently</span></span>
                <span className="ml-auto font-mono text-xs text-[#93c5fd]">03</span>
              </li>
            </ol>
            <p className="mt-5 text-xs text-[#bfdbfe]">A practical system for turning collaboration into progress.</p>
          </div>
        </section>

        <section id="platform" aria-label="What you can do" className="border-y border-[#dbeafe] bg-white">
          <div className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 sm:py-16 lg:px-8">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{sectionHeading("platform")}</h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {HOMEPAGE_CAPABILITIES.map((c) => (
                <article key={c.title} className="rounded-lg border border-neutral-200 p-5">
                  <p className="text-xl" aria-hidden="true">
                    <Icon name={c.icon} />
                  </p>
                  <h3 className="mt-3 text-base font-bold">{c.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-neutral-700">{c.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="how-it-works" aria-label="How it works" className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 sm:py-16 lg:px-8">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{sectionHeading("how-it-works")}</h2>
          <ol className="mt-8 grid gap-8 md:grid-cols-4 md:gap-6">
            {HOMEPAGE_STEPS.map((step, i) => (
              <li key={step.title} className="border-t-2 border-brand-600 pt-5">
                <p className="font-mono text-sm font-semibold tracking-[0.16em] text-brand-700">
                  STEP 0{i + 1}
                </p>
                <h3 className="mt-2 text-lg font-bold">{step.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-neutral-700">{step.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="mission" aria-label="Our goal" className="border-y border-[#dbeafe] bg-[#eff6ff]">
          <div className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-14 sm:px-6 sm:py-16 lg:grid-cols-[0.7fr_1.3fr] lg:items-start lg:px-8">
            <div>
              <p className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-[#2563eb]">Our goal</p>
              <h2 className="mt-3 max-w-sm text-2xl font-bold leading-tight sm:text-3xl">{sectionHeading("mission")}</h2>
            </div>
            <div className="max-w-3xl">
              <p className="text-base leading-relaxed text-[#334155] sm:text-lg">
                Too often, capable people, promising ideas, and useful support exist in separate
                places. TIXCONNECKT is being built to bring them together: help people find one
                another, form accountable teams, coordinate the work, and see how contributions
                and funding move a project forward.
              </p>
              <p className="mt-4 text-sm leading-relaxed text-[#526078]">
                The platform supports individuals and groups while keeping access, decisions, and
                financial records tied to clear user roles and permissions.
              </p>
            </div>
          </div>
        </section>

        <section id="privacy" aria-label="Privacy and terms" className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 sm:py-16 lg:px-8">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{sectionHeading("privacy")}</h2>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-neutral-700 sm:text-base">
            Your profile, projects, messages, and financial records are protected by server-side
            authorization. You can manage visibility in settings, and request deactivation or
            deletion of your account. Read the documents before registering:
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href={ROUTES.legalPrivacy}
              className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-semibold hover:border-black"
            >
              Privacy Policy
            </Link>
            <Link
              href={ROUTES.legalTerms}
              className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-semibold hover:border-black"
            >
              Terms of Service
            </Link>
            <Link
              href={ROUTES.legalAgreement}
              className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-semibold hover:border-black"
            >
              User Agreement
            </Link>
          </div>
        </section>
      </main>

      <footer className="bg-[#172554] text-white">
        <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr] lg:px-8">
          <div>
            <Link href="#top" className="flex w-fit items-center gap-3">
              <Image src="/logo.png" alt="" width={40} height={40} className="h-10 w-10 rounded-md" />
              <span className="text-base font-bold">TIXCONNECKT</span>
            </Link>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-[#bfdbfe]">
              A digital collaboration platform for finding people, building projects, and moving
              useful work forward together.
            </p>
          </div>
          {HOMEPAGE_FOOTER_GROUPS.map((group) => (
            <nav key={group.heading} aria-label={`${group.heading} links`}>
              <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-[#93c5fd]">{group.heading}</h2>
              <ul className="mt-4 space-y-3 text-sm text-[#dbeafe]">
                {group.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="hover:text-white">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="border-t border-white/15">
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-2 px-4 py-4 text-xs text-[#bfdbfe] sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
            <p>TIXCONNECKT is in active development. Feature availability is stated on this page.</p>
            <Link href="#top" className="font-medium text-white hover:text-[#93c5fd]">Back to top <span aria-hidden="true">&#8593;</span></Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
