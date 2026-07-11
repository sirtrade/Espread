import { useState } from "react";
import { THEMES, currentTheme, setTheme, type ThemeId } from "../lib/theme.js";
import { hapticSelect } from "../telegram/telegram.js";

/** Round color swatches to switch the reading theme. `withLabels` adds the
 *  theme names underneath (Settings); without them it stays compact (Reading). */
export function ThemePicker({ withLabels = false }: { withLabels?: boolean }) {
  const [active, setActive] = useState<ThemeId>(() => currentTheme());

  function pick(id: ThemeId) {
    hapticSelect();
    setTheme(id);
    setActive(id);
  }

  return (
    <div className="flex gap-3">
      {THEMES.map((t) => (
        <button
          key={t.id}
          onClick={() => pick(t.id)}
          aria-label={t.label}
          title={t.label}
          className="flex flex-col items-center gap-1"
        >
          <span
            className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-semibold ${
              t.id === active ? "border-[var(--tg-accent)]" : "border-transparent"
            }`}
            style={{ backgroundColor: t.bg, color: t.fg }}
          >
            Aa
          </span>
          {withLabels && <span className="text-[10px] text-subtext">{t.label}</span>}
        </button>
      ))}
    </div>
  );
}
