import { useState } from "react";
import { THEMES, currentTheme, setTheme, type ThemeId } from "../lib/theme.js";
import { hapticSelect } from "../telegram/telegram.js";
import { useT } from "../lib/i18n.js";
import { api } from "../api/client.js";
import { useAuth } from "../state/AuthContext.js";

/** Round color swatches to switch the reading theme. `withLabels` adds the
 *  theme names underneath (Settings); without them it stays compact (Reading). */
export function ThemePicker({ withLabels = false }: { withLabels?: boolean }) {
  const { t } = useT();
  const { setProfile } = useAuth();
  const [active, setActive] = useState<ThemeId>(() => currentTheme());

  function pick(id: ThemeId) {
    hapticSelect();
    setTheme(id);
    setActive(id);
    // Persist on the profile so the choice follows the user across devices.
    // The theme is already applied locally, so a failed save is non-fatal.
    api
      .patchMe({ theme: id })
      .then(setProfile)
      .catch(() => {});
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
