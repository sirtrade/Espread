import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client.js";
import type { ReadArticle } from "../api/types.js";
import { Spinner } from "../components/Spinner.js";
import { ErrorState } from "../components/ErrorState.js";
import { tokenizeArticle } from "../lib/tokenize.js";

/** Read-only view of a past reading: the article with the words and phrases
 *  the user had marked at the time, plus the saved LLM review below. */
export function HistoryArticle() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [article, setArticle] = useState<ReadArticle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { article: a } = await api.getReadArticle(Number(id));
      setArticle(a);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar el artículo");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const paragraphs = useMemo(() => (article ? tokenizeArticle(article.body) : []), [article]);
  const markedWords = useMemo(() => new Set(article?.markedWords ?? []), [article]);
  const markedSents = useMemo(() => new Set(article?.markedSents ?? []), [article]);
  const review = article?.reviewResult;

  if (loading) return <Spinner label="Cargando artículo..." />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!article) return null;

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col px-5 py-6">
      <div className="mb-4 flex items-center justify-between">
        <button onClick={() => navigate("/history")} className="text-sm text-subtext" aria-label="Volver">
          ← Historial
        </button>
        <p className="text-xs text-subtext">
          Leído el {new Date(article.readAt).toLocaleDateString("es", { day: "numeric", month: "long", year: "numeric" })}
        </p>
      </div>

      <h1 className="mb-1 text-2xl font-semibold">{article.title}</h1>
      {article.sourceName && (
        <p className="mb-4 text-xs text-subtext">
          Fuente:{" "}
          {article.sourceUrl ? (
            <a href={article.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">
              {article.sourceName}
            </a>
          ) : (
            article.sourceName
          )}
        </p>
      )}

      <article className="article-text mb-8 space-y-4">
        {paragraphs.map((p, pi) => (
          <p key={pi}>
            {p.sentences.map((s, si) => (
              <span key={si} className={markedSents.has(s.text) ? "sent-marked" : ""}>
                {s.tokens.map((t, ti) =>
                  t.type === "word" ? (
                    <span key={ti} className={markedWords.has(t.text.toLowerCase()) ? "word-marked" : undefined}>
                      {t.text}
                    </span>
                  ) : (
                    <span key={ti}>{t.text}</span>
                  ),
                )}{" "}
              </span>
            ))}
          </p>
        ))}
      </article>

      {review && (review.words.length > 0 || review.phrases.length > 0) ? (
        <>
          <h2 className="mb-4 text-lg font-semibold">Lo que marcaste</h2>

          {review.words.length > 0 && (
            <section className="mb-6">
              <p className="mb-2 text-sm font-medium text-subtext">Palabras</p>
              <ul className="flex flex-col gap-2">
                {review.words.map((w, i) => (
                  <li key={i} className="flex items-center justify-between rounded-xl bg-surface px-4 py-3">
                    <div>
                      <p className="font-medium">{w.term}</p>
                      <p className="text-sm text-subtext">{w.translation}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {review.phrases.length > 0 && (
            <section className="mb-6">
              <p className="mb-2 text-sm font-medium text-subtext">Frases</p>
              <ul className="flex flex-col gap-2">
                {review.phrases.map((p, i) => (
                  <li key={i} className="rounded-xl bg-surface px-4 py-3">
                    <p className="mb-1 font-medium">{p.term}</p>
                    <p className="text-sm text-subtext">{p.explanation}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      ) : (
        <p className="text-sm text-subtext">No marcaste nada en esta lectura. ¡Buen trabajo!</p>
      )}
    </div>
  );
}
