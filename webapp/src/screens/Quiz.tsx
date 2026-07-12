import { useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../api/client.js";
import type { ReviewItem } from "../api/types.js";
import { buildQuizCards, type SessionCard } from "../lib/cards.js";
import { QuizSession } from "../components/QuizSession.js";

interface QuizState {
  items?: ReviewItem[];
  newlyLearned?: string[];
}

/** Immediate post-reading reinforcement over the words just accepted into the
 *  bank. Answers count toward the learning streak (best-effort, keyed by
 *  lemma) just like Práctica. */
export function Quiz() {
  const navigate = useNavigate();
  const location = useLocation() as { state?: QuizState };
  const items = location.state?.items ?? [];
  const newlyLearned = location.state?.newlyLearned ?? [];

  const cards = useMemo<SessionCard[]>(() => buildQuizCards(items), [items]);

  function goHome(learned: string[] = []) {
    // Merge words promoted during reading with any promoted by the quiz itself.
    const allLearned = Array.from(new Set([...newlyLearned, ...learned]));
    navigate("/", { replace: true, state: { newlyLearned: allLearned } });
  }

  useEffect(() => {
    if (cards.length === 0) goHome();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (cards.length === 0) return null;

  return (
    <QuizSession
      title="Quiz rápido"
      cards={cards}
      onAnswer={(card, correct) => api.postPracticeAnswer({ lemma: card.lemma }, correct)}
      onFinish={({ learned }) => goHome(learned)}
      finishLabel="Terminar"
    />
  );
}
