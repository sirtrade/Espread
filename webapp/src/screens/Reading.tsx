import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client.js";
import type { Article, Session } from "../api/types.js";
import { Spinner } from "../components/Spinner.js";
import { ErrorState } from "../components/ErrorState.js";
import { Button } from "../components/Button.js";
import { tokenizeArticle } from "../lib/tokenize.js";
import { fromMarks, noWordBetween, sentenceWordRange, toMarks, type MarkPos } from "../lib/marks.js";
import { markReadingHintSeen, readingHintSeen } from "../lib/hint.js";
import { hapticSelect } from "../telegram/telegram.js";
import { ThemePicker } from "../components/ThemePicker.js";

const LONG_PRESS_MS = 450;
const MOVE_CANCEL_PX = 10;

export function Reading() {
  const navigate = useNavigate();
  const [article, setArticle] = useState<Article | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [marks, setMarks] = useState<MarkPos[]>([]);
  const [showHint, setShowHint] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Long-press detection shared across all word tokens: a tap toggles the word,
  // a hold (~450ms without moving) toggles the whole sentence.
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressStart = useRef<{ x: number; y: number } | null>(null);
  const longPressFired = useRef(false);

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
      setMarks(fromMarks(s.marks));
      if (!readingHintSeen()) setShowHint(true);
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

  const paragraphs = useMemo(() => (article ? tokenizeArticle(article.body) : []), [article]);

  // Autosave marks a moment after they change.
  useEffect(() => {
    if (!session) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      api.putSession(toMarks(marks, paragraphs)).catch(() => {
        /* best-effort autosave; final save happens on "Terminé" */
      });
    }, 800);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marks]);

  function dismissHint() {
    if (!showHint) return;
    setShowHint(false);
    markReadingHintSeen();
  }

  // Tap on a word: remove it if already marked, extend an adjacent mark into a
  // span, or start a fresh single-word mark on this occurrence.
  function tapWord(p: number, s: number, ti: number) {
    hapticSelect();
    dismissHint();
    const tokens = paragraphs[p].sentences[s].tokens;
    setMarks((prev) => {
      const covering = prev.findIndex(
        (m) => m.kind !== "sentence" && m.p === p && m.s === s && ti >= m.t[0] && ti <= m.t[1],
      );
      if (covering !== -1) {
        return prev.filter((_, i) => i !== covering);
      }
      const adjacent = prev.findIndex(
        (m) =>
          m.kind !== "sentence" &&
          m.p === p &&
          m.s === s &&
          ((ti > m.t[1] && noWordBetween(tokens, m.t[1], ti)) ||
            (ti < m.t[0] && noWordBetween(tokens, m.t[0], ti))),
      );
      if (adjacent !== -1) {
        const m = prev[adjacent];
        const next = [...prev];
        next[adjacent] = { ...m, kind: "span", t: [Math.min(m.t[0], ti), Math.max(m.t[1], ti)] };
        return next;
      }
      return [...prev, { kind: "word", p, s, t: [ti, ti] }];
    });
  }

  // Long-press: toggle the whole sentence as one mark.
  function toggleSentence(p: number, s: number) {
    hapticSelect();
    dismissHint();
    setMarks((prev) => {
      const idx = prev.findIndex((m) => m.kind === "sentence" && m.p === p && m.s === s);
      if (idx !== -1) return prev.filter((_, i) => i !== idx);
      const range = sentenceWordRange(paragraphs[p].sentences[s].tokens);
      return [...prev, { kind: "sentence", p, s, t: range }];
    });
  }

  function cancelPress() {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
    pressStart.current = null;
  }

  function onPointerDown(e: React.PointerEvent, p: number, s: number) {
    longPressFired.current = false;
    pressStart.current = { x: e.clientX, y: e.clientY };
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      toggleSentence(p, s);
    }, LONG_PRESS_MS);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!pressStart.current) return;
    if (
      Math.abs(e.clientX - pressStart.current.x) > MOVE_CANCEL_PX ||
      Math.abs(e.clientY - pressStart.current.y) > MOVE_CANCEL_PX
    ) {
      cancelPress();
    }
  }

  function onWordClick(p: number, s: number, ti: number) {
    if (longPressFired.current) {
      longPressFired.current = false;
      return;
    }
    tapWord(p, s, ti);
  }

  function isTokenMarked(p: number, s: number, ti: number): boolean {
    return marks.some((m) => m.kind !== "sentence" && m.p === p && m.s === s && ti >= m.t[0] && ti <= m.t[1]);
  }

  function isSentMarked(p: number, s: number): boolean {
    return marks.some((m) => m.kind === "sentence" && m.p === p && m.s === s);
  }

  async function finish() {
    setFinishing(true);
    setError(null);
    try {
      await api.putSession(toMarks(marks, paragraphs));
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

      <div className="mb-4 flex items-center justify-end">
        <div className="flex items-center gap-3">
          <ThemePicker />
          <button onClick={() => navigate("/settings")} className="text-lg text-subtext" aria-label="Ajustes">
            ⚙
          </button>
        </div>
      </div>

      {showHint && (
        <button
          onClick={dismissHint}
          className="bg-subtle mb-4 rounded-xl px-4 py-3 text-left text-xs text-subtext"
        >
          Toca una palabra para marcarla. Toca la de al lado para unirlas en una frase. Mantén pulsado para marcar
          la oración entera.
        </button>
      )}

      <article className="article-text space-y-4" onContextMenu={(e) => e.preventDefault()}>
        {paragraphs.map((p, pi) => (
          <p key={pi}>
            {p.sentences.map((s, si) => (
              <span key={si} className={isSentMarked(pi, si) ? "sent-marked" : ""}>
                {s.tokens.map((t, ti) =>
                  t.type === "word" ? (
                    <span
                      key={ti}
                      onPointerDown={(e) => onPointerDown(e, pi, si)}
                      onPointerMove={onPointerMove}
                      onPointerUp={cancelPress}
                      onPointerCancel={cancelPress}
                      onClick={() => onWordClick(pi, si, ti)}
                      className={`cursor-pointer py-0.5 ${isTokenMarked(pi, si, ti) ? "word-marked" : ""}`}
                    >
                      {t.text}
                    </span>
                  ) : (
                    <span key={ti} className={isTokenMarked(pi, si, ti) ? "word-marked" : undefined}>
                      {t.text}
                    </span>
                  ),
                )}{" "}
              </span>
            ))}
          </p>
        ))}
      </article>

      <div className="border-subtle-light fixed inset-x-0 bottom-0 border-t bg-bg px-5 py-4">
        <div className="mx-auto flex max-w-md items-center justify-between gap-4">
          <p className="text-xs text-subtext">
            {marks.length} {marks.length === 1 ? "marca" : "marcas"}
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
