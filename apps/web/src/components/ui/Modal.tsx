import {
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Tailwind width classes, default w-[480px] */
  widthClass?: string;
  labelledBy?: string;
  closeOnScrimClick?: boolean;
}

export function Modal({
  open,
  onClose,
  children,
  widthClass = "w-[480px]",
  labelledBy,
  closeOnScrimClick = true,
}: ModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const lastFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    lastFocused.current = document.activeElement as HTMLElement | null;
    const root = containerRef.current;
    // focus first focusable
    const focusables = root?.querySelectorAll<HTMLElement>(
      'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])',
    );
    focusables?.[0]?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "Tab" && focusables && focusables.length > 0) {
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      lastFocused.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      aria-modal="true"
      role="dialog"
      aria-labelledby={labelledBy}
      className="fixed inset-0 z-[90] flex items-center justify-center p-6 animate-fadeIn"
    >
      <div
        className="absolute inset-0 scrim"
        onClick={closeOnScrimClick ? onClose : undefined}
      />
      <div
        ref={containerRef}
        className={cn(
          "relative bg-surface rounded-xl shadow-card-hover border border-rule",
          "max-h-[90vh] overflow-auto",
          widthClass,
        )}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function ModalHeader({
  title,
  subtitle,
  icon,
  onClose,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="px-5 pt-4 pb-3 border-b border-rule flex items-start justify-between">
      <div>
        <div className="flex items-center gap-2 font-display font-semibold text-base">
          {icon}
          <span>{title}</span>
        </div>
        {subtitle && (
          <div className="text-sm text-ink-muted mt-0.5">{subtitle}</div>
        )}
      </div>
      <button
        aria-label="Close"
        onClick={onClose}
        className="text-ink-muted hover:text-ink text-lg leading-none px-1 -mr-1 -mt-1"
      >
        ×
      </button>
    </div>
  );
}
