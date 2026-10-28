import SectionHeading from "./SectionHeading";
import {
  BookIcon,
  BriefcaseIcon,
  BuildingIcon,
  CapIcon,
  CheckIcon,
} from "./icons";

const AUDIENCES = [
  {
    index: "01",
    icon: BookIcon,
    tag: "UNDERGRADS",
    title: "Undergraduates",
    description: "Turn coursework into shipped work before you graduate.",
    points: [
      "Find teammates for hackathons & side projects",
      "Get mentored by graduates in your field",
      "Discover internships posted by alumni",
    ],
  },
  {
    index: "02",
    icon: CapIcon,
    tag: "ALUMNI",
    title: "Graduates & alumni",
    description: "Multiply what your degree started.",
    points: [
      "Mentor the next cohort in your discipline",
      "Hire or co-found with vetted talent",
      "Fund ideas you wish existed when you studied",
    ],
  },
  {
    index: "03",
    icon: BuildingIcon,
    tag: "HIGHER ED",
    title: "Universities & colleges",
    description: "Bring your whole institution onto one hub.",
    points: [
      "Run clubs, labs & incubators in one place",
      "Post research & capstone opportunities",
      "Track outcomes that actually matter",
    ],
  },
  {
    index: "04",
    icon: BriefcaseIcon,
    tag: "SCHOOLS & TRADE",
    title: "Schools & vocational",
    description: "Start early, aim higher — whatever your path.",
    points: [
      "Skill paths for secondary & trade learners",
      "Early mentor matching by interest",
      "Micro-support for tools, fees & transport",
    ],
  },
];

export default function Community() {
  return (
    <section id="community" className="scroll-mt-24 bg-white">
      <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
        <SectionHeading
          eyebrow="Community"
          title="One network for every level of learning"
          description="No one builds alone here. Whatever stage of education you're at, there's a circle waiting — and a bigger thing to make together."
        />
        <div className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-200 sm:mt-12 md:grid-cols-2">
          {AUDIENCES.map((audience) => (
            <article key={audience.index} className="bg-white p-6 sm:p-8">
              <div className="flex items-center justify-between gap-3">
                <audience.icon className="h-7 w-7 text-brand-600" />
                <p className="font-mono text-xs font-medium tracking-[0.16em] text-neutral-600">
                  {audience.index} · {audience.tag}
                </p>
              </div>
              <h3 className="mt-5 text-xl font-bold tracking-tight text-black sm:text-2xl">
                {audience.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-700 sm:text-base">
                {audience.description}
              </p>
              <ul className="mt-5 space-y-2.5">
                {audience.points.map((point) => (
                  <li key={point} className="flex items-start gap-2.5 text-sm text-black">
                    <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                    {point}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
