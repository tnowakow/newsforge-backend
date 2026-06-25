/**
 * Convert a #RRGGBB hex (or rgb(...) string) into "r g b" suitable for a
 * Tailwind `rgb(var(--brand-primary-rgb) / <alpha>)` setup.
 */
export function hexToRgbTriplet(input: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(input.trim());
  if (m) {
    const hex = m[1]!;
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `${r} ${g} ${b}`;
  }
  const short = /^#?([0-9a-f]{3})$/i.exec(input.trim());
  if (short) {
    const hex = short[1]!;
    const r = parseInt(hex[0]! + hex[0]!, 16);
    const g = parseInt(hex[1]! + hex[1]!, 16);
    const b = parseInt(hex[2]! + hex[2]!, 16);
    return `${r} ${g} ${b}`;
  }
  const rgb = /rgb\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)/i.exec(input);
  if (rgb) return `${rgb[1]} ${rgb[2]} ${rgb[3]}`;
  // Fallback: Porter blue.
  return "27 79 138";
}

export function applyBrandColors(input: {
  primary: string;
  secondary: string;
  accent: string;
}): void {
  const root = document.documentElement;
  root.style.setProperty("--brand-primary-rgb", hexToRgbTriplet(input.primary));
  root.style.setProperty("--brand-secondary-rgb", hexToRgbTriplet(input.secondary));
  root.style.setProperty("--brand-accent-rgb", hexToRgbTriplet(input.accent));
}

export function resetBrandColors(): void {
  const root = document.documentElement;
  root.style.setProperty("--brand-primary-rgb", "27 79 138");
  root.style.setProperty("--brand-secondary-rgb", "22 64 111");
  root.style.setProperty("--brand-accent-rgb", "200 162 64");
}
