"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ROUTES } from "@/lib/routes";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge, Card } from "@/components/ui/Card";
import { EmptyState, LoadError, SkeletonList } from "@/components/ui/Feedback";
import { Button } from "@/components/ui/Button";
import { TextAreaField, TextField } from "@/components/ui/Fields";
import { ErrorDialog, Modal } from "@/components/ui/Modal";

interface Suggestion {
  id: string;
  candidateId: string;
  score: number | null;
  rationale: string | null;
  status: string;
  name: string;
  shortId: string;
  field: string | null;
}

const QUESTIONS = [
  {
    key: "objective",
    label: "What is your objective?",
    hint: "Describe what you want to achieve, e.g. launch a farm-tech startup in Rwanda.",
  },
  {
    key: "skills",
    label: "What are your skills and strengths?",
    hint: "Comma separated, e.g. React, bookkeeping, public speaking.",
  },
  {
    key: "field",
    label: "Which field or sector?",
    hint: "E.g. Agriculture, Health, Education, Finance.",
  },
  {
    key: "education",
    label: "Education or major (optional)",
    hint: "E.g. BSc Computer Science.",
  },
] as const;

export function MatchingPage() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({
    objective: "",
    skills: "",
    field: "",
    education: "",
  });
  const [started, setStarted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiPending, setAiPending] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [approved, setApproved] = useState<string[]>([]);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const res = await fetch("/api/matching", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const body = (await res.json()) as {
        ok: boolean;
        data?: { answers: { objective: string; skills: string[]; field: string; education: string | null } | null; suggestions: Suggestion[] };
      };
      if (!body.ok || !body.data) throw new Error();
      setSuggestions(body.data.suggestions);
      if (body.data.answers) {
        setAnswers({
          objective: body.data.answers.objective ?? "",
          skills: (body.data.answers.skills ?? []).join(", "),
          field: body.data.answers.field ?? "",
          education: body.data.answers.education ?? "",
        });
        setStarted(true);
      }
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function submitAnswers() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/matching", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          objective: answers.objective.trim(),
          skills: answers.skills.split(",").map((s) => s.trim()).filter(Boolean),
          field: answers.field.trim(),
          education: answers.education.trim() || undefined,
        }),
      });
      const body = (await res.json()) as { ok: boolean; data?: { aiPending?: boolean }; error?: string };
      if (!res.ok || !body.ok) {
        setError(body.error ?? "We couldn't save your answers. Please try again.");
        return;
      }
      setAiPending(body.data?.aiPending ?? false);
      load();
    } catch {
      setError("Your connection was interrupted. Your answers are still available. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function decide(candidateId: string, decision: "approved" | "rejected") {
    try {
      const res = await fetch("/api/matching", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId, decision }),
      });
      const body = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !body.ok) {
        setError(body.error ?? "We couldn't record your decision. Please try again.");
        return;
      }
      if (decision === "approved") setApproved((a) => [...a, candidateId]);
      setSuggestions((s) => (s ?? []).filter((x) => x.candidateId !== candidateId));
    } catch {
      setError("Your connection was interrupted. Please try again.");
    }
  }

  async function formGroup() {
    try {
      const res = await fetch("/api/matching", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: groupName.trim(), candidateIds: approved }),
      });
      const body = (await res.json()) as { ok: boolean; data?: { groupId: string }; error?: string };
      if (!res.ok || !body.ok || !body.data) {
        setError(body.error ?? "We couldn't create the group. Please try again.");
        return;
      }
      setGroupOpen(false);
      setApproved([]);
      window.location.href = ROUTES.groupById(body.data.groupId);
    } catch {
      setError("Your connection was interrupted. Please try again.");
    }
  }

  if (failed) {
    return (
      <>
        <PageHeader title="Matching" />
        <LoadError onRetry={load} />
      </>
    );
  }
  if (suggestions === null) {
    return (
      <>
        <PageHeader title="Matching" />
        <SkeletonList rows={3} />
      </>
    );
  }

  const question = QUESTIONS[step];
  const canNext =
    step === 3 ||
    (step === 0 && answers.objective.trim().length >= 3) ||
    (step === 1 && answers.skills.trim().length >= 2) ||
    (step === 2 && answers.field.trim().length >= 2);

  return (
    <>
      <PageHeader
        title="Matching"
        description="Answer four questions, one at a time. We compare complementary skills — not just identical ones."
        actions={
          approved.length > 0 ? (
            <Button size="sm" icon="user-group" onClick={() => setGroupOpen(true)}>
              Form group ({approved.length})
            </Button>
          ) : undefined
        }
      />

      {!started ? (
        <Card title="Find compatible collaborators">
          <p className="mb-4 text-sm text-neutral-600">
            Your answers are saved to your profile and used to suggest people with complementary
            capabilities in your field.
          </p>
          <Button icon="arrow-right" onClick={() => setStarted(true)}>
            Start the questionnaire
          </Button>
        </Card>
      ) : (
        <Card title={`Question ${step + 1} of ${QUESTIONS.length}: ${question.label}`}>
          <p className="mb-3 text-sm text-neutral-600">{question.hint}</p>
          {step === 0 ? (
            <TextAreaField label={question.label} value={answers.objective} onChange={(e) => setAnswers({ ...answers, objective: e.target.value })} />
          ) : step === 1 ? (
            <TextAreaField label={question.label} value={answers.skills} onChange={(e) => setAnswers({ ...answers, skills: e.target.value })} />
          ) : (
            <TextField label={question.label} value={answers[question.key]} onChange={(e) => setAnswers({ ...answers, [question.key]: e.target.value })} />
          )}
          <div className="mt-4 flex justify-between">
            <Button variant="secondary" disabled={step === 0} onClick={() => setStep(step - 1)}>
              Back
            </Button>
            {step < QUESTIONS.length - 1 ? (
              <Button disabled={!canNext} onClick={() => setStep(step + 1)}>
                Next
              </Button>
            ) : (
              <Button loading={submitting} onClick={submitAnswers}>
                Save and find matches
              </Button>
            )}
          </div>
        </Card>
      )}

      <div className="mt-4">
        <h2 className="mb-2 text-base font-semibold">Your suggestions</h2>
        {suggestions.length === 0 ? (
          <EmptyState
            icon="wand-magic-sparkles"
            title="No suggestions yet"
            message="Complete the questionnaire above. New compatible collaborators appear here — rejected ones never return."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {suggestions.map((s) => (
              <li key={s.id} className="rounded-lg border border-neutral-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <Link
                      href={ROUTES.profileById(s.shortId)}
                      className="font-medium text-brand-700 hover:underline"
                    >
                      {s.name} <span className="font-mono text-xs">({s.shortId})</span>
                    </Link>
                    <p className="mt-1 text-sm text-neutral-600">
                      {s.field ? `Field: ${s.field} · ` : ""}Compatibility score:{" "}
                      <span className="font-mono font-semibold text-black">{s.score ?? 0}</span>
                    </p>
                  </div>
                  <Badge tone="info">Suggested</Badge>
                </div>
                {s.rationale ? <p className="mt-2 text-sm text-black">{s.rationale}</p> : null}
                {aiPending ? (
                  <p className="mt-1 text-xs text-neutral-600">AI assist pending — structured rules applied.</p>
                ) : null}
                <div className="mt-3 flex gap-2">
                  <Button size="sm" icon="check" onClick={() => decide(s.candidateId, "approved")}>
                    Approve & connect
                  </Button>
                  <Button variant="secondary" size="sm" icon="xmark" onClick={() => decide(s.candidateId, "rejected")}>
                    Reject
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {groupOpen ? (
        <Modal title="Form a group" onClose={() => setGroupOpen(false)}>
          <p className="mb-3 text-sm text-neutral-600">
            Create a group with your {approved.length} approved match{approved.length === 1 ? "" : "es"} around
            your shared objective.
          </p>
          <TextField label="Group name" value={groupName} onChange={(e) => setGroupName(e.target.value)} />
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setGroupOpen(false)}>
              Cancel
            </Button>
            <Button disabled={groupName.trim().length < 3} onClick={formGroup}>
              Create group
            </Button>
          </div>
        </Modal>
      ) : null}
      {error ? <ErrorDialog message={error} onClose={() => setError(null)} /> : null}
    </>
  );
}
