export type FontSizeId = "sm" | "md" | "lg" | "xl";

export interface FontSizeOption {
  id: FontSizeId;
  label: string;
  /** Font-size for the picker's preview sample (relative reader-text ramp). */
  css: string;
  /** Root font-size the whole UI scales to (applied by applyFontSize). */
  rootScale: string;
}

// The setting scales the entire interface, not just the reader: applyFontSize
// drives the root font-size, and every rem-based Tailwind utility cascades
// from it, so chrome and article text grow together.
export const FONT_SIZES: FontSizeOption[] = [
  { id: "sm", label: "Pequeño", css: "1rem", rootScale: "90%" },
  { id: "md", label: "Normal", css: "1.125rem", rootScale: "100%" },
  { id: "lg", label: "Grande", css: "1.3rem", rootScale: "115%" },
  { id: "xl", label: "Muy grande", css: "1.5rem", rootScale: "130%" },
];

const FONT_SIZE_KEY = "lector_font_size";
const DEFAULT_SIZE: FontSizeId = "md";

export function currentFontSize(): FontSizeId {
  const v = localStorage.getItem(FONT_SIZE_KEY);
  return FONT_SIZES.some((s) => s.id === v) ? (v as FontSizeId) : DEFAULT_SIZE;
}

export function setFontSize(id: FontSizeId): void {
  localStorage.setItem(FONT_SIZE_KEY, id);
  applyFontSize(id);
}

function applyFontSize(id: FontSizeId): void {
  const opt = FONT_SIZES.find((s) => s.id === id) ?? FONT_SIZES[1];
  // Scale the root font-size: every rem-based Tailwind utility (spacing,
  // typography) and the reader text cascade from it, so the whole UI grows
  // in step. The attribute is kept for styling hooks / inspection.
  document.documentElement.style.fontSize = opt.rootScale;
  document.documentElement.setAttribute("data-fontsize", id);
}

export function initFontSize(): void {
  applyFontSize(currentFontSize());
}
