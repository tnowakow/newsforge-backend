import { useEffect, useState } from "react";
import { API_BASE } from "../api/client";
import { cn } from "../lib/cn";

/**
 * Render the client's SVG logo. If `logoUrl` is a data URL we drop it straight
 * into the `<img>`. Otherwise we resolve it relative to the API origin so the
 * Vite proxy serves it in dev and same-origin works in prod.
 */
export function ClientLogo({
  logoUrl,
  name,
  className,
  size = 40,
}: {
  logoUrl: string;
  name: string;
  className?: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [logoUrl]);

  if (!logoUrl || failed) {
    return <InitialsBadge name={name} className={className} size={size} />;
  }

  const resolved = resolveLogoUrl(logoUrl);
  return (
    <img
      src={resolved}
      alt={`${name} logo`}
      width={size}
      height={size}
      className={cn("object-contain rounded-sm bg-white", className)}
      onError={() => setFailed(true)}
      loading="lazy"
    />
  );
}

function resolveLogoUrl(url: string): string {
  if (url.startsWith("data:") || url.startsWith("http")) return url;
  if (url.startsWith("/")) return `${API_BASE}${url}`;
  return url;
}

function InitialsBadge({
  name,
  className,
  size,
}: {
  name: string;
  className?: string;
  size: number;
}) {
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <div
      className={cn(
        "rounded-md bg-brand-primary/10 text-brand-primary flex items-center justify-center font-semibold",
        className,
      )}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      aria-label={`${name} logo placeholder`}
    >
      {initials}
    </div>
  );
}
