"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import "driver.js/dist/driver.css";
import { Button } from "@/components/ui/Button";
import { TOUR_STEPS } from "@/lib/tour-steps";

/**
 * Route-aware Driver.js tour. Navigates to each step's route, waits for the
 * page and element to render, and skips steps whose UI never appears.
 * Controls: Back / Next / Skip (×) / Finish, plus progress and Esc to exit.
 */

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(condition: () => boolean, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (condition()) return true;
    await sleep(120);
  }
  return condition();
}

export function TourButton({ label = "Take the tour" }: { label?: string }) {
  const router = useRouter();
  const [active, setActive] = useState(false);

  async function start() {
    if (active) return;
    setActive(true);
    try {
      const { driver } = await import("driver.js");
      const reduceMotion =
        typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

      let current = -1;
      let finished = false;

      const tour = driver({
        showProgress: true,
        animate: !reduceMotion,
        allowClose: true,
        nextBtnText: "Next",
        prevBtnText: "Back",
        doneBtnText: "Finish",
        closeBtnLabel: "Skip tour",
        steps: TOUR_STEPS.map((s) => ({
          element: s.selector,
          popover: { title: s.title, description: s.description },
        })),
        onNextClick: () => void advance(1),
        onPrevClick: () => void advance(-1),
        onCloseClick: () => finish(),
        onDoneClick: () => finish(),
      });

      function finish() {
        if (finished) return;
        finished = true;
        try {
          tour.destroy();
        } catch {
          /* already torn down */
        }
        setActive(false);
      }

      async function navigate(route: string | null): Promise<void> {
        if (!route || window.location.pathname === route || window.location.pathname.startsWith(`${route}/`)) {
          return;
        }
        router.push(route);
        await waitFor(
          () => window.location.pathname === route || window.location.pathname.startsWith(`${route}/`),
          8000,
        );
      }

      async function advance(direction: 1 | -1): Promise<void> {
        if (finished) return;
        let next = current + direction;
        while (next >= 0 && next < TOUR_STEPS.length && !finished) {
          const step = TOUR_STEPS[next];
          await navigate(step.route);
          if (finished) return;
          const found = await waitFor(
            () => document.querySelector(step.selector) !== null,
            8000,
          );
          if (found) {
            current = next;
            tour.moveTo(next);
            return;
          }
          // Skip unavailable or inaccessible UI instead of pointing at nothing.
          next += direction;
        }
        finish();
      }

      // Expose finish to overlay/Esc paths (driver destroys itself; sync state).
      const originalDestroy = tour.destroy.bind(tour);
      tour.destroy = ((...args: unknown[]) => {
        (originalDestroy as (...a: unknown[]) => void)(...args);
        if (!finished) {
          finished = true;
          setActive(false);
        }
      }) as typeof tour.destroy;

      await advance(1);
    } catch {
      setActive(false);
    }
  }

  return (
    <Button variant="secondary" size="sm" icon="circle-question" loading={active} onClick={start}>
      {label}
    </Button>
  );
}
