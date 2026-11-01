import { describe, expect, it } from "vitest";
import {
  reconcileStorage,
  resolveStorageRef,
  sampleReconciliation,
  type BucketEntry,
  type DbStorageRef,
} from "@/lib/storage-reconcile";

const refs: DbStorageRef[] = [
  { key: "profile/u1/a.webp", table: "profile_media", rowId: "u1:avatar", hasBytes: false },
  { key: "wallet/u2/doc.pdf", table: "documents", rowId: "d1", module: "wallet", hasBytes: false },
  { key: "wallet/u2/doc.pdf", table: "documents", rowId: "d2", module: "wallet", hasBytes: false },
  { key: "gone/u3/x.png", table: "group_media", rowId: "g1:avatar", hasBytes: false },
  { key: null, table: "documents", rowId: "d3", module: "chat", hasBytes: true },
  { key: null, table: "documents", rowId: "d4", module: "chat", hasBytes: false },
];

const bucket: BucketEntry[] = [
  { key: "profile/u1/a.webp", sizeBytes: 100, lastModified: "2026-01-01T00:00:00.000Z" },
  { key: "wallet/u2/doc.pdf", sizeBytes: 200, lastModified: null },
  { key: "orphan/u9/old.bin", sizeBytes: 300, lastModified: null },
  { key: "voice/u9/note.wav", sizeBytes: 400, lastModified: null },
];

describe("reconcileStorage", () => {
  it("classifies linked, missing, unlinked, fallback, and duplicate refs", () => {
    const report = reconcileStorage(refs, bucket);
    expect(report.counts).toEqual({
      dbRefs: 6,
      bucketObjects: 4,
      linked: 2,
      missingObjects: 1,
      unlinkedObjects: 2,
      postgresFallback: 1,
      duplicateRefs: 1,
    });
    expect(report.unlinkedByPrefix).toEqual({ orphan: 1, voice: 1 });
    expect(report.unlinkedBytes).toBe(700);
    expect(report.truncated).toBe(false);
  });

  it("propagates the truncation flag", () => {
    expect(reconcileStorage(refs, bucket, true).truncated).toBe(true);
  });
});

describe("sampleReconciliation", () => {
  it("returns capped key-only samples", () => {
    const samples = sampleReconciliation(refs, bucket, 50);
    expect(samples.missing).toEqual([{ key: "gone/u3/x.png", table: "group_media", rowId: "g1:avatar" }]);
    expect(samples.duplicates).toEqual([{ key: "wallet/u2/doc.pdf", tables: ["documents", "documents"] }]);
    expect(samples.unlinked.map((o) => o.key)).toEqual(["orphan/u9/old.bin", "voice/u9/note.wav"]);
  });

  it("caps every sample list", () => {
    const samples = sampleReconciliation(refs, bucket, 1);
    expect(samples.missing.length).toBeLessThanOrEqual(1);
    expect(samples.unlinked.length).toBeLessThanOrEqual(1);
    expect(samples.duplicates.length).toBeLessThanOrEqual(1);
  });
});

describe("resolveStorageRef", () => {
  it("resolves linked keys with all referencing rows", () => {
    expect(resolveStorageRef(refs, { key: "wallet/u2/doc.pdf" })).toEqual({
      status: "linked",
      table: "documents",
      rowIds: ["d1", "d2"],
    });
  });

  it("resolves postgres fallback rows by table and row id", () => {
    expect(resolveStorageRef(refs, { table: "documents", rowId: "d3" })).toEqual({
      status: "fallback",
      table: "documents",
      rowId: "d3",
    });
    // A row id without bytes is not a valid fallback record.
    expect(resolveStorageRef(refs, { table: "documents", rowId: "d4" })).toEqual({ status: "unlinked" });
  });

  it("reports unknown keys as unlinked", () => {
    expect(resolveStorageRef(refs, { key: "nope/x" })).toEqual({ status: "unlinked" });
  });
});
