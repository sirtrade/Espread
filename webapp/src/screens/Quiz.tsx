import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { ReviewWord } from "../api/types.js";
import { Button } from "../components/Button.js";
import { buildOptions, shuffle } from "../lib/quiz.js";
import { hapticSelect, hapticSuccess } from "../telegram/telegram.js";

interface QuizState {
  words?: ReviewWord[];
  newlyLearned?: string[];
}

interface QuizQuestion {
  term: string;
  translation: string;
  options: string[];
}

const MAX_QUESTIONS = 5;

/** Immediate post-reading reinforcement: recall the Spanish word for each
 *  translation you just looked up. Client-side only — no SRS impact. */
export function Quiz() {
  const navigate = useNavigate();
  const location = useLocation() as { state?: QuizState };
  const words = location.state?.words ?? [];
  const newlyLearned = location.state?.newlyLearned ?? [];

  const questions = useMemo<QuizQuestion[]>(() => {
    const pool = words.map((w) => w.term);
    return shuffle(words)
      .slice(0, MAX_QUESTIONS)
      .map((w) => ({
        term: w.term,
        translation: w.translation,
        options: buildOptions(w.term, pool),
      }));
  }, [words]);

  const [index, setIndex] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  const [score, setScore] = useState(0);

  function goHome() {
    navigate("/", { replace: true, state: { newlyLearned } });
  }

  useEffect(() => {
    if (questions.length === 0) goHome();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (questions.length === 0) return null;

  const q = questions[index]!;
  const done = index >= questions.length - 1 && chosen !== null;

  function pick(option: string) {
    if (chosen) return;
    hapticSelect();
    setChosen(option);
    if (option === q.term) {
      setScore((s) => s + 1);
      hapticSuccess();
    }
  }

  function next() {
    setChosen(null);
    setIndex((i) => i + 1);
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col px-5 py-6 pb-28">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Quiz rápido</h1>
        <p className="text-sm text-subtext">
          {index + 1} / {questions.length}
        </p>
      </div>

      <p className="mb-2 text-sm text-subtext">¿Cómo se dice...?</p>
      <p className="mb-6 text-xl font-medium">«{q.translation}»</p>

      <div className="flex flex-col gap-2">
        {q.options.map((option) => {
          let cls = "bg-surface";
          if (chosen) {
            if (option === q.term) cls = "banner-success";
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
              {chosen && option === q.term && " ✓"}
            </button>
          );
        })}
      </div>

      <div className="border-subtle-light fixed inset-x-0 bottom-0 border-t bg-bg px-5 py-4">
        <div className="mx-auto flex max-w-md items-center justify-between gap-4">
          <p className="text-xs text-subtext">
            {score} correcta(s) de {index + (chosen ? 1 : 0)}
          </p>
          {done ? (
            <Button onClick={goHome}>Terminar</Button>
          ) : (
            <Button onClick={next} disabled={chosen === null}>
              Siguiente
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
