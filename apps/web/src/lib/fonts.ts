/**
 * Dynamically load a Google Font into <head>. Caches by family so the same
 * font isn't requested twice. Safe to call on every workspace mount.
 */
const loaded = new Set<string>();

function familyParam(family: string): string {
  return family.replace(/\s+/g, "+");
}

export function loadGoogleFont(family: string, weights: number[] = [400, 600, 700]): void {
  if (!family) return;
  const key = `${family}::${weights.join(",")}`;
  if (loaded.has(key)) return;
  loaded.add(key);

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.dataset.googleFont = key;
  link.href =
    `https://fonts.googleapis.com/css2?family=${familyParam(family)}:wght@${weights.join(";")}` +
    `&display=swap`;
  document.head.appendChild(link);
}

export function applyClientFonts(headingFont: string, bodyFont: string): void {
  loadGoogleFont(headingFont, [600, 700]);
  loadGoogleFont(bodyFont, [400, 500, 700]);
  const root = document.documentElement;
  root.style.setProperty("--client-heading-font", `"${headingFont}"`);
  root.style.setProperty("--client-body-font", `"${bodyFont}"`);
}
