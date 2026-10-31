import { describe, expect, it, vi } from "vitest";
import { createTtlCache } from "@/lib/dashboard-queries";

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
});
