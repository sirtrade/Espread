import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../api/client.js";
import type { LevelSuggestion, ReviewItem } from "../api/types.js";
import { buildQuizCards, type SessionCard } from "../lib/cards.js";
import { QuizSession } from "../components/QuizSession.js";
import { useT } from "../lib/i18n.js";
import { LevelSuggestionBanner } from "../components/LevelSuggestionBanner.js";

interface QuizState {
  items?: ReviewItem[];
  queued?: string[];
  levelSuggestion?: LevelSuggestion | null;
}

/** Immediate post-reading reinforcement over the words just accepted into the
 *  bank. Answers advance the shared SRS schedule (best-effort, keyed by lemma)
 *  just like Práctica. */
export function Quiz() {
  const { t } = useT();
  const navigate = useNavigate();
  const location = useLocation() as { state?: QuizState };
  const items = location.state?.items ?? [];
  const queued = location.state?.queued ?? [];
  const [levelSuggestion, setLevelSuggestion] = useState(location.state?.levelSuggestion ?? null);

  const cards = useMemo<SessionCard[]>(() => buildQuizCards(items), [items]);

  function goHome(includeSuggestion = false) {
    navigate("/", {
      replace: true,
      state: { queued, levelSuggestion: includeSuggestion ? levelSuggestion : null },
    });
  }

  useEffect(() => {
    if (cards.length === 0) goHome(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (cards.length === 0) return null;

  return (
    <QuizSession
      title={t("quiz.title")}
      cards={cards}
      onAnswer={(card, correct, usedHint) => api.postPracticeAnswer({ lemma: card.lemma }, { correct, usedHint })}
      onFinish={() => goHome()}
      finishLabel={t("common.finish")}
      headerExtra={
        levelSuggestion ? (
          <LevelSuggestionBanner suggestion={levelSuggestion} onResolved={() => setLevelSuggestion(null)} />
        ) : null
      }
    />
  );
}
