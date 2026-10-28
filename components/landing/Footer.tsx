import Image from "next/image";
import CurrentYear from "./CurrentYear";
import {
  ArrowUpRightIcon,
  GitHubIcon,
  LinkedInIcon,
  XSocialIcon,
  YouTubeIcon,
} from "./icons";

const LINK_GROUPS = [
  {
    title: "Platform",
    links: [
      { label: "Community", href: "#community" },
      { label: "Opportunities", href: "#opportunities" },
      { label: "How it works", href: "#how-it-works" },
      { label: "Get started", href: "#get-started" },
    ],
  },
  {
    title: "Funding",
    links: [
      { label: "Education loans", href: "#funding" },
      { label: "Project grants", href: "#funding" },
      { label: "Emergency support", href: "#funding" },
      { label: "Request support", href: "#funding" },
    ],
  },
  {
    title: "Network",
    links: [
      { label: "Undergraduates", href: "#community" },
      { label: "Graduates & alumni", href: "#community" },
      { label: "Institutions", href: "#community" },
      { label: "Back to top", href: "#top" },
    ],
  },
];

const SOCIALS = [
  { label: "TixConneckt on X", icon: XSocialIcon, href: "#top" },
  { label: "TixConneckt on LinkedIn", icon: LinkedInIcon, href: "#top" },
  { label: "TixConneckt on GitHub", icon: GitHubIcon, href: "#top" },
  { label: "TixConneckt on YouTube", icon: YouTubeIcon, href: "#top" },
];

export default function Footer() {
  return (
    <footer className="border-t border-neutral-200 bg-white">
      <div className="mx-auto w-full max-w-7xl px-4 pt-14 pb-8 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[1.1fr_1.9fr] lg:gap-16">
          <div>
            <a href="#top" className="flex items-center gap-2.5" aria-label="TixConneckt home">
              <Image
                src="/logo.png"
                alt="TixConneckt logo"
                width={40}
                height={40}
                className="h-9 w-9 rounded-lg object-cover"
              />
              <span className="text-lg font-bold tracking-tight text-black">
                TixConneckt
              </span>
            </a>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-neutral-700">
              The network where graduates, undergraduates, and learners from
              higher and lower education connect — and create something big,
              together.
            </p>
            <div className="mt-5 flex gap-2">
              {SOCIALS.map((social) => (
                <a
                  key={social.label}
                  href={social.href}
                  aria-label={social.label}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-neutral-300 text-black transition-colors hover:border-brand-600 hover:text-brand-700"
                >
                  <social.icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          </div>
          <nav
            aria-label="Footer"
            className="grid grid-cols-2 gap-8 sm:grid-cols-3"
          >
            {LINK_GROUPS.map((group) => (
              <div key={group.title}>
                <p className="font-mono text-xs font-semibold tracking-[0.16em] text-neutral-600 uppercase">
                  {group.title}
                </p>
                <ul className="mt-4 space-y-3">
                  {group.links.map((link) => (
                    <li key={link.label}>
                      <a
                        href={link.href}
                        className="group inline-flex items-center gap-1 text-sm font-medium text-black transition-colors hover:text-brand-700"
                      >
                        {link.label}
                        <ArrowUpRightIcon className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>
        <div className="mt-12 flex flex-col gap-3 border-t border-neutral-200 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-black">
            © <CurrentYear /> TixConneckt. All rights reserved.
          </p>
          <p className="flex items-center gap-2 font-mono text-xs tracking-[0.14em] text-neutral-600 uppercase">
            <span
              aria-hidden="true"
              className="inline-block h-2 w-2 rounded-full bg-brand-600"
            />
            Made for learners everywhere
          </p>
        </div>
      </div>
    </footer>
  );
}
