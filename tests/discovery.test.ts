import { describe, expect, it } from "vitest";
import {
  parseDiscoveryPaging,
  scoreCandidate,
  type RecommendableProfile,
} from "@/lib/discovery";

function profile(overrides: Partial<RecommendableProfile> = {}): RecommendableProfile {
  return {
    userId: "me",
    skills: [],
    strengths: [],
    fields: [],
    major: null,
    objectives: null,
    educationLevel: null,
    country: null,
    ...overrides,
  };
}

describe("parseDiscoveryPaging", () => {
  it("defaults discovery sections to page 1 with 5 per page", () => {
    expect(parseDiscoveryPaging(new URLSearchParams(), 5)).toEqual({ page: 1, pageSize: 5 });
  });

  it("defaults recommendations to 10 per page and caps at 10", () => {
    expect(parseDiscoveryPaging(new URLSearchParams(), 10, 10)).toEqual({ page: 1, pageSize: 10 });
    const params = new URLSearchParams({ page: "2", pageSize: "50" });
    expect(parseDiscoveryPaging(params, 10, 10)).toEqual({ page: 2, pageSize: 10 });
  });

  it("rejects invalid or negative values", () => {
    const params = new URLSearchParams({ page: "-3", pageSize: "abc" });
    expect(parseDiscoveryPaging(params, 5)).toEqual({ page: 1, pageSize: 5 });
  });
});

describe("scoreCandidate", () => {
  it("scores zero when nothing overlaps", () => {
    const me = profile({ skills: ["welding"], country: "Rwanda" });
    const other = profile({ userId: "u2", skills: ["nursing"], country: "Kenya" });
    expect(scoreCandidate(me, other).score).toBe(0);
  });

  it("weighs shared skills most and matches case-insensitively", () => {
    const me = profile({ skills: ["React", "TypeScript"] });
    const many = profile({ userId: "u2", skills: ["react", "typescript", "node"] });
    const few = profile({ userId: "u3", skills: ["react"] });
    const manyScore = scoreCandidate(me, many);
    const fewScore = scoreCandidate(me, few);
    expect(manyScore.score).toBeGreaterThan(fewScore.score);
    expect(manyScore.reasons.length).toBeGreaterThan(0);
  });

  it("rewards shared fields, strengths, profession, and country", () => {
    const me = profile({
      fields: ["agriculture"],
      strengths: ["leadership"],
      major: "Engineer",
      country: "Rwanda",
    });
    const other = profile({
      userId: "u2",
      fields: ["agriculture"],
      strengths: ["leadership"],
      major: "Engineer",
      country: "Rwanda",
    });
    expect(scoreCandidate(me, other).score).toBeGreaterThan(0);
  });

  it("caps the skill contribution so one dimension cannot dominate", () => {
    const me = profile({ skills: Array.from({ length: 20 }, (_, i) => `skill-${i}`) });
    const other = profile({ userId: "u2", skills: [...me.skills] });
    // 20 shared skills would be 60 uncapped; skill share caps at 9.
    expect(scoreCandidate(me, other).score).toBeLessThanOrEqual(9 + 6 + 4 + 2 + 1);
  });
});
