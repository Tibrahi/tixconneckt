import SectionHeading from "./SectionHeading";
import { ArrowUpRightIcon } from "./icons";

const OPPORTUNITIES = [
  {
    index: "01",
    title: "Find co-builders",
    description:
      "Match with learners whose skills complete yours — designers, developers, storytellers, organizers.",
    tags: ["MATCHING", "TEAMS"],
  },
  {
    index: "02",
    title: "Join funded projects",
    description:
      "Plug into real builds with real budgets: campus startups, research sprints, community programs.",
    tags: ["PROJECTS", "STIPENDS"],
  },
  {
    index: "03",
    title: "Get mentored",
    description:
      "Book office hours with graduates and professionals who have walked your exact road.",
    tags: ["MENTORSHIP", "OFFICE HOURS"],
  },
  {
    index: "04",
    title: "Showcase & get hired",
    description:
      "Turn everything you ship into a living portfolio that employers and co-founders can see.",
    tags: ["PORTFOLIO", "JOBS"],
  },
];

export default function Opportunities() {
  return (
    <section id="opportunities" className="scroll-mt-24 bg-white">
      <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
        <SectionHeading
          eyebrow="Opportunities"
          title="Four ways to create something big"
          description="Connection is the starting point. Here's what the network helps you do next."
        />
        <div className="mt-10 divide-y divide-neutral-200 border-y border-neutral-200 sm:mt-12">
          {OPPORTUNITIES.map((item) => (
            <a
              key={item.index}
              href="#get-started"
              className="-mx-4 grid gap-3 rounded-lg px-4 py-6 transition-colors hover:bg-brand-50/70 sm:py-7 md:grid-cols-[3.5rem_1fr_auto] md:items-center md:gap-6"
            >
              <p className="font-mono text-sm font-semibold text-brand-700">
                {item.index}
              </p>
              <div>
                <h3 className="text-lg font-bold tracking-tight text-black sm:text-xl">
                  {item.title}
                </h3>
                <p className="mt-1 max-w-2xl text-sm leading-relaxed text-neutral-700 sm:text-base">
                  {item.description}
                </p>
                <div className="mt-3 flex flex-wrap gap-2 md:hidden">
                  {item.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-neutral-300 px-2.5 py-1 font-mono text-[10px] font-medium tracking-widest text-black"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="hidden gap-2 md:flex">
                  {item.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-neutral-300 px-2.5 py-1 font-mono text-[10px] font-medium tracking-widest text-black"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <ArrowUpRightIcon className="h-5 w-5 shrink-0 text-brand-600" />
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
