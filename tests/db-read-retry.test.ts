import { describe, expect, it, vi } from "vitest";
import { computeReadRetryDelayMs, isDatabaseUnavailable, withDbRead } from "@/db";

function connectionError(): Error {
  return Object.assign(new Error("timeout exceeded when trying to connect"), { code: "ETIMEDOUT" });
}

describe("computeReadRetryDelayMs", () => {
  it("grows exponentially and stays within jitter bounds", () => {
    for (let attempt = 0; attempt < 4; attempt++) {
      const grown = Math.min(2000, 150 * 2 ** attempt);
      for (let i = 0; i < 25; i++) {
        const delay = computeReadRetryDelayMs(attempt);
        expect(delay).toBeGreaterThanOrEqual(Math.floor(grown / 2));
        expect(delay).toBeLessThanOrEqual(grown);
      }
    }
  });

  it("caps growth at 2 seconds", () => {
    for (let i = 0; i < 10; i++) {
      expect(computeReadRetryDelayMs(10)).toBeLessThanOrEqual(2000);
    }
  });
});

describe("withDbRead", () => {
  it("returns the first attempt when it succeeds", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    await expect(withDbRead(fn)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries once on connection-level failures, then succeeds", async () => {
    const fn = vi.fn().mockRejectedValueOnce(connectionError()).mockResolvedValueOnce("recovered");
    await expect(withDbRead(fn)).resolves.toBe("recovered");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("rethrows after retries are exhausted", async () => {
    const fn = vi.fn().mockRejectedValue(connectionError());
    await expect(withDbRead(fn, 1)).rejects.toThrow("timeout exceeded");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("never retries query errors", async () => {
    const queryError = Object.assign(new Error('relation "nope" does not exist'), { code: "42P01" });
    expect(isDatabaseUnavailable(queryError)).toBe(false);
    const fn = vi.fn().mockRejectedValue(queryError);
    await expect(withDbRead(fn)).rejects.toThrow("does not exist");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
