"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type ToastVariant = "success" | "error" | "info";

type ToastItem = {
  id: string;
  title?: string;
  message: string;
  variant: ToastVariant;
};

type ToastInput = {
  title?: string;
  message: string;
  variant?: ToastVariant;
  durationMs?: number;
};

type ToastContextValue = {
  pushToast: (input: ToastInput) => void;
  dismissToast: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

function toneClasses(variant: ToastVariant) {
  if (variant === "success") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }

  if (variant === "error") {
    return "border-rose-200 bg-rose-50 text-rose-800";
  }

  return "border-sky-200 bg-sky-50 text-sky-800";
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const pushToast = useCallback(
    ({ title, message, variant = "info", durationMs = 3200 }: ToastInput) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      setToasts((prev) => [...prev, { id, title, message, variant }]);
      setTimeout(() => dismissToast(id), durationMs);
    },
    [dismissToast],
  );

  const value = useMemo(() => ({ pushToast, dismissToast }), [pushToast, dismissToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}

      <div className="pointer-events-none fixed right-4 top-4 z-[70] flex w-full max-w-sm flex-col gap-2">
        {toasts.map((toast) => (
          <div key={toast.id} className={`pointer-events-auto rounded-xl border px-3 py-2 shadow-sm ${toneClasses(toast.variant)}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-0.5">
                {toast.title ? <p className="text-sm font-semibold">{toast.title}</p> : null}
                <p className="text-sm">{toast.message}</p>
              </div>
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  dismissToast(toast.id);
                }}
                className="rounded-md px-1.5 py-0.5 text-xs opacity-70 transition hover:opacity-100"
              >
                Dismiss
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }

  return context;
}
