export type ThemeId = "claro" | "sepia" | "oscuro" | "ambar";

export interface ThemeOption {
  id: ThemeId;
  label: string;
  /** Preview colors for the picker swatches. */
  bg: string;
  fg: string;
}

/** One daytime theme + three evening themes (warm, low blue light, no pure black/white). */
export const THEMES: ThemeOption[] = [
  { id: "claro", label: "Claro", bg: "#faf6ef", fg: "#2a241d" },
  { id: "sepia", label: "Sepia", bg: "#ecdfc6", fg: "#43351f" },
  { id: "oscuro", label: "Oscuro suave", bg: "#262220", fg: "#d9d0c1" },
  { id: "ambar", label: "Ámbar nocturno", bg: "#1c1712", fg: "#d8b98c" },
];

const THEME_KEY = "lector_theme";

export function storedTheme(): ThemeId | null {
  const v = localStorage.getItem(THEME_KEY);
  return THEMES.some((t) => t.id === v) ? (v as ThemeId) : null;
}

/** The theme currently in effect: the user's choice, or one derived from Telegram's light/dark. */
export function currentTheme(): ThemeId {
  return storedTheme() ?? (document.documentElement.classList.contains("dark") ? "oscuro" : "claro");
}

export function setTheme(id: ThemeId): void {
  localStorage.setItem(THEME_KEY, id);
  applyTheme(id);
}

function applyTheme(id: ThemeId): void {
  document.documentElement.setAttribute("data-theme", id);
}

/** Applies the persisted theme on startup; without one the app keeps following Telegram's scheme. */
export function initTheme(): void {
  const t = storedTheme();
  if (t) applyTheme(t);
}
