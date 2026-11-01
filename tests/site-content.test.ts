import { describe, expect, it } from "vitest";
import { ROUTES } from "@/lib/routes";
import {
  HOMEPAGE_AVAILABILITY,
  HOMEPAGE_AVAILABILITY_LABELS,
  HOMEPAGE_CAPABILITIES,
  HOMEPAGE_FOOTER_GROUPS,
  HOMEPAGE_NAV_LINKS,
  HOMEPAGE_SECTIONS,
  HOMEPAGE_SECTION_IDS,
  HOMEPAGE_STEPS,
  homepageLinks,
} from "@/lib/site-content";

/** Known route destinations the homepage may link to. */
const KNOWN_ROUTES = new Set<string>([
  ROUTES.root,
  ROUTES.login,
  ROUTES.register,
  ROUTES.legalPrivacy,
  ROUTES.legalTerms,
  ROUTES.legalAgreement,
]);

const KNOWN_ANCHORS = new Set<string>(["top", ...HOMEPAGE_SECTION_IDS]);

describe("homepage content contract", () => {
  it("covers every required section with a stable id and heading", () => {
    const ids = HOMEPAGE_SECTIONS.map((s) => s.id);
    expect(ids).toEqual([...HOMEPAGE_SECTION_IDS]);
    for (const section of HOMEPAGE_SECTIONS) {
      expect(section.navLabel.trim()).not.toBe("");
      expect(section.heading.trim()).not.toBe("");
    }
  });

  it("keeps capabilities, steps, and availability lists populated", () => {
    expect(HOMEPAGE_CAPABILITIES.length).toBeGreaterThan(0);
    for (const c of HOMEPAGE_CAPABILITIES) {
      expect(c.icon.trim()).not.toBe("");
      expect(c.title.trim()).not.toBe("");
      expect(c.text.trim()).not.toBe("");
    }
    expect(HOMEPAGE_STEPS.length).toBeGreaterThan(0);
    for (const s of HOMEPAGE_STEPS) {
      expect(s.title.trim()).not.toBe("");
      expect(s.text.trim()).not.toBe("");
    }
    expect(HOMEPAGE_AVAILABILITY.available.length).toBeGreaterThan(0);
    expect(HOMEPAGE_AVAILABILITY.inDevelopment.length).toBeGreaterThan(0);
  });

  it("uses only the approved availability labels", () => {
    expect([...HOMEPAGE_AVAILABILITY_LABELS]).toEqual(["Available now", "In development"]);
    expect(HOMEPAGE_AVAILABILITY_LABELS).toContain(HOMEPAGE_AVAILABILITY.availableHeading);
    expect(HOMEPAGE_AVAILABILITY_LABELS).toContain(HOMEPAGE_AVAILABILITY.inDevelopmentHeading);
    expect(HOMEPAGE_SECTION_IDS).toContain(HOMEPAGE_AVAILABILITY.sectionId);
  });

  it("resolves every internal link to a known route or anchor", () => {
    const links = [...homepageLinks(), ...HOMEPAGE_NAV_LINKS];
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link.label.trim()).not.toBe("");
      if (link.href.startsWith("#")) {
        expect(KNOWN_ANCHORS.has(link.href.slice(1))).toBe(true);
      } else {
        expect(KNOWN_ROUTES.has(link.href)).toBe(true);
      }
    }
    // Footer groups stay labeled and link-bearing.
    expect(HOMEPAGE_FOOTER_GROUPS.length).toBeGreaterThan(0);
    for (const group of HOMEPAGE_FOOTER_GROUPS) {
      expect(group.heading.trim()).not.toBe("");
      expect(group.links.length).toBeGreaterThan(0);
    }
  });

  it("never exposes internal implementation details in public copy", () => {
    const copy = JSON.stringify({
      HOMEPAGE_CAPABILITIES,
      HOMEPAGE_STEPS,
      HOMEPAGE_AVAILABILITY,
    }).toLowerCase();
    for (const forbidden of ["api key", "endpoint", "postgres", "neon", "vercel", "prompt", "s3", "redis", "ably"]) {
      expect(copy).not.toContain(forbidden);
    }
  });
});
