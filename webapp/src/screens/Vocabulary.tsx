import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client.js";
import type { KnownWord, KnownWordSource, VocabularyStats } from "../api/types.js";
import { ErrorState } from "../components/ErrorState.js";
import { Spinner } from "../components/Spinner.js";
import { locale, useT } from "../lib/i18n.js";

export function Vocabulary() {
  const navigate = useNavigate();
  const { t, lang } = useT();
  const [items, setItems] = useState<KnownWord[]>([]);
  const [stats, setStats] = useState<VocabularyStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [list, summary] = await Promise.all([api.getKnownWords(), api.getVocabularyStats()]);
      setItems(list.items);
      setStats(summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("vocabulary.loadError"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <Spinner label={t("vocabulary.loading")} />;
  if (error || !stats) return <ErrorState message={error ?? t("vocabulary.loadError")} onRetry={load} />;

  const sourceLabel = (source: KnownWordSource) => t(`vocabulary.source.${source}` as const);
  const maxWeekly = Math.max(1, ...stats.weekly.map((week) => week.added));

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col px-5 py-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t("vocabulary.title")}</h1>
        <button onClick={() => navigate("/")} className="text-sm text-subtext">
          {t("common.backHome")}
        </button>
      </div>

      <section className="mb-4 rounded-xl bg-surface p-5 text-center">
        <p className="text-4xl font-semibold">{stats.total}</p>
        <p className="mt-1 text-sm text-subtext">{t("vocabulary.total")}</p>
      </section>

      <section className="mb-4 rounded-xl bg-surface p-4">
        <h2 className="mb-3 text-sm font-medium">{t("vocabulary.breakdown")}</h2>
        <div className="grid grid-cols-3 gap-2 text-center">
          {(["learned", "reading", "manual"] as const).map((source) => (
            <div key={source}>
              <p className="text-xl font-semibold">{stats.bySource[source]}</p>
              <p className="text-xs text-subtext">{sourceLabel(source)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-4 rounded-xl bg-surface p-4">
        <h2 className="text-sm font-medium">{t("vocabulary.accumulating")}</h2>
        <p className="mb-3 mt-1 text-xs text-subtext">
          {t("vocabulary.accumulatingHint", { threshold: stats.accumulating.threshold })}
        </p>
        {stats.accumulating.total === 0 ? (
          <p className="text-2xl font-semibold">0</p>
        ) : (
          <div className="flex flex-col gap-1">
            {stats.accumulating.byEncounters.map((bucket) => (
              <p key={bucket.encounters} className="text-sm">
                {t("vocabulary.encounterCount", {
                  encounters: bucket.encounters,
                  threshold: stats.accumulating.threshold,
                  count: bucket.count,
                })}
              </p>
            ))}
          </div>
        )}
      </section>

      <section className="mb-4 rounded-xl bg-surface p-4">
        <h2 className="mb-3 text-sm font-medium">{t("vocabulary.weekly")}</h2>
        <div className="flex h-24 items-end gap-1" aria-label={t("vocabulary.weekly")}>
          {stats.weekly.map((week) => (
            <div key={week.weekStart} className="flex min-w-0 flex-1 flex-col items-center justify-end">
              <span className="mb-1 text-[10px] text-subtext">{t("vocabulary.weekAdded", { count: week.added })}</span>
              <div
                className="w-full rounded-t bg-accent"
                style={{ height: `${Math.max(3, (week.added / maxWeekly) * 64)}px` }}
                title={new Date(week.weekStart).toLocaleDateString(locale(lang))}
              />
            </div>
          ))}
        </div>
      </section>

      <section className="mb-4 rounded-xl bg-surface p-4">
        <h2 className="text-sm font-medium">{t("vocabulary.coverage")}</h2>
        <p className="mt-1 text-xs text-subtext">{t("vocabulary.coverageHint")}</p>
        {stats.coverage.estimatedTotal > 0 && (
          <p className="mt-2 text-sm font-medium">
            {t("vocabulary.estimatedTotal", { count: stats.coverage.estimatedTotal })}
          </p>
        )}
        <div className="mt-3 flex flex-col gap-3">
          {stats.coverage.ranges.map((range) => {
            const percent = range.total === 0 ? 0 : (range.known / range.total) * 100;
            return (
              <div key={range.from}>
                <div className="mb-1 flex justify-between text-xs">
                  <span>{t("vocabulary.range", range)}</span>
                  <span>{t("vocabulary.of", range)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded bg-subtle">
                  <div className="h-full rounded bg-teal" style={{ width: `${percent}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium">{t("vocabulary.list")}</h2>
        {items.length === 0 ? (
          <p className="text-sm text-subtext">{t("vocabulary.empty")}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {items.map((item) => (
              <li key={item.lemma} className="flex items-center justify-between rounded-lg bg-surface px-3 py-2">
                <span>{item.lemma}</span>
                <span className="text-xs text-subtext">{sourceLabel(item.source)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
