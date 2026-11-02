import { describe, expect, it } from "vitest";
import {
  isMissingColumnError,
  isMissingTableError,
  shouldAutoMigrate,
  withMigrationRetry,
} from "@/db/migrate-on-boot";

describe("shouldAutoMigrate", () => {
  it("runs when a database URL is configured", () => {
    expect(shouldAutoMigrate({ DATABASE_URL: "postgresql://probe@127.0.0.1/db" })).toBe(true);
  });

  it("skips when explicitly disabled", () => {
    expect(shouldAutoMigrate({ DATABASE_URL: "postgresql://probe@127.0.0.1/db", SKIP_AUTO_MIGRATE: "1" })).toBe(
      false,
    );
  });

  it("skips without a database URL so the app can boot degraded", () => {
    expect(shouldAutoMigrate({})).toBe(false);
    expect(shouldAutoMigrate({ DATABASE_URL: "  " })).toBe(false);
  });
});

describe("isMissingColumnError", () => {
  it("detects Postgres 42703 at any depth of the cause chain", () => {
    expect(isMissingColumnError({ code: "42703" })).toBe(true);
    expect(isMissingColumnError({ message: "wrap", cause: { code: "42703" } })).toBe(true);
    expect(isMissingColumnError({ code: "23505" })).toBe(false);
    expect(isMissingColumnError(new Error("boom"))).toBe(false);
    expect(isMissingColumnError(null)).toBe(false);
  });
});

describe("isMissingTableError", () => {
  it("detects Postgres 42P01 at any depth of the cause chain", () => {
    expect(isMissingTableError({ code: "42P01" })).toBe(true);
    expect(isMissingTableError({ message: "wrap", cause: { code: "42P01" } })).toBe(true);
    expect(isMissingTableError({ code: "42703" })).toBe(false);
    expect(isMissingTableError(new Error("boom"))).toBe(false);
    expect(isMissingTableError(null)).toBe(false);
  });
});

describe("withMigrationRetry", () => {
  it("returns first-try results without migrating", async () => {
    let migrated = 0;
    const out = await withMigrationRetry(async () => "ok", async () => {
      migrated += 1;
    });
    expect(out).toBe("ok");
    expect(migrated).toBe(0);
  });

  it("migrates once and retries after a 42P01", async () => {
    let migrated = 0;
    let attempts = 0;
    const out = await withMigrationRetry(
      async () => {
        attempts += 1;
        if (attempts === 1) throw Object.assign(new Error('relation "call_interpretations" does not exist'), { code: "42P01" });
        return "healed";
      },
      async () => {
        migrated += 1;
      },
    );
    expect(out).toBe("healed");
    expect(migrated).toBe(1);
    expect(attempts).toBe(2);
  });

  it("migrates once and retries after a 42703", async () => {
    let migrated = 0;
    let attempts = 0;
    const out = await withMigrationRetry(
      async () => {
        attempts += 1;
        if (attempts === 1) throw Object.assign(new Error("column does not exist"), { code: "42703" });
        return "healed";
      },
      async () => {
        migrated += 1;
      },
    );
    expect(out).toBe("healed");
    expect(migrated).toBe(1);
    expect(attempts).toBe(2);
  });

  it("rethows non-42703 errors without migrating", async () => {
    let migrated = 0;
    const failure = Object.assign(new Error("duplicate"), { code: "23505" });
    await expect(
      withMigrationRetry(async () => {
        throw failure;
      }, async () => {
        migrated += 1;
      }),
    ).rejects.toBe(failure);
    expect(migrated).toBe(0);
  });

  it("propagates the retry error when healing did not help", async () => {
    let migrated = 0;
    const failure = Object.assign(new Error("still missing"), { code: "42703" });
    await expect(
      withMigrationRetry(async () => {
        throw failure;
      }, async () => {
        migrated += 1;
      }),
    ).rejects.toBe(failure);
    expect(migrated).toBe(1);
  });
});
