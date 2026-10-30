import { describe, expect, it } from "vitest";
import { isDatabaseUnavailable } from "@/db";
import {
  redactDatabaseUrl,
  resolveDrizzleKitDatabaseUrl,
  resolveRuntimeDatabaseUrl,
} from "@/db/neon-url.mjs";

const POOLER_URL =
  "postgresql://neondb_owner:secret@ep-aged-scene-atzw0wfk-pooler.c-9.us-east-1.aws.neon.tech/tixconneckt?sslmode=require&channel_binding=require";

describe("resolveDrizzleKitDatabaseUrl", () => {
  it("derives the direct host from a Neon pooler URL", () => {
    const url = new URL(resolveDrizzleKitDatabaseUrl({ DATABASE_URL: POOLER_URL }));
    expect(url.hostname).toBe("ep-aged-scene-atzw0wfk.c-9.us-east-1.aws.neon.tech");
    expect(url.pathname).toBe("/tixconneckt");
  });

  it("drops channel_binding (unsupported by node-postgres) and keeps TLS", () => {
    const url = new URL(resolveDrizzleKitDatabaseUrl({ DATABASE_URL: POOLER_URL }));
    expect(url.searchParams.get("channel_binding")).toBeNull();
    expect(url.searchParams.get("sslmode")).toBe("verify-full");
    expect(url.searchParams.get("connect_timeout")).toBe("10");
  });

  it("preserves credentials and non-Neon hosts untouched", () => {
    const local = "postgresql://user:pw@localhost:5432/tixconneckt";
    const url = new URL(resolveDrizzleKitDatabaseUrl({ DATABASE_URL: local }));
    expect(url.hostname).toBe("localhost");
    expect(url.username).toBe("user");
    expect(url.password).toBe("pw");
  });

  it("prefers an explicit DATABASE_URL_DIRECT override", () => {
    const direct = "postgresql://u:p@ep-direct.aws.neon.tech/db?sslmode=require";
    const resolved = resolveDrizzleKitDatabaseUrl({
      DATABASE_URL: POOLER_URL,
      DATABASE_URL_DIRECT: direct,
    });
    expect(new URL(resolved).hostname).toBe("ep-direct.aws.neon.tech");
  });

  it("throws a clear error when no database URL is configured", () => {
    expect(() => resolveDrizzleKitDatabaseUrl({})).toThrow(/DATABASE_URL is required/);
  });

  it("throws a clear error for an unparseable URL", () => {
    expect(() => resolveDrizzleKitDatabaseUrl({ DATABASE_URL: "not a url" })).toThrow(
      /could not be parsed/,
    );
  });
});

describe("resolveRuntimeDatabaseUrl", () => {
  it("keeps the pooled host and produces a pg-compatible URL", () => {
    const url = new URL(resolveRuntimeDatabaseUrl({ DATABASE_URL: POOLER_URL }));
    expect(url.hostname).toContain("-pooler.");
    expect(url.searchParams.get("channel_binding")).toBeNull();
    expect(url.searchParams.get("sslmode")).toBe("verify-full");
    expect(url.searchParams.get("connect_timeout")).toBe("5");
  });

  it("does not require TLS for a local PostgreSQL URL", () => {
    const url = new URL(
      resolveRuntimeDatabaseUrl({ DATABASE_URL: "postgresql://user:pw@localhost:5432/app" }),
    );
    expect(url.searchParams.has("sslmode")).toBe(false);
    expect(url.hostname).toBe("localhost");
  });

  it("rejects missing and non-PostgreSQL URLs", () => {
    expect(() => resolveRuntimeDatabaseUrl({})).toThrow(/DATABASE_URL is required/);
    expect(() => resolveRuntimeDatabaseUrl({ DATABASE_URL: "https://example.com" })).toThrow(
      /postgres or postgresql scheme/,
    );
  });
});

describe("redactDatabaseUrl", () => {
  it("never exposes credentials", () => {
    const redacted = redactDatabaseUrl(POOLER_URL);
    expect(redacted).not.toContain("secret");
    expect(redacted).not.toContain("neondb_owner");
    expect(redacted).toContain("ep-aged-scene-atzw0wfk-pooler");
  });
});

describe("isDatabaseUnavailable", () => {
  it("recognizes PostgreSQL connection failures wrapped as causes", () => {
    expect(
      isDatabaseUnavailable({ cause: Object.assign(new Error("connection timed out"), { code: "ETIMEDOUT" }) }),
    ).toBe(true);
  });

  it("does not classify SQL errors as connectivity failures", () => {
    expect(isDatabaseUnavailable({ code: "23505", message: "unique constraint violation" })).toBe(
      false,
    );
    expect(
      isDatabaseUnavailable({ message: "canceling statement due to statement timeout" }),
    ).toBe(false);
  });
});
