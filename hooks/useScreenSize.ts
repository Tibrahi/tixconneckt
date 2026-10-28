"use client";

import { useEffect, useState } from "react";

export type Breakpoint = "xs" | "sm" | "md" | "lg" | "xl" | "2xl";
export type Orientation = "portrait" | "landscape";

export interface ScreenSize {
  width: number;
  height: number;
  breakpoint: Breakpoint;
  orientation: Orientation;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isShortHeight: boolean;
  isTallHeight: boolean;
  ready: boolean;
}

const SHORT_HEIGHT = 700;
const TALL_HEIGHT = 900;

function breakpointFor(width: number): Breakpoint {
  if (width >= 1536) return "2xl";
  if (width >= 1280) return "xl";
  if (width >= 1024) return "lg";
  if (width >= 768) return "md";
  if (width >= 640) return "sm";
  return "xs";
}

function readScreen(): Omit<ScreenSize, "ready"> {
  const width = window.innerWidth;
  const height = window.innerHeight;
  return {
    width,
    height,
    breakpoint: breakpointFor(width),
    orientation: height >= width ? "portrait" : "landscape",
    isMobile: width < 768,
    isTablet: width >= 768 && width < 1024,
    isDesktop: width >= 1024,
    isShortHeight: height < SHORT_HEIGHT,
    isTallHeight: height >= TALL_HEIGHT,
  };
}

const INITIAL: ScreenSize = {
  width: 0,
  height: 0,
  breakpoint: "lg",
  orientation: "landscape",
  isMobile: false,
  isTablet: false,
  isDesktop: true,
  isShortHeight: false,
  isTallHeight: true,
  ready: false,
};

/**
 * Live viewport detection (width, height, breakpoint, orientation).
 * SSR-safe: returns a desktop default until mounted (`ready === true`),
 * so hook-driven classes must only refine the base Tailwind layout.
 */
export function useScreenSize(): ScreenSize {
  const [screen, setScreen] = useState<ScreenSize>(INITIAL);

  useEffect(() => {
    const update = () => setScreen({ ...readScreen(), ready: true });
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  return screen;
}
