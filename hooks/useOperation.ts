"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type OperationStatus = "idle" | "loading" | "success" | "error";

export interface OperationState {
  status: OperationStatus;
  error: string | null;
  /** True while the operation is in flight; safe to bind to Button loading. */
  loading: boolean;
}

export type OperationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; duplicate: boolean };

/**
 * Consistent operation lifecycle: idle → loading → success | error.
 * - Guards duplicate submissions while a run is in flight.
 * - Always clears `loading`, on success, failure, and unmount.
 * - Preserves the caller's form state (it never touches inputs).
 * - Returns a discriminated result so callers never read stale state.
 */
export function useOperation() {
  const [state, setState] = useState<OperationState>({ status: "idle", error: null, loading: false });
  const runningRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const run = useCallback(async <T,>(task: () => Promise<T>): Promise<OperationResult<T>> => {
    if (runningRef.current) {
      return { ok: false, error: "Already in progress. Please wait.", duplicate: true };
    }
    runningRef.current = true;
    if (mountedRef.current) setState({ status: "loading", error: null, loading: true });
    try {
      const value = await task();
      if (mountedRef.current) setState({ status: "success", error: null, loading: false });
      return { ok: true, value };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Something went wrong. Please try again.";
      if (mountedRef.current) setState({ status: "error", error: message, loading: false });
      return { ok: false, error: message, duplicate: false };
    } finally {
      runningRef.current = false;
    }
  }, []);

  const reset = useCallback(() => {
    if (mountedRef.current) setState({ status: "idle", error: null, loading: false });
  }, []);

  return { ...state, run, reset };
}
