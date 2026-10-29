/**
 * Structured matching rules (spec §10). Pure and unit-tested:
 * - Complementary skills beat identical skills.
 * - Same field/sector and overlapping objectives score highest.
 * - Repeated rejections and duplicates are excluded by the caller.
 */

export interface MatchProfileInput {
  objective: string;
  skills: string[];
  strengths: string[];
  field: string;
  education?: string;
}

export interface CandidateInput extends MatchProfileInput {
  userId: string;
}

export interface ScoredCandidate {
  userId: string;
  score: number;
  rationale: string[];
  complementarySkills: string[];
  suggestedRoles: string[];
}

function words(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3),
  );
}

function overlap(a: string, b: string): number {
  const wa = words(a);
  const wb = words(b);
  let n = 0;
  for (const w of wa) if (wb.has(w)) n += 1;
  return n;
}

function normalizeList(list: string[]): string[] {
  return list.map((s) => s.trim().toLowerCase()).filter(Boolean);
}

/**
 * Score one candidate against the seeker. Returns null when the candidate is
 * incompatible under the rules (e.g. nothing but identical skills).
 */
export function scoreCandidate(
  seeker: MatchProfileInput,
  candidate: CandidateInput,
): ScoredCandidate | null {
  const rationale: string[] = [];
  let score = 0;

  const seekerSkills = new Set(normalizeList([...seeker.skills, ...seeker.strengths]));
  const candidateSkills = normalizeList([...candidate.skills, ...candidate.strengths]);
  const complementary = candidateSkills.filter((s) => !seekerSkills.has(s));
  const identical = candidateSkills.filter((s) => seekerSkills.has(s));
  let aligned = false;

  // Field alignment matters most for collaboration.
  if (
    seeker.field.trim().toLowerCase() &&
    seeker.field.trim().toLowerCase() === candidate.field.trim().toLowerCase()
  ) {
    score += 30;
    aligned = true;
    rationale.push(`Same field: ${candidate.field.trim()}`);
  }

  // Objective overlap.
  const sharedWords = overlap(seeker.objective, candidate.objective);
  if (sharedWords >= 2) {
    score += 25;
    aligned = true;
    rationale.push(`Shared objective themes (${sharedWords} matching terms)`);
  } else if (sharedWords === 1) {
    score += 10;
    aligned = true;
    rationale.push("Partially aligned objective");
  }

  // Never recommend users merely because they share the same skills: without
  // field/objective alignment or complementary capabilities, they are out.
  if (!aligned && complementary.length === 0) {
    return null;
  }

  // Complementary skills are preferred over identical ones.
  if (complementary.length > 0) {
    score += Math.min(20, complementary.length * 7);
    rationale.push(`Brings complementary skills: ${complementary.slice(0, 4).join(", ")}`);
  }
  if (identical.length > 0 && complementary.length > 0) {
    score += 5;
    rationale.push(`Also shares: ${identical.slice(0, 3).join(", ")}`);
  }

  // Education relevance is a small bonus, never the deciding factor.
  if (
    seeker.education &&
    candidate.education &&
    seeker.education.trim().toLowerCase() === candidate.education.trim().toLowerCase()
  ) {
    score += 5;
    rationale.push("Similar education background");
  }

  if (score < 20) return null;

  // Two or three dynamic roles from complementary capability clusters.
  const suggestedRoles =
    complementary.length >= 2
      ? [complementary[0], complementary[1], ...(complementary[2] ? [complementary[2]] : [])].map(
          (s) => `${s} contributor`,
        )
      : ["collaborator"];

  return {
    userId: candidate.userId,
    score,
    rationale,
    complementarySkills: complementary,
    suggestedRoles,
  };
}

/** Rank candidates best-first, dropping incompatibles. */
export function rankCandidates(
  seeker: MatchProfileInput,
  candidates: CandidateInput[],
  limit = 10,
): ScoredCandidate[] {
  return candidates
    .map((c) => scoreCandidate(seeker, c))
    .filter((s): s is ScoredCandidate => s !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
