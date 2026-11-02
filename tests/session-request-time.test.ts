import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";

const { connectionMock, cookiesMock, dbLimit } = vi.hoisted(() => ({
  connectionMock: vi.fn(),
  cookiesMock: vi.fn(),
  dbLimit: vi.fn(),
}));

vi.mock("next/server", async (importOriginal) => {
  const original = await importOriginal<typeof import("next/server")>();
  return { ...original, connection: (...args: unknown[]) => connectionMock(...args) };
});

vi.mock("next/headers", () => ({
  cookies: (...args: unknown[]) => cookiesMock(...args),
}));

vi.mock("@/db", () => ({
  getDb: () => ({
    select: () => ({ from: () => ({ innerJoin: () => ({ where: () => ({ limit: dbLimit }) }) }) }),
  }),
  withDbRead: (fn: () => unknown) => fn(),
  isDatabaseUnavailable: () => false,
}));

const AUTH_SECRET = "test-secret-0123456789abcdef-test";

vi.mock("@/lib/config", () => ({
  getConfig: () => ({ AUTH_SECRET }),
  isProduction: () => false,
}));

import { getSession } from "@/lib/session";
import { SESSION_COOKIE } from "@/lib/auth-session";

function signedCookie(token: string): string {
  const signature = createHmac("sha256", AUTH_SECRET).update(token).digest("base64");
  return `${token}.${signature}`;
}

const sessionRow = {
  sessionId: "s1",
  expiresAt: new Date(Date.now() + 3600_000),
  id: "u1",
  email: "member@example.com",
  name: "Member",
  shortId: "M-1",
  role: "user",
  status: "active",
  category: "individual",
  providerKind: null,
  emailVerified: true,
};

describe("getSession request-time behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    connectionMock.mockResolvedValue(undefined);
    dbLimit.mockResolvedValue([sessionRow]);
  });

  it("waits for connection() before reading cookies or the current time", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    connectionMock.mockReturnValueOnce(gate);
    cookiesMock.mockResolvedValue({
      get: (name: string) => (name === SESSION_COOKIE ? { value: signedCookie("tok") } : undefined),
    });

    const pending = getSession();
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    // Without `await connection()` first, cookies() is read immediately and a
    // runtime prerender proceeds into the `new Date()` session-expiry check,
    // crashing the route ("unstable value `new Date()` while prerendering").
    expect(connectionMock).toHaveBeenCalledTimes(1);
    expect(cookiesMock).not.toHaveBeenCalled();

    release();
    const session = await pending;
    expect(cookiesMock).toHaveBeenCalled();
    expect(session?.user.id).toBe("u1");
    expect(session?.session.id).toBe("s1");
  });

  it("returns null without a session cookie", async () => {
    cookiesMock.mockResolvedValue({ get: () => undefined });
    await expect(getSession()).resolves.toBe(null);
    expect(connectionMock).toHaveBeenCalledTimes(1);
  });
});
