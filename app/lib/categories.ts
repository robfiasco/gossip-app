// Shared category classification — used by story cards, locked paywall, and story detail

export const CATEGORY_COLORS: Record<string, string> = {
  critical: "#ff7f86",
  ai:       "#ae88ff",
  gaming:   "#14f195",
  alpha:    "#14f195",
  mobile:   "#00c2ff",
  privacy:  "#ef77c7",
  default:  "#00c2ff",
};

export function getKickerClass(categoryRaw: string): string {
  const cat = String(categoryRaw || "").toLowerCase();
  if (/security|risk|breach|exploit|hack/.test(cat)) return "critical";
  if (/ai|agent/.test(cat)) return "ai";
  if (/gaming|game/.test(cat)) return "gaming";
  if (/alpha/.test(cat)) return "alpha";
  if (/mobile|seeker/.test(cat)) return "mobile";
  if (/privacy|zk/.test(cat)) return "privacy";
  return "";
}

export function getKickerColor(categoryRaw: string): string {
  const cls = getKickerClass(categoryRaw);
  return CATEGORY_COLORS[cls] ?? CATEGORY_COLORS.default;
}
