import { describe, expect, it, vi } from "vitest";
import { createTtlCache, getCachedDashboardCounts } from "@/lib/dashboard-queries";

describe("createTtlCache", () => {
  it("serves repeats from cache without re-executing", async () => {
    const cache = createTtlCache<string>(10_000);
    const fn = vi.fn().mockResolvedValue("fresh");
    await expect(cache.get("u1", fn)).resolves.toBe("fresh");
    await expect(cache.get("u1", fn)).resolves.toBe("fresh");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("shares one execution between concurrent callers (no stampede)", async () => {
    const cache = createTtlCache<string>(10_000);
    let executions = 0;
    const fn = async () => {
      executions += 1;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return "shared";
    };
    const results = await Promise.all([cache.get("u1", fn), cache.get("u1", fn), cache.get("u1", fn)]);
    expect(results).toEqual(["shared", "shared", "shared"]);
    expect(executions).toBe(1);
  });

  it("re-executes after invalidation", async () => {
    const cache = createTtlCache<string>(10_000);
    const fn = vi.fn().mockResolvedValue("v1");
    await expect(cache.get("u1", fn)).resolves.toBe("v1");
    cache.invalidate("u1");
    fn.mockResolvedValue("v2");
    await expect(cache.get("u1", fn)).resolves.toBe("v2");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does not cache failures", async () => {
    const cache = createTtlCache<string>(10_000);
    const fn = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce("ok");
    await expect(cache.get("u1", fn)).rejects.toThrow("boom");
    await expect(cache.get("u1", fn)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("exposes last-known data regardless of expiry", async () => {
    vi.useFakeTimers();
    try {
      const cache = createTtlCache<string>(10_000);
      await expect(cache.get("u1", async () => "v1")).resolves.toBe("v1");
      vi.advanceTimersByTime(11_000);
      expect(cache.stale("u1")).toBe("v1");
      expect(cache.stale("nobody")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("getCachedDashboardCounts", () => {
  const fresh = { chat: 2, notifications: 1, conneckt: 0 };
  const outage = () => Object.assign(new Error("connection reset"), { code: "ECONNRESET" });

  it("serves last-known counts flagged stale when the database fails after a success", async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      await expect(getCachedDashboardCounts("stale-u1", async () => fresh)).resolves.toEqual(fresh);
      vi.advanceTimersByTime(11_000);
      await expect(
        getCachedDashboardCounts("stale-u1", async () => {
          throw outage();
        }),
      ).resolves.toEqual({ ...fresh, stale: true });
    } finally {
      vi.useRealTimers();
      warn.mockRestore();
    }
  });

  it("still throws when nothing was ever cached (genuinely unavailable)", async () => {
    const down = outage();
    await expect(
      getCachedDashboardCounts("cold-u1", async () => {
        throw down;
      }),
    ).rejects.toBe(down);
  });

  it("rethrows non-database errors without serving stale data", async () => {
    const bad = Object.assign(new Error('relation "nope" does not exist'), { code: "42P01" });
    await expect(
      getCachedDashboardCounts("query-err-u1", async () => {
        throw bad;
      }),
    ).rejects.toBe(bad);
  });
});
