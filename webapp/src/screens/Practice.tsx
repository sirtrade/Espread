import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client.js";
import type { PracticeCard, SentenceCheckResult } from "../api/types.js";
import { Spinner } from "../components/Spinner.js";
import { ErrorState } from "../components/ErrorState.js";
import { Button } from "../components/Button.js";
import { hapticSelect, hapticSuccess } from "../telegram/telegram.js";

/** Spaced-repetition practice: cloze/recall cards over due bank items, with
 *  an optional free-writing exercise (LLM-checked) after each card. */
export function Practice() {
  const navigate = useNavigate();
  const [cards, setCards] = useState<PracticeCard[]>([]);
  const [due, setDue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [index, setIndex] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [answered, setAnswered] = useState(0);

  const [sentence, setSentence] = useState("");
  const [showWriting, setShowWriting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<SentenceCheckResult | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { cards: c, due: d } = await api.getPracticeQueue(10);
      setCards(c);
      setDue(d);
      setIndex(0);
      setChosen(null);
      setScore(0);
      setAnswered(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar la práctica");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <Spinner label="Preparando tu práctica..." />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  if (cards.length === 0) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-5 py-6 text-center">
        <p className="mb-2 text-4xl">🌵</p>
        <p className="mb-1 font-medium">Nada que practicar por ahora</p>
        <p className="mb-6 text-sm text-subtext">
          Las palabras aparecen aquí cuando les toca repaso. ¡Sigue leyendo para llenar tu banco!
        </p>
        <Button onClick={() => navigate("/")}>Volver al inicio</Button>
      </div>
    );
  }

  const card = cards[index]!;
  const isLast = index >= cards.length - 1;

  function pick(option: string) {
    if (chosen) return;
    hapticSelect();
    const correct = option === card.term;
    setChosen(option);
    setAnswered((n) => n + 1);
    if (correct) {
      setScore((s) => s + 1);
      hapticSuccess();
    }
    api.postPracticeAnswer(card.itemId, correct).catch(() => {
      /* best-effort: a lost answer just means the item stays due */
    });
  }

  function next() {
    if (isLast) {
      navigate("/");
      return;
    }
    setChosen(null);
    setShowWriting(false);
    setSentence("");
    setCheckResult(null);
    setCheckError(null);
    setIndex((i) => i + 1);
  }

  async function checkSentence() {
    setChecking(true);
    setCheckError(null);
    try {
      const result = await api.checkPracticeSentence(card.itemId, sentence);
      setCheckResult(result);
      if (result.ok) hapticSuccess();
    } catch (err) {
      setCheckError(err instanceof Error ? err.message : "No se pudo revisar la frase");
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col px-5 py-6 pb-28">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Práctica</h1>
        <p className="text-sm text-subtext">
          {index + 1} / {cards.length}
          {due > cards.length ? ` · ${due} pendientes` : ""}
        </p>
      </div>

      {card.type === "cloze" ? (
        <>
          <p className="mb-2 text-sm text-subtext">Completa la frase:</p>
          <p className="article-text mb-6">{card.prompt}</p>
        </>
      ) : (
        <>
          <p className="mb-2 text-sm text-subtext">¿Cómo se dice...?</p>
          <p className="mb-6 text-xl font-medium">«{card.prompt}»</p>
        </>
      )}

      <div className="flex flex-col gap-2">
        {card.options.map((option) => {
          let cls = "bg-surface";
          if (chosen) {
            if (option === card.term) cls = "banner-success";
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
              {chosen && option === card.term && " ✓"}
            </button>
          );
        })}
      </div>

      {chosen && card.translation && (
        <p className="mt-4 text-sm text-subtext">
          <span className="font-medium text-text">{card.term}</span> — {card.translation}
        </p>
      )}

      {chosen && !showWriting && (
        <button onClick={() => setShowWriting(true)} className="mt-4 text-left text-sm text-subtext underline">
          ✍️ Escribir una frase con «{card.term}»
        </button>
      )}

      {showWriting && (
        <div className="mt-4">
          <textarea
            value={sentence}
            onChange={(e) => setSentence(e.target.value)}
            placeholder={`Escribe una frase usando «${card.term}»...`}
            rows={3}
            className="border-subtle w-full rounded-xl border bg-surface px-3 py-2 text-sm outline-none"
          />
          <div className="mt-2 flex items-center gap-3">
            <Button variant="secondary" onClick={checkSentence} disabled={checking || sentence.trim().length < 3}>
              {checking ? "Revisando..." : "Revisar"}
            </Button>
            {checkError && <p className="text-xs text-red-500">{checkError}</p>}
          </div>
          {checkResult && (
            <div className={`mt-3 rounded-xl px-4 py-3 text-sm ${checkResult.ok ? "banner-success" : "bg-surface"}`}>
              <p>{checkResult.ok ? "✅ " : "✏️ "}{checkResult.feedback}</p>
              {checkResult.corrected && (
                <p className="mt-1 text-subtext">
                  Mejor: <span className="font-medium text-text">{checkResult.corrected}</span>
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <div className="border-subtle-light fixed inset-x-0 bottom-0 border-t bg-bg px-5 py-4">
        <div className="mx-auto flex max-w-md items-center justify-between gap-4">
          <p className="text-xs text-subtext">
            {score} correcta(s) de {answered}
          </p>
          <Button onClick={next} disabled={chosen === null}>
            {isLast ? "Terminar" : "Siguiente"}
          </Button>
        </div>
      </div>
    </div>
  );
}
