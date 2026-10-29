import { describe, expect, it } from "vitest";
import {
  applyDocUpdate,
  validateDocSize,
  validateFieldName,
  validateFieldValue,
} from "@/lib/flexible-records";

describe("validateFieldName", () => {
  it("accepts normal names", () => {
    expect(validateFieldName("preferredFramework")).toBeNull();
    expect(validateFieldName("field_1")).toBeNull();
  });
  it("rejects empty, unsafe, or overlong names", () => {
    expect(validateFieldName("")).not.toBeNull();
    expect(validateFieldName("1abc")).not.toBeNull();
    expect(validateFieldName("__proto__")).not.toBeNull();
    expect(validateFieldName("a".repeat(65))).not.toBeNull();
    expect(validateFieldName("has space")).not.toBeNull();
  });
});

describe("validateFieldValue", () => {
  it("accepts supported scalar, array, and nested values", () => {
    expect(validateFieldValue("hello", 0)).toBeNull();
    expect(validateFieldValue(42, 0)).toBeNull();
    expect(validateFieldValue(true, 0)).toBeNull();
    expect(validateFieldValue(null, 0)).toBeNull();
    expect(validateFieldValue(["a", 1], 0)).toBeNull();
    expect(validateFieldValue({ nested: { deep: [1] } }, 0)).toBeNull();
  });
  it("rejects oversized or too-deep values", () => {
    expect(validateFieldValue("x".repeat(20001), 0)).not.toBeNull();
    expect(validateFieldValue(new Array(201).fill(1), 0)).not.toBeNull();
    let deep: unknown = "leaf";
    for (let i = 0; i < 10; i++) deep = { wrap: deep };
    expect(validateFieldValue(deep, 0)).not.toBeNull();
  });
  it("rejects prototype-pollution keys", () => {
    expect(validateFieldValue({ __proto__: { polluted: true } }, 0)).not.toBeNull();
  });
});

describe("applyDocUpdate", () => {
  it("merges new fields and preserves unrelated unknown fields", () => {
    const base = {
      title: "Community Learning Platform",
      customFields: { preferredFramework: "Next.js" },
    };
    const next = applyDocUpdate(base, {
      set: { "customFields.collaborationSchedule": "Flexible", skillsNeeded: ["frontend"] },
      remove: [],
    });
    expect(next).toMatchObject({
      title: "Community Learning Platform",
      skillsNeeded: ["frontend"],
      customFields: { preferredFramework: "Next.js", collaborationSchedule: "Flexible" },
    });
  });
  it("removes only the requested paths", () => {
    const base = { keep: 1, drop: 2, nested: { a: 1, b: 2 } };
    const next = applyDocUpdate(base, { set: {}, remove: ["drop", "nested.a"] });
    expect(next).toEqual({ keep: 1, nested: { b: 2 } });
  });
  it("never mutates the base document", () => {
    const base = { nested: { a: 1 } };
    applyDocUpdate(base, { set: { "nested.b": 2 }, remove: [] });
    expect(base).toEqual({ nested: { a: 1 } });
  });
});

describe("validateDocSize", () => {
  it("rejects documents that exceed field or byte budgets", () => {
    const tooMany: Record<string, unknown> = {};
    for (let i = 0; i < 250; i++) tooMany[`f${i}`] = i;
    expect(validateDocSize(tooMany)).not.toBeNull();
    expect(validateDocSize({ big: "x".repeat(600 * 1024) })).not.toBeNull();
    expect(validateDocSize({ ok: "fine" })).toBeNull();
  });
});
