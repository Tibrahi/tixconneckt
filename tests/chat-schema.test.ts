import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import {
  aiTaskRuns,
  conversationMembers,
  conversations,
  messageHides,
  messageReactions,
  messages,
} from "@/db/schema";

/** Importing the schema must not throw (self-referencing reply FK included). */
describe("chat schema", () => {
  it("exposes rich chat tables with the specified columns", () => {
    for (const table of [conversations, conversationMembers, messages, messageReactions, messageHides, aiTaskRuns]) {
      expect(getTableConfig(table).name).toBeTruthy();
    }
    const messageColumns = Object.values(getTableConfig(messages).columns).map((c) => c.name);
    for (const col of ["reply_to_id", "metadata", "kind", "deleted_at", "deleted_by"]) {
      expect(messageColumns).toContain(col);
    }
    const memberColumns = Object.values(getTableConfig(conversationMembers).columns).map((c) => c.name);
    expect(memberColumns).toContain("settings");
  });

  it("declares the reply self-reference", () => {
    const fks = getTableConfig(messages).foreignKeys;
    const self = fks.filter((fk) => {
      const ref = fk.reference();
      return ref.foreignTable === messages;
    });
    expect(self.length).toBeGreaterThan(0);
  });
});
