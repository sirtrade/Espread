import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client.js";
import type { ArchivedReviewResult, LegacyReviewResult, ReadArticle } from "../api/types.js";
import { isArchivedReviewResult } from "../api/types.js";
import { Spinner } from "../components/Spinner.js";
import { ErrorState } from "../components/ErrorState.js";
import { tokenizeArticle } from "../lib/tokenize.js";
import { displayLemma } from "../lib/vocab.js";
import { useT, locale } from "../lib/i18n.js";

/** Read-only view of a past reading: the article with the words and phrases
 *  the user had marked at the time, plus the saved LLM review below. */
export function HistoryArticle() {
  const { t, lang } = useT();
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
      setError(err instanceof Error ? err.message : t("historyArticle.loadError"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const paragraphs = useMemo(() => (article ? tokenizeArticle(article.body) : []), [article]);

  // Highlights restore by occurrence (pos) when available. Legacy archived
  // marks may have no pos: those fall back to plain text matching, which can't
  // pin a single occurrence — an accepted degradation for old readings.
  const highlight = useMemo(() => {
    const ranges = new Map<string, [number, number][]>();
    const posSents = new Set<string>();
    const legacyWords = new Set<string>();
    const legacySents = new Set<string>();
    for (const m of article?.marks ?? []) {
      if (m.pos) {
        const key = `${m.pos.p}:${m.pos.s}`;
        if (m.kind === "sentence") posSents.add(key);
        else (ranges.get(key) ?? ranges.set(key, []).get(key)!).push(m.pos.t);
      } else if (m.kind === "sentence") {
        legacySents.add((m.sentence || m.text).trim());
      } else {
        legacyWords.add(m.text.toLowerCase());
      }
    }
    return { ranges, posSents, legacyWords, legacySents };
  }, [article]);

  function tokenMarked(p: number, s: number, ti: number, text: string): boolean {
    const rs = highlight.ranges.get(`${p}:${s}`);
    if (rs?.some(([a, b]) => ti >= a && ti <= b)) return true;
    return highlight.legacyWords.has(text.toLowerCase());
  }

  function sentMarked(p: number, s: number, text: string): boolean {
    return highlight.posSents.has(`${p}:${s}`) || highlight.legacySents.has(text.trim());
  }

  const review = article?.reviewResult;

  if (loading) return <Spinner label={t("reading.loading")} />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!article) return null;

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col px-5 py-6">
      <div className="mb-4 flex items-center justify-between">
        <button onClick={() => navigate("/history")} className="text-sm text-subtext" aria-label={t("historyArticle.back")}>
          {t("historyArticle.back")}
        </button>
        <p className="text-xs text-subtext">
          {t("historyArticle.readOn", {
            date: new Date(article.readAt).toLocaleDateString(locale(lang), {
              day: "numeric",
              month: "long",
              year: "numeric",
            }),
          })}
        </p>
      </div>

      <h1 className="mb-1 text-2xl font-semibold">{article.title}</h1>
      {article.sourceName && (
        <p className="mb-4 text-xs text-subtext">
          {t("reading.source")}{" "}
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
              <span key={si} className={sentMarked(pi, si, s.text) ? "sent-marked" : ""}>
                {s.tokens.map((t, ti) =>
                  t.type === "word" ? (
                    <span key={ti} className={tokenMarked(pi, si, ti, t.text) ? "word-marked" : undefined}>
                      {t.text}
                    </span>
                  ) : (
                    <span key={ti} className={tokenMarked(pi, si, ti, t.text) ? "word-marked" : undefined}>
                      {t.text}
                    </span>
                  ),
                )}{" "}
              </span>
            ))}
          </p>
        ))}
      </article>

      <ReviewArchive review={review ?? null} />
    </div>
  );
}

/** Renders the saved review below the article, handling both archived formats
 *  (new `{ items }` and legacy `{ words, phrases }`) and a missing review. */
function ReviewArchive({ review }: { review: ReadArticle["reviewResult"] }) {
  const { t } = useT();
  if (isArchivedReviewResult(review)) return <NewReviewArchive review={review} />;
  if (review && (review.words.length > 0 || review.phrases.length > 0))
    return <LegacyReviewArchive review={review} />;
  return <p className="text-sm text-subtext">{t("review.nothingMarked")}</p>;
}

function NewReviewArchive({ review }: { review: ArchivedReviewResult }) {
  const { t } = useT();
  if (review.items.length === 0)
    return <p className="text-sm text-subtext">{t("review.nothingMarked")}</p>;
  return (
    <>
      <h2 className="mb-4 text-lg font-semibold">{t("review.whatYouMarked")}</h2>
      <ul className="flex flex-col gap-2">
        {review.items.map((item, i) => (
          <li key={i} className="rounded-xl bg-surface px-4 py-3">
            <p className="font-medium">{displayLemma(item)}</p>
            {item.translation && <p className="text-sm text-subtext">{item.translation}</p>}
            {item.note && <p className="mt-1 text-xs text-subtext">{item.note}</p>}
          </li>
        ))}
      </ul>
    </>
  );
}

function LegacyReviewArchive({ review }: { review: LegacyReviewResult }) {
  const { t } = useT();
  return (
    <>
      <h2 className="mb-4 text-lg font-semibold">{t("review.whatYouMarked")}</h2>

      {review.words.length > 0 && (
        <section className="mb-6">
          <p className="mb-2 text-sm font-medium text-subtext">{t("historyArticle.words")}</p>
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
          <p className="mb-2 text-sm font-medium text-subtext">{t("historyArticle.phrases")}</p>
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
  );
}
