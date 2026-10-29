import Image from "next/image";
import Link from "next/link";
import { ROUTES } from "@/lib/routes";
import { Icon } from "@/components/ui/Icon";

/**
 * Public landing page: describes only the actual digital collaboration
 * service. No invented statistics, testimonials, partner logos, or
 * unsupported claims. Clearly states what is still in development.
 * Rendered at `/` for visitors; account access lives behind its buttons.
 */

const CAPABILITIES = [
  {
    icon: "users",
    title: "Find collaborators",
    text: "Discover people by skills and objectives, send connection requests, and build your network.",
  },
  {
    icon: "diagram-project",
    title: "Share and join digital projects",
    text: "Publish software, web, mobile, AI, or data ideas — or contribute to projects others started.",
  },
  {
    icon: "message",
    title: "Coordinate in groups and chat",
    text: "Create groups, manage memberships, and keep persistent conversations with members.",
  },
  {
    icon: "phone",
    title: "Call one-to-one",
    text: "Start audio or video calls with your direct connections, right from the conversation.",
  },
  {
    icon: "funding",
    title: "Request funding or support",
    text: "Submit funding requests with project context, review agreements, and track decisions.",
  },
  {
    icon: "wallet",
    title: "Track funding transparently",
    text: "Record self-funding and group contributions in an auditable ledger with approvals.",
  },
  {
    icon: "bolt",
    title: "Automate routine actions",
    text: "Schedule reminders, messages, and profile updates that run on the server.",
  },
];

const STEPS = [
  {
    title: "Create your account",
    text: "Register with your email, verify it with a code, and accept the Privacy Policy, Terms, and Agreement.",
  },
  {
    title: "Complete your profile",
    text: "Add your skills, objectives, and field. You get a unique short identifier others use to find you.",
  },
  {
    title: "Get matched",
    text: "Answer the matching questions to surface collaborators with complementary capabilities.",
  },
  {
    title: "Collaborate and fund",
    text: "Connect, chat, call, join groups, develop projects together, and request funding or support.",
  },
];

const AVAILABLE = [
  "Registration, email verification, login with OTP, and password recovery",
  "Profiles with short identifiers, skills, and visibility controls",
  "Matching, connection requests, groups, and persistent chat",
  "One-to-one audio and video calls from direct conversations",
  "Projects with contributions, reactions, and versioned analysis",
  "Funding requests, agreements, wallet ledger, and subscriptions",
  "Scheduled actions, notifications, and email delivery",
];

const IN_DEVELOPMENT = [
  "Muse Spark and Muse Voice integrations run only after the service credentials are configured; until then the app says so instead of simulating results",
  "Group video conferences are not available yet — calls work one-to-one",
  "Payment providers (cards, mobile money, crypto) are not integrated yet, so subscriptions stay pending until an administrator verifies payment",
];

export function LandingPage() {
  return (
    <div className="min-h-screen bg-[#f7f8f6] text-[#14201e]">
      <header className="sticky top-0 z-50 border-b border-[#dfe5e1] bg-[#f7f8f6]/95 backdrop-blur">
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
            <Link href="#platform" className="text-neutral-700 hover:text-[#155e4b]">Platform</Link>
            <Link href="#how-it-works" className="text-neutral-700 hover:text-[#155e4b]">How it works</Link>
            <Link href="#mission" className="text-neutral-700 hover:text-[#155e4b]">Our goal</Link>
          </nav>
          <nav aria-label="Account" className="flex items-center gap-1.5 sm:gap-3">
            <Link
              href={ROUTES.login}
              className="rounded-md px-3 py-2 text-sm font-semibold hover:text-[#155e4b] sm:px-4"
            >
              Sign in
            </Link>
            <Link
              href={ROUTES.register}
              className="rounded-md bg-[#155e4b] px-3 py-2 text-sm font-semibold text-white hover:bg-[#104637] sm:px-4"
            >
              <span className="hidden sm:inline">Create account</span>
              <span className="sm:hidden">Join</span>
            </Link>
          </nav>
        </div>
      </header>

      <main id="top">
        <section className="border-b border-[#dfe5e1] bg-[#eef4ef]">
          <div className="mx-auto w-full max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
            <p className="flex items-start gap-2 text-sm">
              <span aria-hidden="true" className="mt-0.5 text-[#155e4b]">
                <Icon name="circle-info" />
              </span>
              <span>
                <span className="font-semibold">TIXCONNECKT is being built.</span> The core
                collaboration features below work today; integrations marked{" "}
                <span className="font-medium">in development</span> further down this page are not
                operational yet.
              </span>
            </p>
          </div>
        </section>

        <section className="mx-auto grid w-full max-w-7xl items-center gap-12 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:px-8 lg:py-24">
          <div>
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-[#155e4b]">
              A home for digital collaboration
            </p>
            <h1 className="mt-5 max-w-3xl text-4xl font-bold leading-[1.08] sm:text-5xl lg:text-[3.5rem]">
              Turn skills and ideas into work that moves forward.
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-relaxed text-[#4c5a55] sm:text-lg">
              TIXCONNECKT brings people, digital projects, and practical support into one
              collaborative system. Find the right team, do meaningful work together, and make
              progress visible.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href={ROUTES.register}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-[#155e4b] px-6 py-3 text-sm font-semibold text-white hover:bg-[#104637]"
              >
                Start collaborating <span aria-hidden="true">&#8594;</span>
              </Link>
              <Link
                href="#platform"
                className="inline-flex items-center justify-center gap-2 rounded-md border border-[#bdc9c2] px-6 py-3 text-sm font-semibold hover:border-[#155e4b]"
              >
                Explore the platform
              </Link>
            </div>
            <p className="mt-5 text-xs leading-relaxed text-neutral-600">
              Built for individuals, teams, providers, and people backing digital work.
            </p>
          </div>
          <div className="relative overflow-hidden rounded-lg bg-[#172923] p-6 text-white sm:p-8">
            <div className="flex items-center justify-between border-b border-white/15 pb-5">
              <div className="flex items-center gap-3">
                <Image src="/logo.png" alt="" width={44} height={44} className="h-11 w-11 rounded-md" />
                <div>
                  <p className="text-sm font-semibold">One connected workflow</p>
                  <p className="mt-0.5 text-xs text-[#b8c9c1]">From first connection to shared progress</p>
                </div>
              </div>
              <span className="h-2.5 w-2.5 rounded-full bg-[#b8d84b]" aria-hidden="true" />
            </div>
            <ol className="mt-6 space-y-3">
              <li className="flex items-center gap-4 rounded-md border border-white/10 bg-white/[0.06] p-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#dce9b2] text-[#172923]" aria-hidden="true"><Icon name="users" /></span>
                <span><span className="block text-sm font-semibold">Discover people</span><span className="mt-1 block text-xs text-[#b8c9c1]">Match skills, goals, and complementary experience</span></span>
                <span className="ml-auto font-mono text-xs text-[#b8d84b]">01</span>
              </li>
              <li className="flex items-center gap-4 rounded-md border border-white/10 bg-white/[0.06] p-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#f2c3a9] text-[#172923]" aria-hidden="true"><Icon name="diagram-project" /></span>
                <span><span className="block text-sm font-semibold">Build together</span><span className="mt-1 block text-xs text-[#b8c9c1]">Organize projects, groups, conversations, and calls</span></span>
                <span className="ml-auto font-mono text-xs text-[#f2c3a9]">02</span>
              </li>
              <li className="flex items-center gap-4 rounded-md border border-white/10 bg-white/[0.06] p-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#a9d8ce] text-[#172923]" aria-hidden="true"><Icon name="funding" /></span>
                <span><span className="block text-sm font-semibold">Move work forward</span><span className="mt-1 block text-xs text-[#b8c9c1]">Request support and track contributions transparently</span></span>
                <span className="ml-auto font-mono text-xs text-[#a9d8ce]">03</span>
              </li>
            </ol>
            <p className="mt-5 text-xs text-[#b8c9c1]">A practical system for turning collaboration into progress.</p>
          </div>
        </section>

        <section id="platform" aria-label="What you can do" className="border-y border-[#dfe5e1] bg-white">
          <div className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 sm:py-16 lg:px-8">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">What you can do</h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {CAPABILITIES.map((c) => (
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
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">How it works</h2>
          <ol className="mt-8 grid gap-8 md:grid-cols-4 md:gap-6">
            {STEPS.map((step, i) => (
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

        <section id="mission" aria-label="Our goal" className="border-y border-[#dfe5e1] bg-[#e8f0eb]">
          <div className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-14 sm:px-6 sm:py-16 lg:grid-cols-[0.7fr_1.3fr] lg:items-start lg:px-8">
            <div>
              <p className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-[#155e4b]">Our goal</p>
              <h2 className="mt-3 max-w-sm text-2xl font-bold leading-tight sm:text-3xl">Make good digital work easier to start and sustain.</h2>
            </div>
            <div className="max-w-3xl">
              <p className="text-base leading-relaxed text-[#34443e] sm:text-lg">
                Too often, capable people, promising ideas, and useful support exist in separate
                places. TIXCONNECKT is being built to bring them together: help people find one
                another, form accountable teams, coordinate the work, and see how contributions
                and funding move a project forward.
              </p>
              <p className="mt-4 text-sm leading-relaxed text-[#52615b]">
                The platform supports individuals and groups while keeping access, decisions, and
                financial records tied to clear user roles and permissions.
              </p>
            </div>
          </div>
        </section>

        <section
          aria-label="Availability"
          className="border-y border-[#dfe5e1] bg-white"
        >
          <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-14 sm:px-6 sm:py-16 lg:grid-cols-2 lg:px-8">
            <div>
              <h2 className="flex items-center gap-2 text-xl font-bold">
                <Icon name="check" /> Available now
              </h2>
              <ul className="mt-4 space-y-2.5">
                {AVAILABLE.map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm text-neutral-800">
                    <span aria-hidden="true" className="mt-0.5">
                      <Icon name="check" />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h2 className="flex items-center gap-2 text-xl font-bold">
                <Icon name="hourglass" /> In development
              </h2>
              <ul className="mt-4 space-y-2.5">
                {IN_DEVELOPMENT.map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm text-neutral-800">
                    <span aria-hidden="true" className="mt-0.5">
                      <Icon name="hourglass" />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section aria-label="Privacy and terms" className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 sm:py-16 lg:px-8">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Your data, your control</h2>
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

      <footer className="bg-[#172923] text-white">
        <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr] lg:px-8">
          <div>
            <Link href="#top" className="flex w-fit items-center gap-3">
              <Image src="/logo.png" alt="" width={40} height={40} className="h-10 w-10 rounded-md" />
              <span className="text-base font-bold">TIXCONNECKT</span>
            </Link>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-[#c0cdc7]">
              A digital collaboration platform for finding people, building projects, and moving
              useful work forward together.
            </p>
          </div>
          <nav aria-label="Platform links">
            <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-[#b8d84b]">Platform</h2>
            <ul className="mt-4 space-y-3 text-sm text-[#e2e9e5]">
              <li><Link href="#platform" className="hover:text-white">What you can do</Link></li>
              <li><Link href="#how-it-works" className="hover:text-white">How it works</Link></li>
              <li><Link href="#mission" className="hover:text-white">Our goal</Link></li>
            </ul>
          </nav>
          <nav aria-label="Account links">
            <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-[#b8d84b]">Your account</h2>
            <ul className="mt-4 space-y-3 text-sm text-[#e2e9e5]">
              <li><Link href={ROUTES.register} className="hover:text-white">Create account</Link></li>
              <li><Link href={ROUTES.login} className="hover:text-white">Sign in</Link></li>
            </ul>
          </nav>
          <nav aria-label="Legal links">
            <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-[#b8d84b]">Legal</h2>
            <ul className="mt-4 space-y-3 text-sm text-[#e2e9e5]">
              <li><Link href={ROUTES.legalPrivacy} className="hover:text-white">Privacy policy</Link></li>
              <li><Link href={ROUTES.legalTerms} className="hover:text-white">Terms of service</Link></li>
              <li><Link href={ROUTES.legalAgreement} className="hover:text-white">User agreement</Link></li>
            </ul>
          </nav>
        </div>
        <div className="border-t border-white/15">
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-2 px-4 py-4 text-xs text-[#c0cdc7] sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
            <p>TIXCONNECKT is in active development. Feature availability is stated on this page.</p>
            <Link href="#top" className="font-medium text-white hover:text-[#b8d84b]">Back to top <span aria-hidden="true">&#8593;</span></Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
