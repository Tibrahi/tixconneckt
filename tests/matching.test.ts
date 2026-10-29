import { describe, expect, it } from "vitest";
import { rankCandidates, scoreCandidate } from "@/lib/matching";

const seeker = {
  objective: "Launch a farm-tech startup helping maize farmers in Rwanda",
  skills: ["react", "data analysis"],
  strengths: ["public speaking"],
  field: "Agriculture",
  education: "BSc Computer Science",
};

describe("scoreCandidate", () => {
  it("prefers complementary skills over identical ones", () => {
    const complementary = scoreCandidate(seeker, {
      userId: "u1",
      objective: "Build agri supply chains for maize cooperatives",
      skills: ["bookkeeping", "logistics"],
      strengths: [],
      field: "Agriculture",
    });
    const identical = scoreCandidate(seeker, {
      userId: "u2",
      objective: "Launch a farm-tech startup helping maize farmers in Rwanda",
      skills: ["react", "data analysis"],
      strengths: ["public speaking"],
      field: "Music",
    });
    expect(complementary).not.toBeNull();
    expect(identical).not.toBeNull();
    expect(complementary!.score).toBeGreaterThan(identical!.score);
    expect(complementary!.complementarySkills).toContain("bookkeeping");
  });

  it("rejects candidates with only identical skills and no alignment", () => {
    const result = scoreCandidate(seeker, {
      userId: "u3",
      objective: "Become a concert pianist",
      skills: ["react"],
      strengths: [],
      field: "Music",
    });
    expect(result).toBeNull();
  });

  it("rewards same-field collaboration", () => {
    const same = scoreCandidate(seeker, {
      userId: "u4",
      objective: "Grow a poultry business",
      skills: ["veterinary care"],
      strengths: [],
      field: "Agriculture",
    });
    const other = scoreCandidate(seeker, {
      userId: "u5",
      objective: "Grow a poultry business",
      skills: ["veterinary care"],
      strengths: [],
      field: "Fashion",
    });
    expect(same!.score).toBeGreaterThan(other?.score ?? 0);
    expect(same!.rationale.join(" ")).toMatch(/Same field/);
  });

  it("suggests at most three dynamic roles", () => {
    const result = scoreCandidate(seeker, {
      userId: "u6",
      objective: "Launch a farm-tech startup for maize farmers",
      skills: ["logistics", "bookkeeping", "marketing", "design", "legal"],
      strengths: [],
      field: "Agriculture",
    });
    expect(result).not.toBeNull();
    expect(result!.suggestedRoles.length).toBeLessThanOrEqual(3);
  });
});

describe("rankCandidates", () => {
  it("ranks best-first and drops incompatibles", () => {
    const ranked = rankCandidates(seeker, [
      {
        userId: "bad",
        objective: "Unrelated hobby",
        skills: ["react"],
        strengths: [],
        field: "Music",
      },
      {
        userId: "good",
        objective: "Launch a farm-tech startup for maize farmers",
        skills: ["logistics"],
        strengths: [],
        field: "Agriculture",
      },
    ]);
    expect(ranked.map((r) => r.userId)).toEqual(["good"]);
  });

  it("respects the limit", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      userId: `u${i}`,
      objective: "Launch a farm-tech startup for maize farmers",
      skills: ["logistics"],
      strengths: [],
      field: "Agriculture",
    }));
    expect(rankCandidates(seeker, many, 5)).toHaveLength(5);
  });
});
