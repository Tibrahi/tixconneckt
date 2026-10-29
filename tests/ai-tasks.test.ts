import { describe, expect, it } from "vitest";
import { determineTaskInputs, getAiTask } from "@/lib/ai-tasks";

describe("determineTaskInputs", () => {
  it("asks only for genuinely missing information", () => {
    const task = getAiTask("project_analysis")!;
    const result = determineTaskInputs(task, {
      available: { context: "A learning platform for rural schools." },
    });
    expect(result.prefill).toMatchObject({ context: "A learning platform for rural schools." });
    expect(result.fields.map((f) => f.key)).toEqual(["goal"]);
    expect(result.canProceedWithoutQuestions).toBe(false);
  });
  it("asks nothing when the context already suffices", () => {
    const task = getAiTask("interpret_action")!;
    const result = determineTaskInputs(task, {
      available: { instruction: "Remind me tomorrow at 9am." },
    });
    expect(result.fields).toEqual([]);
    expect(result.canProceedWithoutQuestions).toBe(true);
  });
  it("treats audio as capture input rather than a question", () => {
    const task = getAiTask("transcribe")!;
    const result = determineTaskInputs(task, { available: {} });
    expect(result.fields).toEqual([]);
    expect(result.canProceedWithoutQuestions).toBe(true);
  });
  it("marks voice tasks beyond transcription as unsupported", () => {
    expect(getAiTask("summarize_audio")?.supported).toBe(false);
    expect(getAiTask("extract_audio")?.supported).toBe(false);
  });
});
