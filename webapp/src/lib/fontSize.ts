export type FontSizeId = "sm" | "md" | "lg" | "xl";

export interface FontSizeOption {
  id: FontSizeId;
  label: string;
  /** CSS font-size applied to the article text (and used by the preview). */
  css: string;
}

export const FONT_SIZES: FontSizeOption[] = [
  { id: "sm", label: "Pequeño", css: "1rem" },
  { id: "md", label: "Normal", css: "1.125rem" },
  { id: "lg", label: "Grande", css: "1.3rem" },
  { id: "xl", label: "Muy grande", css: "1.5rem" },
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
  document.documentElement.setAttribute("data-fontsize", id);
}

export function initFontSize(): void {
  applyFontSize(currentFontSize());
}
