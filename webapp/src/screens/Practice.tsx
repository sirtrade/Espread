import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client.js";
import type { PracticeCard, SentenceCheckResult } from "../api/types.js";
import { fromPracticeCard, type SessionCard } from "../lib/cards.js";
import { QuizSession } from "../components/QuizSession.js";
import { Spinner } from "../components/Spinner.js";
import { ErrorState } from "../components/ErrorState.js";
import { Button } from "../components/Button.js";
import { hapticSuccess } from "../telegram/telegram.js";
import { useT } from "../lib/i18n.js";
import { useAuth } from "../state/AuthContext.js";

/** From this SRS rung up, the free-writing exercise (the app's strongest,
 *  generation-effect drill) is offered upfront after a correct answer instead
 *  of hidden behind a link — the word is well enough known to produce, not just
 *  recognize. Lower rungs keep the unobtrusive link. */
const WRITING_AUTO_STAGE = 4;

/** Spaced-repetition practice: cloze/recall cards over due bank items, with
 *  an optional free-writing exercise (LLM-checked) after each card. Answers
 *  count toward the learning streak like the post-reading quiz. */
export function Practice() {
  const { t } = useT();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [rawCards, setRawCards] = useState<PracticeCard[]>([]);
  const [due, setDue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Free-writing exercise state (per current card; reset on advance).
  const [sentence, setSentence] = useState("");
  const [showWriting, setShowWriting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<SentenceCheckResult | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);

  const cards = useMemo<SessionCard[]>(() => rawCards.map(fromPracticeCard), [rawCards]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { cards: c, due: d } = await api.getPracticeQueue(profile!.practiceSize);
      setRawCards(c);
      setDue(d);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("practice.loadError"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resetWriting() {
    setSentence("");
    setShowWriting(false);
    setCheckResult(null);
    setCheckError(null);
  }

  async function checkSentence(itemId: number) {
    setChecking(true);
    setCheckError(null);
    try {
      const result = await api.checkPracticeSentence(itemId, sentence);
      setCheckResult(result);
      if (result.ok) hapticSuccess();
    } catch (err) {
      setCheckError(err instanceof Error ? err.message : t("practice.checkError"));
    } finally {
      setChecking(false);
    }
  }

  if (loading) return <Spinner label={t("practice.loading")} />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  if (cards.length === 0) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-5 py-6 text-center">
        <p className="mb-2 text-4xl">🌵</p>
        <p className="mb-1 font-medium">{t("practice.emptyTitle")}</p>
        <p className="mb-6 text-sm text-subtext">{t("practice.emptyBody")}</p>
        <Button onClick={() => navigate("/")}>{t("common.backHome")}</Button>
      </div>
    );
  }

  return (
    <QuizSession
      title={t("practice.title")}
      cards={cards}
      pendingCount={due}
      onAnswer={(card, correct, usedHint) => api.postPracticeAnswer({ itemId: card.itemId! }, { correct, usedHint })}
      onTypedAnswer={async (card, typedAnswer) => {
        const res = await api.postPracticeAnswer({ itemId: card.itemId! }, { typedAnswer });
        // Typed queue payloads intentionally omit the lemma. Reveal only the
        // server-returned proper form after the first attempt for feedback,
        // summary, retries and the optional writing exercise.
        card.lemma = res.answer ?? "";
        card.context = res.context ?? null;
        card.contextTranslation = res.contextTranslation ?? null;
        return {
          correct: res.correct ?? false,
          verdict: res.verdict ?? "wrong",
          answer: card.lemma,
          outcome: res,
        };
      }}
      onFinish={() => navigate("/")}
      onNext={resetWriting}
      renderExtra={(card, chosen, correct) => {
        if (!chosen || card.itemId == null) return null;
        // On the upper SRS rungs, reward a correct answer by opening the
        // strongest exercise (free writing) right away instead of hiding it
        // behind a link. Lower rungs — or a wrong answer — keep the link.
        const autoExpand = correct && (card.srsStage ?? 0) >= WRITING_AUTO_STAGE;
        const expanded = showWriting || autoExpand;
        return (
          <>
            {!expanded && (
              <button onClick={() => setShowWriting(true)} className="mt-4 text-left text-sm text-subtext underline">
                {t("practice.writeSentence", { lemma: card.lemma })}
              </button>
            )}
            {expanded && (
              <div className="mt-4">
                {autoExpand && <p className="mb-2 text-sm text-subtext">{t("practice.writePrompt")}</p>}
                <textarea
                  value={sentence}
                  onChange={(e) => setSentence(e.target.value)}
                  placeholder={t("practice.writePlaceholder", { lemma: card.lemma })}
                  rows={3}
                  className="border-subtle w-full rounded-xl border bg-surface px-3 py-2 text-sm outline-none"
                />
                <div className="mt-2 flex items-center gap-3">
                  <Button
                    variant="secondary"
                    onClick={() => checkSentence(card.itemId!)}
                    disabled={checking || sentence.trim().length < 3}
                  >
                    {checking ? t("practice.checking") : t("practice.check")}
                  </Button>
                  {checkError && <p className="text-xs text-red-500">{checkError}</p>}
                </div>
                {checkResult && (
                  <div className={`mt-3 rounded-xl px-4 py-3 text-sm ${checkResult.ok ? "banner-success" : "bg-surface"}`}>
                    <p>
                      {checkResult.ok ? "✅ " : "✏️ "}
                      {checkResult.feedback}
                    </p>
                    {checkResult.corrected && (
                      <p className="mt-1 text-subtext">
                        {t("practice.better")} <span className="font-medium text-text">{checkResult.corrected}</span>
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        );
      }}
    />
  );
}
