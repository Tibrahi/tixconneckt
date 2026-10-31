"use client";

/** Typed client error carrying the HTTP status and server message. */
export class ApiClientError extends Error {
  readonly status: number;
  readonly retryable: boolean;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    // 503/429/408 deserve an automatic or manual retry; 4xx (except those)
    // are caller mistakes and must surface immediately.
    this.retryable = status === 408 || status === 429 || status >= 500;
  }
}

export interface ApiFetchOptions extends RequestInit {
  /** Abort the request after this long so loading states always clear. */
  timeoutMs?: number;
}

/**
 * Typed fetch for `{ ok, data, error }` API envelopes. Always resolves or
 * throws ApiClientError — never leaves a caller hanging: every request has
 * a timeout (default 25s) and honors an external AbortSignal for unmounts.
 */
export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { timeoutMs = 25_000, signal: externalSignal, ...init } = options;
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  externalSignal?.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(path, { cache: "no-store", ...init, signal: controller.signal });
    const body = (await res.json().catch(() => null)) as {
      ok?: boolean;
      data?: T;
      error?: string;
    } | null;
    if (!res.ok || !body?.ok) {
      const status = res.status || 500;
      const message =
        body?.error ??
        (status === 503
          ? "The service is busy. Please try again in a moment."
          : status === 429
            ? "Too many requests. Please slow down and try again."
            : "Something went wrong. Please try again.");
      throw new ApiClientError(message, status);
    }
    return body.data as T;
  } catch (error) {
    if (error instanceof ApiClientError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      if (externalSignal?.aborted) throw error;
      throw new ApiClientError("The request took too long. Please try again.", 408);
    }
    throw new ApiClientError(
      error instanceof Error ? error.message : "Your connection was interrupted. Please try again.",
      0,
    );
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener("abort", onAbort);
  }
}
