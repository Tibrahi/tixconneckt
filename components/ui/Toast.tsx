"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { Icon } from "./Icon";

export type ToastTone = "success" | "error" | "info";

interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ToastContextValue {
  notify: (message: string, tone?: ToastTone) => void;
  success: (message: string) => void;
  error: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue>({
  notify: () => {},
  success: () => {},
  error: () => {},
});

export function useToast(): ToastContextValue {
  return useContext(ToastContext);
}

const TONES: Record<ToastTone, { icon: string; classes: string }> = {
  success: { icon: "check", classes: "border-blue-300 bg-blue-50 text-blue-950" },
  error: { icon: "warning", classes: "border-blue-300 bg-blue-50 text-blue-950" },
  info: { icon: "circle-info", classes: "border-neutral-300 bg-white text-black" },
};

/**
 * Global success/error notifications. Call `success()` only after the
 * backend confirms the operation — never optimistically before the call.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((items) => items.filter((t) => t.id !== id));
  }, []);

  const notify = useCallback(
    (message: string, tone: ToastTone = "info") => {
      const id = nextId.current++;
      setToasts((items) => [...items.slice(-3), { id, tone, message }]);
      setTimeout(() => dismiss(id), tone === "error" ? 7000 : 4500);
    },
    [dismiss],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      notify,
      success: (message: string) => notify(message, "success"),
      error: (message: string) => notify(message, "error"),
    }),
    [notify],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed bottom-4 left-1/2 z-[100] flex w-full max-w-md -translate-x-1/2 flex-col items-center gap-2 px-4">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className={`pointer-events-auto flex w-full items-start gap-2 rounded-lg border px-4 py-3 text-sm font-medium shadow-lg ${TONES[toast.tone].classes}`}
          >
            <span className="mt-0.5 shrink-0" aria-hidden="true">
              <Icon name={TONES[toast.tone].icon} />
            </span>
            <span className="flex-1">{toast.message}</span>
            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={() => dismiss(toast.id)}
              className="shrink-0 rounded p-0.5 opacity-70 hover:opacity-100"
            >
              <Icon name="xmark" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
