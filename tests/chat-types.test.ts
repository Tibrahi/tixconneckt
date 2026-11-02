import { describe, expect, it } from "vitest";
import { readApi } from "@/components/chat/types";

describe("readApi", () => {
  it("returns data from a healthy envelope", async () => {
    const res = new Response(JSON.stringify({ ok: true, data: { calls: [] } }), { status: 200 });
    await expect(readApi<{ calls: unknown[] }>(res)).resolves.toEqual({ calls: [] });
  });

  it("passes server error messages through", async () => {
    const res = new Response(JSON.stringify({ ok: false, error: "Call not found." }), { status: 404 });
    await expect(readApi(res)).rejects.toThrow("Call not found.");
  });

  it("turns an empty 500 body into a friendly error, never a JSON crash", async () => {
    const res = new Response("", { status: 500 });
    await expect(readApi(res)).rejects.toThrow("HTTP 500");
    await expect(readApi(new Response("", { status: 500 }))).rejects.not.toThrow("JSON");
  });

  it("turns a non-JSON body into a friendly error", async () => {
    const res = new Response("<html>bad gateway</html>", { status: 502 });
    await expect(readApi(res)).rejects.toThrow("unreadable response");
  });
});
