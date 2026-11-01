import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/action-worker", () => ({
  runDueActions: vi.fn(async () => ({
    reminded: 1,
    executed: 2,
    failed: 0,
    recovered: 0,
    overduePending: 0,
  })),
}));

import { GET, POST } from "@/app/api/cron/actions/route";
import { runDueActions } from "@/lib/action-worker";

const SECRET = "test-cron-secret-32-chars-minimum-ok";

function authed(method: "GET" | "POST", secret?: string): Request {
  const headers: Record<string, string> = {};
  if (secret !== undefined) headers.authorization = `Bearer ${secret}`;
  return new Request("https://tixconneckt.test/api/cron/actions", { method, headers });
}

describe("cron actions trigger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = SECRET;
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it("rejects GET without credentials", async () => {
    const res = await GET(authed("GET"));
    expect(res.status).toBe(401);
    expect(runDueActions).not.toHaveBeenCalled();
  });

  it("rejects GET with the wrong secret", async () => {
    const res = await GET(authed("GET", "wrong"));
    expect(res.status).toBe(401);
    expect(runDueActions).not.toHaveBeenCalled();
  });

  it("runs the worker on GET with the CRON_SECRET bearer token", async () => {
    const res = await GET(authed("GET", SECRET));
    expect(res.status).toBe(200);
    expect(runDueActions).toHaveBeenCalledTimes(1);
    const body = (await res.json()) as { ok: boolean; data: Record<string, number> };
    expect(body.ok).toBe(true);
    expect(body.data.executed).toBe(2);
    expect(body.data.overduePending).toBe(0);
  });

  it("runs the worker on POST with the CRON_SECRET bearer token", async () => {
    const res = await POST(authed("POST", SECRET));
    expect(res.status).toBe(200);
    expect(runDueActions).toHaveBeenCalledTimes(1);
  });

  it("fails closed when CRON_SECRET is not configured", async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(authed("GET", SECRET));
    expect(res.status).toBe(401);
    expect(runDueActions).not.toHaveBeenCalled();
  });
});

describe("vercel cron wiring", () => {
  it("schedules the action worker on a Hobby-safe daily tick", () => {
    const raw = fs.readFileSync(path.join(process.cwd(), "vercel.json"), "utf8");
    const config = JSON.parse(raw) as { crons?: Array<{ path?: string; schedule?: string }> };
    const job = config.crons?.find((c) => c.path === "/api/cron/actions");
    expect(job).toBeDefined();
    // Five-field cron; Hobby allows one run per day, so the minute and hour
    // fields must be pinned (no step values like */5).
    expect(job?.schedule).toMatch(/^\d{1,2} \d{1,2} \S+ \S+ \S+$/);
  });
});
