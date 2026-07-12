import type { BankItem } from "../api/types.js";
import { displayLemma } from "../lib/vocab.js";

export function BankChip({ item }: { item: BankItem }) {
  const dotColor = item.isPhrase ? "bg-teal" : "bg-amber";
  return (
    <div className="flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-sm text-text shadow-sm">
      <span className={`h-2 w-2 shrink-0 rounded-full ${dotColor}`} />
      <span className="max-w-[9rem] truncate">{displayLemma(item)}</span>
    </div>
  );
}
