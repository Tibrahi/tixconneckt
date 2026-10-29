import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

export interface ApiErrorBody {
  ok: false;
  error: string;
  correlationId: string;
  details?: Record<string, string[]>;
}

export interface ApiSuccessBody<T> {
  ok: true;
  data: T;
}

/** Consistent plain-language error envelope with a correlation id for logs. */
export function apiError(
  message: string,
  status = 400,
  details?: Record<string, string[]>,
  headers?: Record<string, string>,
): NextResponse<ApiErrorBody> {
  const correlationId = randomUUID();
  console.error(`[api:error:${correlationId}] ${message}`);
  return NextResponse.json(
    { ok: false as const, error: message, correlationId, details },
    { status, headers },
  );
}

export function apiOk<T>(data: T, status = 200, headers?: Record<string, string>): NextResponse<ApiSuccessBody<T>> {
  return NextResponse.json({ ok: true as const, data }, { status, headers });
}

/** Extract client IP for audit/rate-limit logging. */
export function clientIp(req: Request): string | undefined {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? undefined;
}
