"use client";
import * as React from "react";
import { CheckCircle2, AlertTriangle, Info } from "lucide-react";
import { cn, newId } from "@/lib/utils";

type Tone = "success" | "error" | "info";
interface ToastItem {
  id: string;
  message: string;
  tone: Tone;
}
interface ToastApi {
  toast: (message: string, tone?: Tone) => void;
}

const ToastContext = React.createContext<ToastApi>({ toast: () => {} });
export const useToast = () => React.useContext(ToastContext);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);

  const toast = React.useCallback((message: string, tone: Tone = "success") => {
    const id = newId();
    setItems((cur) => [...cur.slice(-2), { id, message, tone }]);
    setTimeout(() => setItems((cur) => cur.filter((t) => t.id !== id)), tone === "error" ? 6000 : 3000);
  }, []);

  const api = React.useMemo(() => ({ toast }), [toast]);
  const Icon = { success: CheckCircle2, error: AlertTriangle, info: Info };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 z-[60] flex flex-col items-center gap-2 px-4"
        style={{ bottom: "calc(var(--nav-h) + env(safe-area-inset-bottom) + 84px)" }}
      >
        {items.map((t) => {
          const I = Icon[t.tone];
          return (
            <div
              key={t.id}
              role="status"
              className={cn(
                "animate-sheet-up pointer-events-auto flex max-w-md items-center gap-2.5 rounded-2xl px-4 py-3 text-sm font-medium shadow-lg",
                t.tone === "error" ? "bg-destructive text-white" : "bg-foreground text-white",
              )}
            >
              <I className="size-5 shrink-0" />
              <span>{t.message}</span>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
