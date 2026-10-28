interface SectionHeadingProps {
  eyebrow: string;
  title: string;
  description?: string;
  align?: "left" | "center";
}

export default function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
}: SectionHeadingProps) {
  const centered = align === "center";
  return (
    <div className={centered ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}>
      <p
        className={`flex items-center gap-2.5 font-mono text-xs font-medium tracking-[0.18em] text-brand-700 uppercase ${
          centered ? "justify-center" : ""
        }`}
      >
        <span aria-hidden="true" className="inline-block h-2 w-2 bg-brand-600" />
        {eyebrow}
      </p>
      <h2 className="mt-4 text-3xl font-bold tracking-tight text-black sm:text-4xl">
        {title}
      </h2>
      {description ? (
        <p className="mt-4 text-base leading-relaxed text-neutral-700 sm:text-lg">
          {description}
        </p>
      ) : null}
    </div>
  );
}
