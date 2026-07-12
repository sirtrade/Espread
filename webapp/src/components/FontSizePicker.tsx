import { useState } from "react";
import { FONT_SIZES, currentFontSize, setFontSize, type FontSizeId } from "../lib/fontSize.js";
import { hapticSelect } from "../telegram/telegram.js";
import { useT } from "../lib/i18n.js";
import { api } from "../api/client.js";
import { useAuth } from "../state/AuthContext.js";

// A Spanish line, on purpose: it previews how article text (learning content)
// will look at each size, so it stays Spanish regardless of the chrome language.
const SAMPLE = "Los científicos anunciaron un hallazgo relevante en la región.";

/** Font-size switcher with a live sample paragraph rendered at the chosen size. */
export function FontSizePicker() {
  const { t } = useT();
  const { setProfile } = useAuth();
  const [active, setActive] = useState<FontSizeId>(() => currentFontSize());

  function pick(id: FontSizeId) {
    hapticSelect();
    setFontSize(id);
    setActive(id);
    // Persist on the profile so the choice follows the user across devices.
    // The size is already applied locally, so a failed save is non-fatal.
    api
      .patchMe({ fontSize: id })
      .then(setProfile)
      .catch(() => {});
  }

  const activeCss = FONT_SIZES.find((s) => s.id === active)!.css;

  return (
    <div>
      <div className="mb-3 flex items-end gap-2">
        {FONT_SIZES.map((s) => {
          const label = t(`font.${s.id}`);
          return (
            <button
              key={s.id}
              onClick={() => pick(s.id)}
              aria-label={label}
              title={label}
              className={`flex-1 rounded-xl border py-2 text-center font-serif leading-none ${
                s.id === active ? "border-[var(--tg-accent)] bg-subtle" : "border-transparent bg-bg"
              }`}
              style={{ fontSize: s.css }}
            >
              A
            </button>
          );
        })}
      </div>
      <p className="font-serif" style={{ fontSize: activeCss, lineHeight: 1.6 }}>
        {SAMPLE}
      </p>
    </div>
  );
}
