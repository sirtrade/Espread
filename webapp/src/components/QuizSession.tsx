import { type ReactNode, useEffect, useRef, useState } from "react";
import type { PracticeAnswerResult, TypedVerdict } from "../api/types.js";
import type { SessionCard } from "../lib/cards.js";
import { Button } from "./Button.js";
import { hapticSelect, hapticSuccess, showBackButton, hideBackButton } from "../telegram/telegram.js";
import { intervalDaysForStage } from "../lib/srs.js";
import { gradeTyped } from "../lib/typedRecall.js";
import { useT } from "../lib/i18n.js";

/** Server outcome of an answer; `void` when the write was best-effort and lost. */
export type AnswerOutcome = Pick<PracticeAnswerResult, "srsStage" | "status" | "advanced">;

/** Server grading of a typed-recall answer, plus the SRS outcome it produced. */
export interface TypedAnswerResult {
  correct: boolean;
  verdict: TypedVerdict;
  /** the proper form to show as feedback */
  answer: string;
  outcome: AnswerOutcome | null;
}

/** A typed card's local grade (verdict + the correct form) once answered. */
interface TypedGradeState {
  correct: boolean;
  verdict: TypedVerdict;
  answer: string;
}

interface RecordedAnswer {
  card: SessionCard;
  correct: boolean;
  outcome: AnswerOutcome | null;
}

/** A queued question: a first showing of a card, or a same-session retry of one
 *  answered wrong. `ordinal` is the card's 1-based position among first showings
 *  (retries inherit their origin's), so the header stays stable across retries. */
interface QueueEntry {
  card: SessionCard;
  isRetry: boolean;
  /** how many more times this card may come back after a wrong answer */
  retriesLeft: number;
  ordinal: number;
}

/** A wrong card comes back at most twice within the session, so a lapse always
 *  gets a follow-up retrieval but the queue can't grow without bound. */
const MAX_RETRIES = 2;

interface QuizSessionProps {
  title: string;
  cards: SessionCard[];
  /** extra items still due beyond this batch (Práctica), for the header. */
  pendingCount?: number;
  /** Sends a multiple-choice answer to the server; returns the new learning
   *  state (or void). Only ever called for a card's FIRST attempt — retries
   *  stay client-side. */
  onAnswer: (card: SessionCard, correct: boolean, usedHint: boolean) => Promise<AnswerOutcome | void>;
  /** Sends a typed-recall answer to the server, which grades it and returns the
   *  verdict + correct form. Required when the batch may contain `typed` cards
   *  (Práctica); only called for a card's FIRST attempt. */
  onTypedAnswer?: (card: SessionCard, typedAnswer: string) => Promise<TypedAnswerResult | void>;
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
 *  which words advanced or reset. The session can be ended at any step (the
 *  summary is computed over the cards answered so far), wrong cards are retried
 *  later in the same session, and the cloze translation is a hint on request. */
export function QuizSession({
  title,
  cards,
  pendingCount = 0,
  onAnswer,
  onTypedAnswer,
  onFinish,
  finishLabel,
  renderExtra,
  onNext,
}: QuizSessionProps) {
  const { t } = useT();
  const [queue, setQueue] = useState<QueueEntry[]>(() =>
    cards.map((card, i) => ({ card, isRetry: false, retriesLeft: MAX_RETRIES, ordinal: i + 1 })),
  );
  const [pos, setPos] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  const [showHint, setShowHint] = useState(false);
  // Typed-recall state (Práctica): the text field value, the grade once
  // answered, and a submit guard. The correct form the server reveals on a
  // card's first attempt is kept per-card so a later client-only retry can be
  // graded locally against it (retries never touch the server).
  const [typedInput, setTypedInput] = useState("");
  const [typedGrade, setTypedGrade] = useState<TypedGradeState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const answerByCard = useRef(new Map<SessionCard, string>());
  // One entry per distinct card, recorded on its FIRST attempt only. Drives the
  // summary counts and the server writes; retries never touch it.
  const [firstAttempts, setFirstAttempts] = useState<RecordedAnswer[]>([]);
  const [done, setDone] = useState(false);

  const entry = queue[pos]!;
  const card = entry.card;
  const isLast = pos >= queue.length - 1;

  const correctCount = firstAttempts.filter((a) => a.correct).length;

  // Telegram BackButton: while answering it ends the session (to the summary);
  // on the summary it goes home. Kept in refs so remounting the handler doesn't
  // depend on the unstable onFinish prop or on every recorded answer.
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;
  const firstAttemptsRef = useRef(firstAttempts);
  firstAttemptsRef.current = firstAttempts;

  useEffect(() => {
    const handler = done
      ? () => {
          const fa = firstAttemptsRef.current;
          onFinishRef.current({ correct: fa.filter((a) => a.correct).length, total: fa.length });
        }
      : () => setDone(true);
    showBackButton(handler);
    return () => hideBackButton();
  }, [done]);

  /** Appends a retry of `e` to the tail of the queue (never immediately next
   *  while other cards remain), consuming one of its remaining retries. */
  function enqueueRetry(e: QueueEntry) {
    setQueue((q) => [
      ...q,
      { card: e.card, isRetry: true, retriesLeft: e.retriesLeft - 1, ordinal: e.ordinal },
    ]);
  }

  async function pick(option: string) {
    if (chosen) return;
    hapticSelect();
    const correct = option === card.answer;
    setChosen(option);
    if (correct) hapticSuccess();

    const shouldRetry = !correct && entry.retriesLeft > 0;
    if (shouldRetry) enqueueRetry(entry);

    // A retry attempt is a client-only re-drill: it neither records a first
    // attempt nor hits the server, so a word's SRS fate is set once, by its
    // first answer. Only first attempts count toward the summary and the API.
    if (entry.isRetry) return;

    setFirstAttempts((a) => [...a, { card, correct, outcome: null }]);
    try {
      const res = await onAnswer(card, correct, showHint);
      if (res) setFirstAttempts((a) => a.map((e) => (e.card === card ? { ...e, outcome: res } : e)));
    } catch {
      /* best-effort: a lost answer just leaves the word due */
    }
  }

  /** Typed-recall answer. The first attempt is graded on the server (the client
   *  is never told the accepted forms up front); a retry is a client-only
   *  re-drill graded locally against the form the server already revealed, so a
   *  word's SRS fate is set once, by its first answer. */
  async function submitTyped() {
    if (chosen || submitting) return;
    const value = typedInput.trim();
    if (value.length === 0) return;
    hapticSelect();

    if (entry.isRetry) {
      const correctForm = answerByCard.current.get(card) ?? "";
      const grade = gradeTyped(value, correctForm ? [correctForm] : []);
      setChosen(value);
      setTypedGrade({ correct: grade.correct, verdict: grade.verdict, answer: correctForm });
      if (grade.correct) hapticSuccess();
      else if (entry.retriesLeft > 0) enqueueRetry(entry);
      return;
    }

    setSubmitting(true);
    try {
      const res = await onTypedAnswer?.(card, value);
      const correct = res?.correct ?? false;
      setChosen(value);
      setTypedGrade(res ? { correct: res.correct, verdict: res.verdict, answer: res.answer } : null);
      if (res?.answer) answerByCard.current.set(card, res.answer);
      if (correct) hapticSuccess();
      if (!correct && entry.retriesLeft > 0) enqueueRetry(entry);
      setFirstAttempts((a) => [...a, { card, correct, outcome: res?.outcome ?? null }]);
    } catch {
      // Best-effort: a lost answer just leaves the word due. Still show feedback
      // so the session can move on; the word stays due for next time.
      setChosen(value);
      setTypedGrade(null);
      setFirstAttempts((a) => [...a, { card, correct: false, outcome: null }]);
    } finally {
      setSubmitting(false);
    }
  }

  function next() {
    if (isLast) {
      setDone(true);
      return;
    }
    setChosen(null);
    setShowHint(false);
    setTypedInput("");
    setTypedGrade(null);
    setSubmitting(false);
    onNext?.();
    setPos((i) => i + 1);
  }

  if (done) {
    const total = firstAttempts.length;
    const advanced = firstAttempts.filter((a) => a.outcome?.advanced);
    const reset = firstAttempts.filter((a) => !a.correct);

    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col px-5 py-6 pb-28">
        <h1 className="mb-6 text-xl font-semibold">{title}</h1>
        <div className="rounded-2xl bg-surface px-5 py-6 text-center">
          <p className="text-3xl">🎯</p>
          <p className="mt-2 text-lg font-semibold">
            {t("quizSession.result", { correct: correctCount, total })}
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
            <Button className="w-full" onClick={() => onFinish({ correct: correctCount, total })}>
              {finishLabel ?? t("common.backHome")}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col px-5 py-6 pb-28">
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{title}</h1>
        <div className="flex items-center gap-3">
          <p className="text-sm text-subtext">
            {entry.ordinal} / {cards.length}
            {entry.isRetry ? ` · ${t("quizSession.retry")}` : ""}
            {pendingCount > cards.length ? ` ${t("quizSession.pending", { count: pendingCount })}` : ""}
          </p>
          <button
            onClick={() => setDone(true)}
            aria-label={t("quizSession.exit")}
            className="text-lg leading-none text-subtext"
          >
            ✕
          </button>
        </div>
      </div>

      {card.type === "typed" ? (
        <>
          <p className="mb-2 text-sm text-subtext">{t("quizSession.typeWord")}</p>
          <p className="mb-2 text-xl font-medium">«{card.prompt}»</p>
          {card.contextHint && <p className="article-text mb-4 text-subtext">{card.contextHint}</p>}
          {!chosen && (
            <div className="flex flex-col gap-2">
              <input
                type="text"
                value={typedInput}
                onChange={(e) => setTypedInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitTyped();
                }}
                autoFocus
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                placeholder={t("quizSession.typePlaceholder")}
                className="border-subtle rounded-xl border bg-surface px-4 py-3 text-base outline-none"
              />
              <Button onClick={submitTyped} disabled={submitting || typedInput.trim().length === 0}>
                {submitting ? t("common.saving") : t("quizSession.submit")}
              </Button>
            </div>
          )}
        </>
      ) : card.type === "cloze" ? (
        <>
          <p className="mb-2 text-sm text-subtext">{t("quizSession.completa")}</p>
          <p className="article-text mb-2">{card.prompt}</p>
          {card.contextTranslation &&
            (showHint || chosen ? (
              <p className="mb-6 text-sm italic text-subtext">{card.contextTranslation}</p>
            ) : (
              <button
                onClick={() => setShowHint(true)}
                className="mb-6 text-left text-sm text-subtext underline"
              >
                {t("quizSession.showHint")}
              </button>
            ))}
        </>
      ) : (
        <>
          <p className="mb-2 text-sm text-subtext">{t("quizSession.howSay")}</p>
          <p className="mb-6 text-xl font-medium">«{card.prompt}»</p>
        </>
      )}

      {card.type !== "typed" && (
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
      )}

      {chosen && card.type === "typed" && typedGrade && (
        <div className="mt-4 text-sm">
          <p className={`rounded-xl px-4 py-3 ${typedGrade.correct ? "banner-success" : "bg-surface"}`}>
            {typedGrade.verdict === "exact"
              ? t("quizSession.verdictExact")
              : typedGrade.verdict === "spelling"
                ? t("quizSession.verdictSpelling", { form: typedGrade.answer })
                : t("quizSession.verdictWrong")}
          </p>
          <p className="mt-2">
            <span className="font-medium text-text">{typedGrade.answer}</span>
            {card.translation ? ` — ${card.translation}` : ""}
          </p>
          {card.context && <p className="mt-1 italic text-subtext">{card.context}</p>}
        </div>
      )}

      {chosen && card.type !== "typed" && (
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
