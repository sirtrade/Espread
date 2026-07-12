import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client.js";
import type { ReviewItem, ReviewResult } from "../api/types.js";
import { Spinner } from "../components/Spinner.js";
import { ErrorState } from "../components/ErrorState.js";
import { Button } from "../components/Button.js";
import { hapticSelect, hapticSuccess } from "../telegram/telegram.js";

const LEARNED_STREAK = 3;

type Decision = "bank" | "skip";

/** Rare words are dropped by default; frequent ones are kept. The reader can
 *  override either on the card. */
function defaultDecision(item: ReviewItem): Decision {
  return item.freqBand === "rare" ? "skip" : "bank";
}

/** Big lemma line: nouns carry their article so gender reads at a glance
 *  ("el lanzamiento"), everything else shows the plain dictionary form. */
function displayLemma(item: ReviewItem): string {
  if (item.pos === "noun" && item.gender) {
    return `${item.gender === "m" ? "el" : "la"} ${item.lemma}`;
  }
  return item.lemma;
}

const POS_LABEL: Record<ReviewItem["pos"], string> = {
  verb: "verbo",
  noun: "sustantivo",
  adj: "adjetivo",
  adv: "adverbio",
  phrase: "frase",
  other: "palabra",
};

/** Renders the marked sentence with the surface form highlighted. */
function highlightSurface(sentence: string, surface: string) {
  const idx = surface ? sentence.toLowerCase().indexOf(surface.toLowerCase()) : -1;
  if (idx === -1) return sentence;
  return (
    <>
      {sentence.slice(0, idx)}
      <span className="word-marked">{sentence.slice(idx, idx + surface.length)}</span>
      {sentence.slice(idx + surface.length)}
    </>
  );
}

export function Review() {
  const navigate = useNavigate();
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
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
      setError(err instanceof Error ? err.message : "No se pudo analizar tu lectura");
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

  function toggleExpanded(i: number) {
    setExpanded((e) => ({ ...e, [i]: !e[i] }));
  }

  async function handleContinue() {
    if (!result) return;
    setContinuing(true);
    try {
      const accepted = result.items.filter((it) => decisions[it.lemma] === "bank");
      const rejected = result.items.filter((it) => decisions[it.lemma] === "skip");
      const { newlyLearned } = await api.completeSession({
        accepted: accepted.map((it) => it.lemma),
        rejected: rejected.map((it) => it.lemma),
      });
      if (newlyLearned.length > 0) hapticSuccess();
      // Reinforce right away with a quick recall quiz over the accepted words.
      if (accepted.length > 0) {
        navigate("/quiz", { state: { items: accepted, newlyLearned } });
      } else {
        navigate("/", { state: { newlyLearned } });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar tu progreso");
      setContinuing(false);
    }
  }

  if (loading) return <Spinner label="Analizando tus palabras y frases..." />;
  if (error && !result) return <ErrorState message={error} onRetry={load} />;
  if (!result) return null;

  const nothingMarked = result.items.length === 0;

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col px-5 py-6 pb-28">
      <h1 className="mb-6 text-2xl font-semibold">Tu análisis</h1>

      {nothingMarked && result.wovenTerms.length === 0 && (
        <p className="text-sm text-subtext">No marcaste nada en esta lectura. ¡Buen trabajo!</p>
      )}

      {result.items.length > 0 && (
        <section className="mb-8">
          <p className="mb-3 text-sm font-medium text-subtext">Lo que marcaste</p>
          <ul className="flex flex-col gap-3">
            {result.items.map((item, i) => {
              const decision = decisions[item.lemma] ?? defaultDecision(item);
              const isOpen = expanded[i] ?? false;
              return (
                <li key={i} className="rounded-2xl bg-surface px-4 py-4">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="text-lg font-semibold">{displayLemma(item)}</span>
                    <span className="text-sm text-subtext">· {POS_LABEL[item.pos]}</span>
                    {item.freqBand === "rare" && (
                      <span className="badge-amber rounded-full px-2 py-0.5 text-xs font-medium text-text">
                        poco frecuente
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
                    {isOpen ? "Ocultar el contexto" : "Ver en contexto"}
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
                      Guardar
                    </button>
                    <button
                      onClick={() => setDecision(item.lemma, "skip")}
                      className={`flex-1 px-3 py-2 ${decision === "skip" ? "bg-subtle text-text" : "text-subtext"}`}
                    >
                      Omitir
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
          <p className="mb-1 text-sm font-medium text-subtext">Tus palabras en este artículo</p>
          <p className="mb-3 text-xs text-subtext">
            Cada lectura sin volver a marcarlas te acerca a dominarlas ({LEARNED_STREAK} de {LEARNED_STREAK}).
          </p>
          <ul className="flex flex-col gap-2">
            {result.wovenTerms.map((w) => {
              const filled = w.markedAgain ? 0 : Math.min(w.cleanStreak + 1, LEARNED_STREAK);
              const label = w.markedAgain
                ? "Vuelta a marcar · progreso reiniciado"
                : filled >= LEARNED_STREAK
                  ? "¡Lista para dominar!"
                  : `${filled} / ${LEARNED_STREAK} para dominarla`;
              return (
                <li key={w.lemma} className="flex items-center justify-between rounded-xl bg-surface px-4 py-3">
                  <div>
                    <p className="font-medium">{w.lemma}</p>
                    <p className="text-xs text-subtext">{label}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {Array.from({ length: LEARNED_STREAK }, (_, di) => (
                      <span
                        key={di}
                        className={`h-2 w-2 rounded-full ${di < filled ? "bg-teal" : "dot-empty"}`}
                      />
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="border-subtle-light fixed inset-x-0 bottom-0 border-t bg-bg px-5 py-4">
        <div className="mx-auto max-w-md">
          <Button className="w-full" onClick={handleContinue} disabled={continuing}>
            {continuing ? "Guardando..." : "Continuar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
