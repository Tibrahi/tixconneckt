import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const journal = JSON.parse(
  readFileSync(new URL("../db/migrations/meta/_journal.json", import.meta.url), "utf8"),
) as { entries: Array<{ idx: number; when: number; tag: string }> };

describe("Drizzle migration journal", () => {
  it("keeps migration timestamps strictly increasing in journal order", () => {
    for (let index = 1; index < journal.entries.length; index += 1) {
      expect(journal.entries[index].when, journal.entries[index].tag).toBeGreaterThan(
        journal.entries[index - 1].when,
      );
    }
  });

  it("runs the previously skipped payment and interpretation migrations after 0016", () => {
    const lastBeforeRepair = journal.entries.find((entry) => entry.tag === "0016_group_call_participants");
    const interpretation = journal.entries.find((entry) => entry.tag === "0017_call_interpretations");
    const paymentDetails = journal.entries.find((entry) => entry.tag === "0018_payment_method_details");

    expect(lastBeforeRepair).toBeDefined();
    expect(interpretation?.when).toBeGreaterThan(lastBeforeRepair!.when);
    expect(paymentDetails?.when).toBeGreaterThan(interpretation!.when);
  });
});
