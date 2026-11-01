import Image from "next/image";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { ROUTES } from "@/lib/routes";
import {
  HOMEPAGE_CAPABILITIES,
  HOMEPAGE_FOOTER_GROUPS,
  HOMEPAGE_NAV_LINKS,
  HOMEPAGE_SECTIONS,
  type HomepageSectionId,
} from "@/lib/site-content";

function sectionHeading(id: HomepageSectionId): string {
  return HOMEPAGE_SECTIONS.find((section) => section.id === id)?.heading ?? "";
}

const AUDIENCES = [
  {
    icon: "user",
    title: "Independent contributors",
    text: "People with a skill, an idea, or time to contribute can make their objectives visible and find others to work with.",
  },
  {
    icon: "building",
    title: "Universities and public organizations",
    text: "Institutions can establish an organization presence and participate alongside people and projects.",
  },
  {
    icon: "funding",
    title: "Funding and support providers",
    text: "Providers can review eligible requests, communicate decisions, and keep their project responses connected to the work.",
  },
  {
    icon: "user-group",
    title: "Groups and project teams",
    text: "Teams can coordinate membership, shared conversations, project documents, approvals, and contribution records.",
  },
];

const FLOW = [
  { number: "01", icon: "user-plus", title: "Discover", text: "Profiles and objectives help people find relevant collaborators." },
  { number: "02", icon: "diagram-project", title: "Shape the work", text: "A project space keeps ideas, documents, feedback, and revisions together." },
  { number: "03", icon: "users", title: "Work as a team", text: "Groups and conversations make coordination part of the project journey." },
  { number: "04", icon: "file-signature", title: "Coordinate support", text: "Requests, agreements, decisions, and contribution records stay connected to the project." },
];

export function LandingPage() {
  return (
    <div id="top" className="min-h-screen overflow-hidden bg-white text-[#172033]">
      <header className="sticky top-0 z-50 border-b border-blue-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-[4.5rem] w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="#top" className="flex items-center gap-3" aria-label="TIXCONNECKT home">
            <Image src="/logo.png" alt="" width={40} height={40} priority className="h-10 w-10 rounded-lg object-cover" />
            <span className="text-base font-bold tracking-tight sm:text-lg">TIXCONNECKT</span>
          </Link>
          <nav aria-label="Main navigation" className="hidden items-center gap-7 text-sm font-medium lg:flex">
            {HOMEPAGE_NAV_LINKS.map((item) => (
              <Link key={item.href} href={item.href} className="text-slate-600 transition hover:text-blue-700">{item.label}</Link>
            ))}
          </nav>
          <nav aria-label="Account" className="flex items-center gap-2">
            <Link href={ROUTES.login} className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 hover:text-blue-700 sm:px-4">Sign in</Link>
            <Link href={ROUTES.register} className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">
              <span className="hidden sm:inline">Create an account</span><span className="sm:hidden">Join</span>
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="relative isolate border-b border-blue-100 bg-gradient-to-b from-blue-50/80 via-white to-white">
          <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden="true">
            <div className="absolute -right-36 -top-28 h-[30rem] w-[30rem] rounded-full bg-blue-100/70 blur-3xl" />
            <div className="absolute -left-48 top-72 h-80 w-80 rounded-full bg-sky-100/60 blur-3xl" />
          </div>
          <div className="mx-auto grid w-full max-w-7xl items-center gap-14 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[1.02fr_0.98fr] lg:gap-16 lg:px-8 lg:py-28">
            <div className="relative z-10">
              <p className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white/80 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-blue-800">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-600" aria-hidden="true" /> People · projects · practical support
              </p>
              <h1 className="mt-7 max-w-3xl text-4xl font-semibold leading-[1.08] tracking-[-0.04em] text-slate-950 sm:text-5xl lg:text-[4.15rem]">
                Turn shared ambition into work that moves forward.
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">
                TIXCONNECKT brings people, teams, institutions, and support providers into a connected place to discover one another, build digital projects, coordinate decisions, and keep progress together.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href={ROUTES.register} className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-700 px-6 py-3.5 text-sm font-semibold text-white shadow-md shadow-blue-900/10 transition hover:bg-blue-800">
                  Find your place <span aria-hidden="true">→</span>
                </Link>
                <Link href="#platform" className="inline-flex items-center justify-center gap-2 rounded-lg border border-blue-200 bg-white px-6 py-3.5 text-sm font-semibold text-slate-800 transition hover:border-blue-400 hover:text-blue-800">
                  Explore the platform <span aria-hidden="true">↓</span>
                </Link>
              </div>
              <p className="mt-5 text-xs leading-5 text-slate-500">For individual contributors, organizations, project teams, and funding or support providers.</p>
            </div>

            <div className="relative mx-auto w-full max-w-xl" aria-label="Illustration of connected project work">
              <div className="absolute -inset-5 rounded-[2rem] bg-gradient-to-br from-blue-100 via-white to-sky-100 blur-xl" aria-hidden="true" />
              <div className="relative rounded-2xl border border-blue-100 bg-white p-4 shadow-[0_30px_90px_-35px_rgba(30,64,175,0.35)] sm:p-6">
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                  <div className="flex items-center gap-3">
                    <Image src="/logo.png" alt="" width={38} height={38} className="h-10 w-10 rounded-lg" />
                    <div><p className="text-sm font-semibold text-slate-900">A shared project journey</p><p className="mt-0.5 text-xs text-slate-500">People connected to the work</p></div>
                  </div>
                  <span className="rounded-full bg-blue-50 px-3 py-1 text-[11px] font-semibold text-blue-800">Workspace</span>
                </div>
                <div className="relative py-5 sm:py-6">
                  <div className="absolute bottom-12 left-1/2 top-12 hidden w-px -translate-x-1/2 bg-gradient-to-b from-blue-200 via-blue-400 to-blue-200 sm:block" aria-hidden="true" />
                  <div className="space-y-3 sm:space-y-4">
                    <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-3 shadow-sm sm:w-[86%]">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700"><Icon name="users" /></span>
                      <div className="min-w-0 flex-1"><p className="text-sm font-semibold">People with complementary skills</p><p className="text-xs text-slate-500">Profiles · discovery · connections</p></div>
                      <span className="text-blue-600" aria-hidden="true"><Icon name="arrow-right" /></span>
                    </div>
                    <div className="ml-auto flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50/70 p-3 shadow-sm sm:w-[91%]">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-blue-700"><Icon name="diagram-project" /></span>
                      <div className="min-w-0 flex-1"><p className="text-sm font-semibold">One place to develop the idea</p><p className="text-xs text-slate-600">Project · documents · feedback</p></div>
                      <span className="text-blue-600" aria-hidden="true"><Icon name="arrow-right" /></span>
                    </div>
                    <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-3 shadow-sm sm:w-[86%]">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-blue-700"><Icon name="people-group" /></span>
                      <div className="min-w-0 flex-1"><p className="text-sm font-semibold">A team that can coordinate</p><p className="text-xs text-slate-500">Groups · conversations · decisions</p></div>
                      <span className="text-blue-600" aria-hidden="true"><Icon name="arrow-right" /></span>
                    </div>
                    <div className="ml-auto flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-3 shadow-sm sm:w-[91%]">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-800"><Icon name="file-signature" /></span>
                      <div className="min-w-0 flex-1"><p className="text-sm font-semibold">Support tied to real project context</p><p className="text-xs text-slate-500">Requests · agreements · contributions</p></div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 border-t border-slate-100 pt-4 text-xs text-slate-500"><Icon name="lock" /><span>Shared work with clear roles and visibility</span></div>
              </div>
            </div>
          </div>
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-8 gap-y-2 px-4 pb-8 text-xs font-medium uppercase tracking-[0.12em] text-slate-500 sm:px-6 lg:px-8">
            <span>Individual contributors</span><span className="hidden h-1 w-1 rounded-full bg-blue-300 sm:block" aria-hidden="true" />
            <span>Institutions</span><span className="hidden h-1 w-1 rounded-full bg-blue-300 sm:block" aria-hidden="true" />
            <span>Project teams</span><span className="hidden h-1 w-1 rounded-full bg-blue-300 sm:block" aria-hidden="true" />
            <span>Funding and support providers</span>
          </div>
        </section>

        <section id="platform" className="scroll-mt-24 py-20 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">The platform</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">{sectionHeading("platform")}</h2>
              <p className="mt-4 text-base leading-7 text-slate-600">Bring the relationships, shared work, communication, and support around a project into a journey people can follow.</p>
            </div>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {HOMEPAGE_CAPABILITIES.map((capability, index) => (
                <article key={capability.title} className="group rounded-xl border border-slate-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-lg hover:shadow-blue-950/5">
                  <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-50 text-lg text-blue-700 transition group-hover:bg-blue-700 group-hover:text-white"><Icon name={capability.icon} /></span>
                  <p className="mt-5 font-mono text-[11px] font-semibold tracking-[0.12em] text-blue-700">0{index + 1}</p>
                  <h3 className="mt-2 text-base font-semibold text-slate-900">{capability.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{capability.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="people" className="scroll-mt-24 border-y border-blue-100 bg-slate-50 py-20 sm:py-24">
          <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-[0.72fr_1.28fr] lg:px-8">
            <div className="max-w-md">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">Who it serves</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">{sectionHeading("people")}</h2>
              <p className="mt-4 text-base leading-7 text-slate-600">Different roles contribute in different ways. TIXCONNECKT connects those contributions around shared work.</p>
              <Link href={ROUTES.register} className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-blue-700 hover:text-blue-900">Choose your account type <span aria-hidden="true">→</span></Link>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {AUDIENCES.map((audience) => (
                <article key={audience.title} className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-700"><Icon name={audience.icon} /></span>
                  <h3 className="mt-4 text-base font-semibold text-slate-900">{audience.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{audience.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="workflows" className="scroll-mt-24 py-20 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
              <div className="max-w-2xl">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">How work moves</p>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">{sectionHeading("workflows")}</h2>
              </div>
              <p className="max-w-md text-sm leading-6 text-slate-600">Keep the path from discovering people to coordinating support understandable for everyone involved.</p>
            </div>
            <ol className="mt-12 grid gap-0 overflow-hidden rounded-2xl border border-blue-100 bg-blue-50/60 md:grid-cols-2 xl:grid-cols-4">
              {FLOW.map((step, index) => (
                <li key={step.number} className={`relative p-6 sm:p-7 ${index ? "border-t border-blue-100 md:border-t-0 md:border-l" : ""}`}>
                  <div className="flex items-center justify-between"><span className="text-sm font-mono font-semibold text-blue-700">{step.number}</span><Icon name={step.icon} /></div>
                  <h3 className="mt-8 text-lg font-semibold text-slate-900">{step.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{step.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="border-y border-blue-100 bg-[#102552] py-20 text-white sm:py-24">
          <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-[0.75fr_1.25fr] lg:px-8">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-200">Designed around real work</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Good work needs more than a place to post an idea.</h2>
            </div>
            <div className="max-w-3xl space-y-5 text-base leading-7 text-blue-50/90">
              <p>It needs the right people, a shared space to develop the work, a way to make decisions, and a clear view of the support and contributions around it.</p>
              <p>TIXCONNECKT brings these parts together so individuals, groups, institutions, and providers can take part in a common project journey.</p>
              <Link href={ROUTES.register} className="inline-flex items-center gap-2 rounded-lg bg-white px-5 py-3 text-sm font-semibold text-blue-900 transition hover:bg-blue-50">Start with your role <span aria-hidden="true">→</span></Link>
            </div>
          </div>
        </section>

        <section id="mission" className="scroll-mt-24 py-20 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">Our purpose</p>
                <h2 className="mt-3 text-3xl font-semibold leading-tight tracking-tight text-slate-950 sm:text-4xl">{sectionHeading("mission")}</h2>
              </div>
              <div className="grid gap-8 sm:grid-cols-2">
                <div><span className="text-blue-700"><Icon name="lightbulb" /></span><h3 className="mt-3 font-semibold text-slate-900">Make the next step clearer</h3><p className="mt-2 text-sm leading-6 text-slate-600">Profiles, projects, requests, and decisions stay linked to the people and teams responsible for them.</p></div>
                <div><span className="text-blue-700"><Icon name="shield-halved" /></span><h3 className="mt-3 font-semibold text-slate-900">Keep participation accountable</h3><p className="mt-2 text-sm leading-6 text-slate-600">Membership, visibility, approvals, and financial records follow the relevant account and project relationships.</p></div>
              </div>
            </div>
          </div>
        </section>

        <section id="privacy" className="scroll-mt-24 border-t border-slate-200 bg-slate-50 py-16 sm:py-20">
          <div className="mx-auto flex max-w-7xl flex-col justify-between gap-8 px-4 sm:px-6 lg:flex-row lg:items-center lg:px-8">
            <div className="max-w-2xl"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">Your account</p><h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">{sectionHeading("privacy")}</h2><p className="mt-3 text-sm leading-6 text-slate-600">Choose how to present your profile, work with the people and groups you belong to, and review the policies that govern participation.</p></div>
            <div className="flex shrink-0 flex-wrap gap-3">
              <Link href={ROUTES.legalPrivacy} className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:border-blue-400">Privacy policy</Link>
              <Link href={ROUTES.legalTerms} className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:border-blue-400">Terms</Link>
              <Link href={ROUTES.legalAgreement} className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:border-blue-400">User agreement</Link>
            </div>
          </div>
        </section>

        <section className="bg-white py-16 sm:py-20">
          <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-8 rounded-2xl bg-blue-700 px-6 py-10 text-white sm:px-10 sm:py-12 lg:flex-row lg:items-center">
            <div className="max-w-2xl"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-100">Make a start</p><h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Bring your skills, your team, or your project into the conversation.</h2></div>
            <div className="flex w-full shrink-0 flex-col gap-3 sm:w-auto sm:flex-row">
              <Link href={ROUTES.register} className="inline-flex justify-center rounded-lg bg-white px-5 py-3 text-sm font-semibold text-blue-800 hover:bg-blue-50">Create an account</Link>
              <Link href={ROUTES.login} className="inline-flex justify-center rounded-lg border border-white/40 px-5 py-3 text-sm font-semibold text-white hover:bg-white/10">Sign in</Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-blue-100 bg-white">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr] lg:px-8">
          <div>
            <Link href="#top" className="flex w-fit items-center gap-3"><Image src="/logo.png" alt="" width={40} height={40} className="h-10 w-10 rounded-lg" /><span className="font-bold text-slate-900">TIXCONNECKT</span></Link>
            <p className="mt-4 max-w-sm text-sm leading-6 text-slate-600">A shared place for people to find collaborators, develop digital projects, and coordinate practical support.</p>
          </div>
          {HOMEPAGE_FOOTER_GROUPS.map((group) => (
            <nav key={group.heading} aria-label={`${group.heading} links`}>
              <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{group.heading}</h2>
              <ul className="mt-4 space-y-3 text-sm text-slate-600">{group.links.map((item) => <li key={item.href}><Link href={item.href} className="transition hover:text-blue-700">{item.label}</Link></li>)}</ul>
            </nav>
          ))}
        </div>
        <div className="border-t border-slate-100"><div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-4 text-xs text-slate-500 sm:flex-row sm:justify-between sm:px-6 lg:px-8"><p>People and projects, connected.</p><Link href="#top" className="font-medium text-blue-700 hover:underline">Back to top ↑</Link></div></div>
      </footer>
    </div>
  );
}
