import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client.js";
import type { ReviewResult } from "../api/types.js";
import { Spinner } from "../components/Spinner.js";
import { ErrorState } from "../components/ErrorState.js";
import { Button } from "../components/Button.js";
import { hapticSuccess } from "../telegram/telegram.js";

export function Review() {
  const navigate = useNavigate();
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [continuing, setContinuing] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await api.reviewSession();
      setResult(r);
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

  async function handleContinue() {
    setContinuing(true);
    try {
      const { newlyLearned } = await api.completeSession();
      if (newlyLearned.length > 0) hapticSuccess();
      navigate("/", { state: { newlyLearned } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar tu progreso");
      setContinuing(false);
    }
  }

  if (loading) return <Spinner label="Analizando tus palabras y frases..." />;
  if (error && !result) return <ErrorState message={error} onRetry={load} />;
  if (!result) return null;

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col px-5 py-6 pb-28">
      <h1 className="mb-6 text-2xl font-semibold">Tu análisis</h1>

      {result.words.length === 0 && result.phrases.length === 0 && (
        <p className="text-sm text-subtext">No marcaste nada en esta lectura. ¡Buen trabajo!</p>
      )}

      {result.words.length > 0 && (
        <section className="mb-6">
          <p className="mb-2 text-sm font-medium text-subtext">Palabras</p>
          <ul className="flex flex-col gap-2">
            {result.words.map((w, i) => (
              <li key={i} className="flex items-center justify-between rounded-xl bg-surface px-4 py-3">
                <div>
                  <p className="font-medium">{w.term}</p>
                  <p className="text-sm text-subtext">{w.translation}</p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                    w.frequency === "alta" ? "badge-amber text-text" : "bg-subtle text-subtext"
                  }`}
                >
                  {w.frequency === "alta" ? "En banco" : "Descartada"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {result.phrases.length > 0 && (
        <section className="mb-6">
          <p className="mb-2 text-sm font-medium text-subtext">Frases</p>
          <ul className="flex flex-col gap-2">
            {result.phrases.map((p, i) => (
              <li key={i} className="rounded-xl bg-surface px-4 py-3">
                <p className="mb-1 font-medium">{p.term}</p>
                <p className="text-sm text-subtext">{p.explanation}</p>
                {p.clave && (
                  <span className="badge-teal mt-2 inline-block rounded-full px-2.5 py-1 text-xs font-medium text-text">
                    Clave: {p.clave}
                  </span>
                )}
              </li>
            ))}
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
