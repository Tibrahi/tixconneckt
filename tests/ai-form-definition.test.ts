import { describe, expect, it } from "vitest";
import {
  validateFormDefinition,
  validateSubmission,
  type FormDefinition,
} from "@/lib/ai-form-definition";

describe("validateFormDefinition", () => {
  it("accepts a well-formed dynamic definition", () => {
    const result = validateFormDefinition({
      fields: [
        { key: "goal", label: "What is your goal?", type: "text", required: true },
        {
          key: "budget",
          label: "Budget (USD)",
          type: "number",
          constraints: { min: 0 },
        },
        {
          key: "contact",
          label: "Preferred contact",
          type: "enum",
          options: ["email", "phone"],
        },
      ],
    });
    expect(result.ok).toBe(true);
  });
  it("rejects unsupported field types", () => {
    const result = validateFormDefinition({
      fields: [{ key: "x", label: "X", type: "webcam" }],
    });
    expect(result.ok).toBe(false);
  });
  it("rejects executable markup in labels and descriptions", () => {
    const bad = validateFormDefinition({
      fields: [
        { key: "x", label: "<img src=x onerror=alert(1)>", type: "text" },
      ],
    });
    expect(bad.ok).toBe(false);
    const script = validateFormDefinition({
      fields: [
        { key: "x", label: "Fine", description: "<script>alert(1)</script>", type: "text" },
      ],
    });
    expect(script.ok).toBe(false);
  });
  it("rejects duplicate keys and enum fields without options", () => {
    const dup = validateFormDefinition({
      fields: [
        { key: "a", label: "A", type: "text" },
        { key: "a", label: "A2", type: "text" },
      ],
    });
    expect(dup.ok).toBe(false);
    const noOptions = validateFormDefinition({
      fields: [{ key: "a", label: "A", type: "enum" }],
    });
    expect(noOptions.ok).toBe(false);
  });
});

describe("validateSubmission", () => {
  const definition: FormDefinition = {
    fields: [
      { key: "goal", label: "Goal", type: "text", required: true },
      { key: "budget", label: "Budget", type: "number", required: false, constraints: { min: 0 } },
      { key: "contact", label: "Contact", type: "enum", required: false, options: ["email", "phone"] },
    ],
  };

  it("coerces and validates submitted values", () => {
    const result = validateSubmission(definition, {
      goal: "  Launch a pilot  ",
      budget: "250",
      contact: "email",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.values).toMatchObject({ goal: "Launch a pilot", budget: 250, contact: "email" });
    }
  });
  it("reports missing required fields and bad values per field", () => {
    const result = validateSubmission(definition, { budget: "-5", contact: "sms" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors.goal).toBeTruthy();
      expect(result.fieldErrors.budget).toBeTruthy();
      expect(result.fieldErrors.contact).toBeTruthy();
    }
  });
});
