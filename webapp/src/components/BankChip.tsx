import type { BankItem } from "../api/types.js";
import { displayLemma } from "../lib/vocab.js";
import { useT } from "../lib/i18n.js";

export function BankChip({ item }: { item: BankItem }) {
  const { t } = useT();
  const dotColor = item.isPhrase ? "bg-teal" : "bg-amber";
  return (
    <div className="flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-sm text-text shadow-sm">
      <span className={`h-2 w-2 shrink-0 rounded-full ${dotColor}`} />
      <span className="max-w-[9rem] truncate">{displayLemma(item)}</span>
      <span className="flex gap-0.5" title={t("bank.cleanStreakTitle", { n: item.cleanStreak, total: 3 })}>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={`h-1.5 w-1.5 rounded-full ${i < item.cleanStreak ? dotColor : "dot-empty"}`}
          />
        ))}
      </span>
    </div>
  );
}
