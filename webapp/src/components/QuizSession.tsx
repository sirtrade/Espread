import { type ReactNode, useState } from "react";
import type { PracticeAnswerResult } from "../api/types.js";
import type { SessionCard } from "../lib/cards.js";
import { Button } from "./Button.js";
import { hapticSelect, hapticSuccess } from "../telegram/telegram.js";
import { intervalDaysForStage } from "../lib/srs.js";
import { useT } from "../lib/i18n.js";

/** Server outcome of an answer; `void` when the write was best-effort and lost. */
export type AnswerOutcome = Pick<PracticeAnswerResult, "srsStage" | "status" | "advanced">;

interface RecordedAnswer {
  card: SessionCard;
  correct: boolean;
  outcome: AnswerOutcome | null;
}

interface QuizSessionProps {
  title: string;
  cards: SessionCard[];
  /** extra items still due beyond this batch (Práctica), for the header. */
  pendingCount?: number;
  /** Sends the answer to the server; returns the new learning state (or void). */
  onAnswer: (card: SessionCard, correct: boolean) => Promise<AnswerOutcome | void>;
  /** Called from the final summary's button. */
  onFinish: (summary: { correct: number; total: number }) => void;
  finishLabel?: string;
  /** Optional per-card extra UI (e.g. Práctica's free-writing exercise). */
  renderExtra?: (card: SessionCard, chosen: boolean) => ReactNode;
  /** Fired when advancing to the next card, so callers can reset extra state. */
  onNext?: () => void;
}

/** Shared question runner for the post-reading Quiz and Práctica: renders the
 *  prompt, options, after-answer feedback and progress, and a final summary of
 *  which words advanced or reset. */
export function QuizSession({
  title,
  cards,
  pendingCount = 0,
  onAnswer,
  onFinish,
  finishLabel,
  renderExtra,
  onNext,
}: QuizSessionProps) {
  const { t } = useT();
  const [index, setIndex] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  const [answers, setAnswers] = useState<RecordedAnswer[]>([]);
  const [done, setDone] = useState(false);

  const card = cards[index]!;
  const isLast = index >= cards.length - 1;

  async function pick(option: string) {
    if (chosen) return;
    hapticSelect();
    const correct = option === card.answer;
    setChosen(option);
    if (correct) hapticSuccess();

    // Record correctness synchronously so the summary count is always right,
    // then fill in the server outcome (streak/learned) once it resolves.
    setAnswers((a) => [...a, { card, correct, outcome: null }]);
    try {
      const res = await onAnswer(card, correct);
      if (res) setAnswers((a) => a.map((e) => (e.card === card ? { ...e, outcome: res } : e)));
    } catch {
      /* best-effort: a lost answer just leaves the word due */
    }
  }

  function next() {
    if (isLast) {
      setDone(true);
      return;
    }
    setChosen(null);
    onNext?.();
    setIndex((i) => i + 1);
  }

  if (done) {
    const correctCount = answers.filter((a) => a.correct).length;
    const advanced = answers.filter((a) => a.outcome?.advanced);
    const reset = answers.filter((a) => !a.correct);

    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col px-5 py-6 pb-28">
        <h1 className="mb-6 text-xl font-semibold">{title}</h1>
        <div className="rounded-2xl bg-surface px-5 py-6 text-center">
          <p className="text-3xl">🎯</p>
          <p className="mt-2 text-lg font-semibold">
            {t("quizSession.result", { correct: correctCount, total: cards.length })}
          </p>
        </div>

        {advanced.length > 0 && (
          <section className="mt-6">
            <p className="mb-2 text-sm font-medium text-subtext">{t("quizSession.advanced")}</p>
            <ul className="flex flex-col gap-2">
              {advanced.map((a) => (
                <li key={a.card.key} className="flex items-center justify-between rounded-xl bg-surface px-4 py-3">
                  <span className="font-medium">{a.card.lemma}</span>
                  <span className="text-xs text-subtext">
                    {a.outcome
                      ? a.outcome.status === "learned"
                        ? t("quizSession.mastered")
                        : t("review.wovenNextIn", { days: intervalDaysForStage(a.outcome.srsStage) })
                      : ""}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {reset.length > 0 && (
          <section className="mt-6">
            <p className="mb-2 text-sm font-medium text-subtext">{t("quizSession.reset")}</p>
            <ul className="flex flex-col gap-2">
              {reset.map((a) => (
                <li key={a.card.key} className="flex items-center justify-between rounded-xl bg-surface px-4 py-3">
                  <span className="font-medium">{a.card.lemma}</span>
                  <span className="text-xs text-subtext">{t("quizSession.streakReset")}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="border-subtle-light fixed inset-x-0 bottom-0 border-t bg-bg px-5 py-4">
          <div className="mx-auto max-w-md">
            <Button className="w-full" onClick={() => onFinish({ correct: correctCount, total: cards.length })}>
              {finishLabel ?? t("common.backHome")}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col px-5 py-6 pb-28">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="text-sm text-subtext">
          {index + 1} / {cards.length}
          {pendingCount > cards.length ? ` ${t("quizSession.pending", { count: pendingCount })}` : ""}
        </p>
      </div>

      {card.type === "cloze" ? (
        <>
          <p className="mb-2 text-sm text-subtext">{t("quizSession.completa")}</p>
          <p className="article-text mb-2">{card.prompt}</p>
          {card.contextTranslation && <p className="mb-6 text-sm italic text-subtext">{card.contextTranslation}</p>}
        </>
      ) : (
        <>
          <p className="mb-2 text-sm text-subtext">{t("quizSession.howSay")}</p>
          <p className="mb-6 text-xl font-medium">«{card.prompt}»</p>
        </>
      )}

      <div className="flex flex-col gap-2">
        {card.options.map((option) => {
          let cls = "bg-surface";
          if (chosen) {
            if (option === card.answer) cls = "banner-success";
            else if (option === chosen) cls = "bg-subtle opacity-60";
            else cls = "bg-surface opacity-60";
          }
          return (
            <button
              key={option}
              onClick={() => pick(option)}
              disabled={chosen !== null}
              className={`rounded-xl px-4 py-3 text-left text-sm font-medium ${cls}`}
            >
              {option}
              {chosen && option === card.answer && " ✓"}
            </button>
          );
        })}
      </div>

      {chosen && (
        <div className="mt-4 text-sm">
          <p>
            <span className="font-medium text-text">{card.answer}</span>
            {card.translation ? ` — ${card.translation}` : ""}
          </p>
          {card.context && <p className="mt-1 italic text-subtext">{card.context}</p>}
        </div>
      )}

      {renderExtra?.(card, chosen !== null)}

      <div className="border-subtle-light fixed inset-x-0 bottom-0 border-t bg-bg px-5 py-4">
        <div className="mx-auto flex max-w-md items-center justify-end">
          <Button onClick={next} disabled={chosen === null}>
            {isLast ? t("common.finish") : t("common.next")}
          </Button>
        </div>
      </div>
    </div>
  );
}
