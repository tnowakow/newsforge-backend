import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

type ToastTone = "info" | "success" | "warn" | "error";

export interface ToastItem {
  id: string;
  message: string;
  tone: ToastTone;
  action?: { label: string; onClick: () => void };
  ttlMs: number;
}

interface ToastContextValue {
  toast: (
    message: string,
    opts?: { tone?: ToastTone; ttlMs?: number; action?: ToastItem["action"] },
  ) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setItems((cur) => cur.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback<ToastContextValue["toast"]>(
    (message, opts) => {
      const id = Math.random().toString(36).slice(2, 9);
      const item: ToastItem = {
        id,
        message,
        tone: opts?.tone ?? "info",
        action: opts?.action,
        ttlMs: opts?.ttlMs ?? 4000,
      };
      setItems((cur) => [...cur, item]);
      return id;
    },
    [],
  );

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 w-80 pointer-events-none">
        {items.map((t) => (
          <ToastView key={t.id} item={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastView({
  item,
  onDismiss,
}: {
  item: ToastItem;
  onDismiss: (id: string) => void;
}) {
  useEffect(() => {
    const handle = window.setTimeout(() => onDismiss(item.id), item.ttlMs);
    return () => window.clearTimeout(handle);
  }, [item.id, item.ttlMs, onDismiss]);

  const tones: Record<ToastTone, string> = {
    info: "bg-surface border-rule text-ink",
    success: "bg-surface border-success/30 text-ink",
    warn: "bg-surface border-warn/40 text-ink",
    error: "bg-surface border-error/40 text-ink",
  };
  const dot: Record<ToastTone, string> = {
    info: "bg-accent",
    success: "bg-success",
    warn: "bg-warn",
    error: "bg-error",
  };

  return (
    <div
      role="status"
      className={`pointer-events-auto animate-fadeIn shadow-card border rounded-lg px-3 py-2.5 flex items-start gap-3 ${tones[item.tone]}`}
    >
      <span className={`mt-1.5 h-2 w-2 rounded-full flex-none ${dot[item.tone]}`} />
      <div className="flex-1 text-sm leading-snug">{item.message}</div>
      {item.action && (
        <button
          className="text-sm text-accent font-medium hover:underline"
          onClick={() => {
            item.action!.onClick();
            onDismiss(item.id);
          }}
        >
          {item.action.label}
        </button>
      )}
      <button
        aria-label="Dismiss"
        onClick={() => onDismiss(item.id)}
        className="text-ink-muted hover:text-ink text-base leading-none px-1"
      >
        ×
      </button>
    </div>
  );
}
