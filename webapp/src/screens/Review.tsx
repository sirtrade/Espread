import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client.js";
import type { ReviewItem, ReviewResult } from "../api/types.js";
import { Spinner } from "../components/Spinner.js";
import { ErrorState } from "../components/ErrorState.js";
import { Button } from "../components/Button.js";
import { hapticSelect } from "../telegram/telegram.js";
import { posLabel, displayLemma, highlightSurface } from "../lib/vocab.js";
import { intervalDaysForStage, READING_CREDIT_MAX_STAGE } from "../lib/srs.js";
import { useT } from "../lib/i18n.js";

type Decision = "bank" | "skip";
type GrammarDecision = "save" | "skip";

/** Rare words are dropped by default; frequent ones are kept. The reader can
 *  override either on the card. */
function defaultDecision(item: ReviewItem): Decision {
  return item.freqBand === "rare" ? "skip" : "bank";
}

export function Review() {
  const { t, lang } = useT();
  const navigate = useNavigate();
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  // A grammar candidate is NEVER saved without the reader's explicit accept
  // (grammar-track design §6), so unlike words its default is "skip".
  const [grammarDecisions, setGrammarDecisions] = useState<Record<string, GrammarDecision>>({});
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [continuing, setContinuing] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await api.reviewSession();
      setResult(r);
      const init: Record<string, Decision> = {};
      for (const item of r.items) init[item.lemma] = defaultDecision(item);
      setDecisions(init);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("review.analyzeError"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setDecision(lemma: string, decision: Decision) {
    hapticSelect();
    setDecisions((d) => ({ ...d, [lemma]: decision }));
  }

  function setGrammarDecision(key: string, decision: GrammarDecision) {
    hapticSelect();
    setGrammarDecisions((d) => ({ ...d, [key]: decision }));
  }

  function toggleExpanded(i: number) {
    setExpanded((e) => ({ ...e, [i]: !e[i] }));
  }

  async function handleContinue() {
    if (!result) return;
    setContinuing(true);
    try {
      const accepted = result.items.filter((it) => decisions[it.lemma] === "bank");
      const rejected = result.items.filter((it) => decisions[it.lemma] === "skip");
      const grammarAccepted = result.grammarCandidates
        .filter((candidate) => grammarDecisions[candidate.canonicalKey] === "save")
        .map((candidate) => candidate.canonicalKey);
      const { queued, levelSuggestion } = await api.completeSession({
        accepted: accepted.map((it) => it.lemma),
        rejected: rejected.map((it) => it.lemma),
        grammarAccepted,
      });
      // Reinforce right away with a quick recall quiz over the accepted words.
      // Queued words aren't in study yet, so they're not quizzed — but the
      // count still rides along to the Home banner.
      if (accepted.length > 0) {
        navigate("/quiz", { state: { items: accepted, queued, levelSuggestion } });
      } else {
        navigate("/", { state: { queued, levelSuggestion } });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("review.saveError"));
      setContinuing(false);
    }
  }

  if (loading) return <Spinner label={t("review.spinnerAnalyzing")} />;
  if (error && !result) return <ErrorState message={error} onRetry={load} />;
  if (!result) return null;

  const nothingMarked = result.items.length === 0;

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col px-5 py-6 pb-28">
      <h1 className="mb-6 text-2xl font-semibold">{t("review.title")}</h1>

      {nothingMarked && result.wovenTerms.length === 0 && (
        <p className="text-sm text-subtext">{t("review.nothingMarked")}</p>
      )}

      {result.items.length > 0 && (
        <section className="mb-8">
          <p className="mb-3 text-sm font-medium text-subtext">{t("review.whatYouMarked")}</p>
          <ul className="flex flex-col gap-3">
            {result.items.map((item, i) => {
              const decision = decisions[item.lemma] ?? defaultDecision(item);
              const isOpen = expanded[i] ?? false;
              return (
                <li key={i} className="rounded-2xl bg-surface px-4 py-4">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="text-lg font-semibold">{displayLemma(item)}</span>
                    <span className="text-sm text-subtext">· {posLabel(lang, item.pos)}</span>
                    {item.freqBand === "rare" && (
                      <span className="badge-amber rounded-full px-2 py-0.5 text-xs font-medium text-text">
                        {t("review.rare")}
                      </span>
                    )}
                  </div>

                  <p className="mt-1 text-base">{item.translation}</p>

                  <button
                    onClick={() => toggleExpanded(i)}
                    className="mt-2 flex items-center gap-1 text-xs font-medium text-subtext"
                    aria-expanded={isOpen}
                  >
                    <span className={`transition-transform ${isOpen ? "rotate-90" : ""}`}>›</span>
                    {isOpen ? t("review.hideContext") : t("review.showContext")}
                  </button>

                  {isOpen && (
                    <div className="border-subtle-light mt-2 border-l-2 pl-3">
                      <p className="text-sm italic">{highlightSurface(item.contextSentence, item.surface)}</p>
                      {item.contextTranslation && (
                        <p className="mt-1 text-sm text-subtext">{item.contextTranslation}</p>
                      )}
                    </div>
                  )}

                  {item.note && <p className="mt-2 text-xs text-subtext">{item.note}</p>}

                  <div className="border-subtle-light mt-3 flex overflow-hidden rounded-full border text-xs font-medium">
                    <button
                      onClick={() => setDecision(item.lemma, "bank")}
                      className={`flex-1 px-3 py-2 ${decision === "bank" ? "bg-accent text-white" : "text-subtext"}`}
                    >
                      {t("review.save")}
                    </button>
                    <button
                      onClick={() => setDecision(item.lemma, "skip")}
                      className={`flex-1 px-3 py-2 ${decision === "skip" ? "bg-subtle text-text" : "text-subtext"}`}
                    >
                      {t("review.skip")}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {result.grammarCandidates.length > 0 && (
        <section className="mb-8">
          <p className="mb-1 text-sm font-medium text-subtext">{t("review.grammarSection")}</p>
          <p className="mb-3 text-xs text-subtext">{t("review.grammarHint")}</p>
          <ul className="flex flex-col gap-3">
            {result.grammarCandidates.map((candidate) => {
              const decision = grammarDecisions[candidate.canonicalKey] ?? "skip";
              return (
                <li key={candidate.canonicalKey} className="rounded-2xl bg-surface px-4 py-4">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="text-lg font-semibold">{candidate.pattern}</span>
                    <span className="badge-amber rounded-full px-2 py-0.5 text-xs font-medium text-text">
                      {t(`grammar.category.${candidate.category}`)}
                    </span>
                  </div>

                  <div className="border-subtle-light mt-2 border-l-2 pl-3">
                    <p className="text-sm italic">
                      {highlightSurface(candidate.sourceSentence, candidate.sourceForm)}
                    </p>
                    {candidate.sourceSentenceTranslation && (
                      <p className="mt-1 text-sm text-subtext">{candidate.sourceSentenceTranslation}</p>
                    )}
                  </div>

                  <p className="mt-2 text-sm">{candidate.explanation}</p>

                  <div className="border-subtle-light mt-3 flex overflow-hidden rounded-full border text-xs font-medium">
                    <button
                      onClick={() => setGrammarDecision(candidate.canonicalKey, "save")}
                      className={`flex-1 px-3 py-2 ${decision === "save" ? "bg-accent text-white" : "text-subtext"}`}
                    >
                      {t("review.save")}
                    </button>
                    <button
                      onClick={() => setGrammarDecision(candidate.canonicalKey, "skip")}
                      className={`flex-1 px-3 py-2 ${decision === "skip" ? "bg-subtle text-text" : "text-subtext"}`}
                    >
                      {t("review.skip")}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {result.wovenTerms.length > 0 && (
        <section className="mb-6">
          <p className="mb-1 text-sm font-medium text-subtext">{t("review.yourWords")}</p>
          <p className="mb-3 text-xs text-subtext">{t("review.wovenHintSrs")}</p>
          <ul className="flex flex-col gap-2">
            {result.wovenTerms.map((w) => {
              // A clean reading bumps the word one rung only while it's on the
              // lower rungs; past READING_CREDIT_MAX_STAGE reading no longer moves
              // the schedule, so the word advances only through practice/bot.
              const label = w.markedAgain
                ? t("review.markedAgain")
                : w.srsStage <= READING_CREDIT_MAX_STAGE
                  ? t("review.wovenNextIn", { days: intervalDaysForStage(w.srsStage + 1) })
                  : t("review.wovenPractice");
              return (
                <li key={w.lemma} className="flex items-center justify-between rounded-xl bg-surface px-4 py-3">
                  <p className="font-medium">{w.lemma}</p>
                  <p className={`shrink-0 text-xs ${w.markedAgain ? "text-amber" : "text-subtext"}`}>{label}</p>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="border-subtle-light fixed inset-x-0 bottom-0 border-t bg-bg px-5 py-4">
        <div className="mx-auto max-w-md">
          <Button className="w-full" onClick={handleContinue} disabled={continuing}>
            {continuing ? t("common.saving") : t("review.continue")}
          </Button>
        </div>
      </div>
    </div>
  );
}
