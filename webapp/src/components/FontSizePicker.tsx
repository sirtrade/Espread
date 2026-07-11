import { useState } from "react";
import { FONT_SIZES, currentFontSize, setFontSize, type FontSizeId } from "../lib/fontSize.js";
import { hapticSelect } from "../telegram/telegram.js";

const SAMPLE = "Los científicos anunciaron un hallazgo relevante en la región.";

/** Font-size switcher with a live sample paragraph rendered at the chosen size. */
export function FontSizePicker() {
  const [active, setActive] = useState<FontSizeId>(() => currentFontSize());

  function pick(id: FontSizeId) {
    hapticSelect();
    setFontSize(id);
    setActive(id);
  }

  const activeCss = FONT_SIZES.find((s) => s.id === active)!.css;

  return (
    <div>
      <div className="mb-3 flex items-end gap-2">
        {FONT_SIZES.map((s) => (
          <button
            key={s.id}
            onClick={() => pick(s.id)}
            aria-label={s.label}
            title={s.label}
            className={`flex-1 rounded-xl border py-2 text-center font-serif leading-none ${
              s.id === active ? "border-[var(--tg-accent)] bg-subtle" : "border-transparent bg-bg"
            }`}
            style={{ fontSize: s.css }}
          >
            A
          </button>
        ))}
      </div>
      <p className="font-serif" style={{ fontSize: activeCss, lineHeight: 1.6 }}>
        {SAMPLE}
      </p>
    </div>
  );
}
