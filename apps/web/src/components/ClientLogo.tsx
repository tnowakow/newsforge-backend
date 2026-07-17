import { cn } from "@/lib/cn";

export function ClientLogo({
  name,
  logoUrl,
  bgColor = "#1F4D8C",
  size = "md",
  className,
}: {
  name: string;
  logoUrl?: string | null;
  bgColor?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizeCls =
    size === "lg"
      ? "h-16 w-16 text-xl"
      : size === "sm"
        ? "h-10 w-10 text-sm"
        : "h-14 w-14 text-lg";

  return (
    <div
      className={cn(
        sizeCls,
        "rounded-lg grid place-items-center text-white font-display font-bold shadow-card shrink-0",
        className,
      )}
      style={{ backgroundColor: bgColor }}
      aria-hidden
    >
      {logoUrl ? (
        <img
          src={logoUrl}
          alt=""
          className="h-full w-full object-cover rounded-lg"
        />
      ) : (
        <span>{name.charAt(0).toUpperCase()}</span>
      )}
    </div>
  );
}
