const STATS = [
  { value: "120K+", label: "Learners connected" },
  { value: "850+", label: "Institutions on board" },
  { value: "12K+", label: "Projects shipped" },
  { value: "$3.2M+", label: "Loans & support disbursed" },
];

export default function StatsBar() {
  return (
    <section aria-label="TixConneckt in numbers" className="border-y border-neutral-200 bg-white">
      <div className="mx-auto grid w-full max-w-7xl grid-cols-2 gap-x-6 gap-y-8 px-4 py-10 sm:px-6 lg:grid-cols-4 lg:px-8">
        {STATS.map((stat) => (
          <div key={stat.label}>
            <p className="font-mono text-2xl font-semibold tracking-tight text-brand-700 sm:text-3xl">
              {stat.value}
            </p>
            <p className="mt-1.5 text-sm font-medium text-black">{stat.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
