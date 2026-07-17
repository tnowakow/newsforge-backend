import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  hover?: boolean;
  as?: "div" | "button" | "a";
  href?: string;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ hover = true, className, children, ...rest }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "bg-surface border border-rule rounded-xl shadow-card",
          "transition-all duration-150 ease-standard",
          hover && "hover:-translate-y-0.5 hover:shadow-card-hover hover:border-ink/15",
          className,
        )}
        {...rest}
      >
        {children}
      </div>
    );
  },
);
Card.displayName = "Card";
