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

/** Spaced-repetition practice: cloze/recall cards over due bank items, with
 *  an optional free-writing exercise (LLM-checked) after each card. Answers
 *  count toward the learning streak like the post-reading quiz. */
export function Practice() {
  const navigate = useNavigate();
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
      const { cards: c, due: d } = await api.getPracticeQueue(10);
      setRawCards(c);
      setDue(d);
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
      setCheckError(err instanceof Error ? err.message : "No se pudo revisar la frase");
    } finally {
      setChecking(false);
    }
  }

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

  return (
    <QuizSession
      title="Práctica"
      cards={cards}
      pendingCount={due}
      onAnswer={(card, correct) => api.postPracticeAnswer({ itemId: card.itemId! }, correct)}
      onFinish={() => navigate("/")}
      onNext={resetWriting}
      renderExtra={(card, chosen) => {
        if (!chosen || card.itemId == null) return null;
        return (
          <>
            {!showWriting && (
              <button onClick={() => setShowWriting(true)} className="mt-4 text-left text-sm text-subtext underline">
                ✍️ Escribir una frase con «{card.lemma}»
              </button>
            )}
            {showWriting && (
              <div className="mt-4">
                <textarea
                  value={sentence}
                  onChange={(e) => setSentence(e.target.value)}
                  placeholder={`Escribe una frase usando «${card.lemma}»...`}
                  rows={3}
                  className="border-subtle w-full rounded-xl border bg-surface px-3 py-2 text-sm outline-none"
                />
                <div className="mt-2 flex items-center gap-3">
                  <Button
                    variant="secondary"
                    onClick={() => checkSentence(card.itemId!)}
                    disabled={checking || sentence.trim().length < 3}
                  >
                    {checking ? "Revisando..." : "Revisar"}
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
                        Mejor: <span className="font-medium text-text">{checkResult.corrected}</span>
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
