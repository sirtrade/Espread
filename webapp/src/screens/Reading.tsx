import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client.js";
import type { Article, Session } from "../api/types.js";
import { Spinner } from "../components/Spinner.js";
import { ErrorState } from "../components/ErrorState.js";
import { Button } from "../components/Button.js";
import { tokenizeArticle } from "../lib/tokenize.js";
import { hapticSelect } from "../telegram/telegram.js";
import { ThemePicker } from "../components/ThemePicker.js";

type Mode = "words" | "sentences";

export function Reading() {
  const navigate = useNavigate();
  const [article, setArticle] = useState<Article | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("words");
  const [markedWords, setMarkedWords] = useState<Set<string>>(new Set());
  const [markedSents, setMarkedSents] = useState<Set<string>>(new Set());
  const [finishing, setFinishing] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { session: s, article: a } = await api.getSession();
      if (!s || !a) {
        navigate("/", { replace: true });
        return;
      }
      setSession(s);
      setArticle(a);
      setMarkedWords(new Set(s.markedWords));
      setMarkedSents(new Set(s.markedSents));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar la lectura");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Autosave marks a moment after they change.
  useEffect(() => {
    if (!session) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      api.putSession([...markedWords], [...markedSents]).catch(() => {
        /* best-effort autosave; final save happens on "Terminé" */
      });
    }, 800);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markedWords, markedSents]);

  const paragraphs = useMemo(() => (article ? tokenizeArticle(article.body) : []), [article]);

  function toggleWord(word: string) {
    hapticSelect();
    const key = word.toLowerCase();
    setMarkedWords((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleSentence(sentence: string) {
    hapticSelect();
    setMarkedSents((prev) => {
      const next = new Set(prev);
      if (next.has(sentence)) next.delete(sentence);
      else next.add(sentence);
      return next;
    });
  }

  async function finish() {
    setFinishing(true);
    setError(null);
    try {
      await api.putSession([...markedWords], [...markedSents]);
      await api.reviewSession();
      navigate("/review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo analizar la lectura");
      setFinishing(false);
    }
  }

  if (loading) return <Spinner label="Cargando artículo..." />;
  if (error && !article) return <ErrorState message={error} onRetry={load} />;
  if (!article) return null;

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col px-5 py-6 pb-28">
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

      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex gap-2">
          <button
            onClick={() => setMode("words")}
            className={`rounded-full px-4 py-1.5 text-xs font-medium ${
              mode === "words" ? "bg-accent text-white" : "bg-surface text-subtext"
            }`}
          >
            Palabras
          </button>
          <button
            onClick={() => setMode("sentences")}
            className={`rounded-full px-4 py-1.5 text-xs font-medium ${
              mode === "sentences" ? "bg-accent text-white" : "bg-surface text-subtext"
            }`}
          >
            Frases
          </button>
        </div>
        <div className="flex items-center gap-3">
          <ThemePicker />
          <button onClick={() => navigate("/settings")} className="text-lg text-subtext" aria-label="Ajustes">
            ⚙
          </button>
        </div>
      </div>

      <article className="article-text space-y-4">
        {paragraphs.map((p, pi) => (
          <p key={pi}>
            {p.sentences.map((s, si) => {
              const sentMarked = markedSents.has(s.text);
              return (
                <span
                  key={si}
                  onClick={mode === "sentences" ? () => toggleSentence(s.text) : undefined}
                  className={mode === "sentences" ? `cursor-pointer ${sentMarked ? "sent-marked" : ""}` : ""}
                >
                  {s.tokens.map((t, ti) =>
                    t.type === "word" ? (
                      <span
                        key={ti}
                        onClick={
                          mode === "words"
                            ? (e) => {
                                e.stopPropagation();
                                toggleWord(t.text);
                              }
                            : undefined
                        }
                        className={
                          mode === "words"
                            ? `cursor-pointer py-0.5 ${markedWords.has(t.text.toLowerCase()) ? "word-marked" : ""}`
                            : undefined
                        }
                      >
                        {t.text}
                      </span>
                    ) : (
                      <span key={ti}>{t.text}</span>
                    ),
                  )}{" "}
                </span>
              );
            })}
          </p>
        ))}
      </article>

      <div className="border-subtle-light fixed inset-x-0 bottom-0 border-t bg-bg px-5 py-4">
        <div className="mx-auto flex max-w-md items-center justify-between gap-4">
          <p className="text-xs text-subtext">
            {markedWords.size} palabras · {markedSents.size} frases marcadas
          </p>
          <Button onClick={finish} disabled={finishing}>
            {finishing ? "Analizando..." : "Terminé"}
          </Button>
        </div>
        {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
      </div>
    </div>
  );
}
