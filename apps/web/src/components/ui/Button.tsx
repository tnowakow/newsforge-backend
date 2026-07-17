import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
}

const variants: Record<Variant, string> = {
  primary:
    "bg-porter text-white hover:bg-porter-600 active:bg-porter-700 disabled:bg-porter/40 disabled:cursor-not-allowed",
  secondary:
    "bg-surface text-ink border border-rule hover:border-ink/30 hover:bg-rule/30 disabled:opacity-50 disabled:cursor-not-allowed",
  ghost:
    "bg-transparent text-ink hover:bg-porter-50 disabled:opacity-50 disabled:cursor-not-allowed",
  danger:
    "bg-error text-white hover:bg-error/90 disabled:opacity-50 disabled:cursor-not-allowed",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-sm rounded-md",
  md: "h-10 px-4 text-sm rounded-md",
  lg: "h-12 px-5 text-base rounded-lg",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "secondary",
      size = "md",
      loading,
      iconLeft,
      iconRight,
      children,
      className,
      disabled,
      ...rest
    },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          "inline-flex items-center justify-center gap-2 font-medium",
          "transition-colors duration-150 ease-standard",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-porter focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
          variants[variant],
          sizes[size],
          className,
        )}
        {...rest}
      >
        {loading && (
          <span className="h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
        )}
        {!loading && iconLeft}
        {children}
        {!loading && iconRight}
      </button>
    );
  },
);
Button.displayName = "Button";
