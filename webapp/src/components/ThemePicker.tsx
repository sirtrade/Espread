import { useState } from "react";
import { THEMES, currentTheme, setTheme, type ThemeId } from "../lib/theme.js";
import { hapticSelect } from "../telegram/telegram.js";
import { useT } from "../lib/i18n.js";

/** Round color swatches to switch the reading theme. `withLabels` adds the
 *  theme names underneath (Settings); without them it stays compact (Reading). */
export function ThemePicker({ withLabels = false }: { withLabels?: boolean }) {
  const { t } = useT();
  const [active, setActive] = useState<ThemeId>(() => currentTheme());

  function pick(id: ThemeId) {
    hapticSelect();
    setTheme(id);
    setActive(id);
  }

  return (
    <div className="flex gap-3">
      {THEMES.map((theme) => {
        const label = t(`theme.${theme.id}`);
        return (
          <button
            key={theme.id}
            onClick={() => pick(theme.id)}
            aria-label={label}
            title={label}
            className="flex flex-col items-center gap-1"
          >
            <span
              className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-semibold ${
                theme.id === active ? "border-[var(--tg-accent)]" : "border-transparent"
              }`}
              style={{ backgroundColor: theme.bg, color: theme.fg }}
            >
              Aa
            </span>
            {withLabels && <span className="text-[10px] text-subtext">{label}</span>}
          </button>
        );
      })}
    </div>
  );
}
