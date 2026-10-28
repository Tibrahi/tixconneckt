import SectionHeading from "./SectionHeading";

const STEPS = [
  {
    index: "01",
    title: "Create your profile",
    description:
      "Tell the network your level, skills, and what you want to build — it takes three minutes.",
  },
  {
    index: "02",
    title: "Match & collaborate",
    description:
      "Get matched with people, projects, clubs, and mentors that fit your goals and schedule.",
  },
  {
    index: "03",
    title: "Launch & get funded",
    description:
      "Ship your work, showcase it to the network, and request a loan or support to go further.",
  },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-24 border-y border-neutral-200 bg-brand-50/50">
      <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
        <SectionHeading
          eyebrow="How it works"
          title="From sign-up to shipped in three steps"
          description="A simple path whether you're a first-year student or a ten-years-out graduate."
        />
        <ol className="mt-10 grid gap-10 sm:mt-12 md:grid-cols-3 md:gap-8">
          {STEPS.map((step) => (
            <li key={step.index} className="border-t-2 border-brand-600 pt-6">
              <p className="font-mono text-sm font-semibold tracking-[0.16em] text-brand-700">
                STEP {step.index}
              </p>
              <h3 className="mt-3 text-xl font-bold tracking-tight text-black">
                {step.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-700 sm:text-base">
                {step.description}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
