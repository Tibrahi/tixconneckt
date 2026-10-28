"use client";

import { useEffect, useState } from "react";

/** Prerender-safe current year: static fallback, corrected on mount. */
export default function CurrentYear() {
  const [year, setYear] = useState(2026);

  useEffect(() => {
    setYear(new Date().getFullYear());
  }, []);

  return <>{year}</>;
}
