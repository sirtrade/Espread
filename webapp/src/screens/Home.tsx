import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api, ApiRequestError } from "../api/client.js";
import type { BankItem, Stats } from "../api/types.js";
import { Spinner } from "../components/Spinner.js";
import { ErrorState } from "../components/ErrorState.js";
import { Button } from "../components/Button.js";
import { BankChip } from "../components/BankChip.js";
import { hapticImpact } from "../telegram/telegram.js";
import { locale, useT } from "../lib/i18n.js";

export function Home() {
  const { t, lang } = useT();
  const navigate = useNavigate();
  const location = useLocation() as { state?: { queued?: string[] } };
  const [stats, setStats] = useState<Stats | null>(null);
  const [bank, setBank] = useState<BankItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [practiceDue, setPracticeDue] = useState(0);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { session } = await api.getSession();
      if (session) {
        navigate("/read", { replace: true });
        return;
      }
      const [s, b, p] = await Promise.all([api.getStats(), api.getBank("active"), api.getPracticeQueue(1)]);
      setStats(s);
      setBank(b.items);
      setPracticeDue(p.due);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("home.loadError"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startReading() {
    hapticImpact();
    setStarting(true);
    setStartError(null);
    try {
      await api.createArticle();
      navigate("/read");
    } catch (err) {
      setStartError(err instanceof ApiRequestError ? err.message : t("home.startError"));
    } finally {
      setStarting(false);
    }
  }

  if (loading) return <Spinner label={t("home.progressLoading")} />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col px-5 py-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Lector</h1>
        <div className="flex items-center gap-4">
          <button onClick={() => navigate("/history")} className="text-sm text-subtext" aria-label={t("home.history")}>
            🕘 {t("home.history")}
          </button>
          <button onClick={() => navigate("/settings")} className="text-sm text-subtext" aria-label={t("home.settings")}>
            ⚙ {t("home.settings")}
          </button>
        </div>
      </div>

      {location.state?.queued && location.state.queued.length > 0 && (
        <div className="mb-4 rounded-xl bg-surface px-4 py-3 text-sm text-subtext">
          {t("home.queuedBanner", { count: location.state.queued.length })}
        </div>
      )}

      {stats && (
        <>
          <div className="mb-3 rounded-xl bg-surface px-4 py-3 text-center">
            <p className="text-2xl font-semibold">🔥 {stats.currentStreak}</p>
            <p className="mt-1 text-xs text-subtext">{t("home.streak")}</p>
          </div>
          <div className="mb-6 grid grid-cols-3 gap-3">
            <StatTile label={t("home.stat.articles")} value={stats.articlesRead} />
            <StatTile
              label={t("home.stat.inProgress")}
              value={stats.activePoolLimit > 0 ? `${stats.itemsInProgress} / ${stats.activePoolLimit}` : stats.itemsInProgress}
            />
            <StatTile label={t("home.stat.learned")} value={stats.itemsLearned} />
          </div>
          <WeeklyProgressChart
            stats={stats}
            localeName={locale(lang)}
            labels={{
              title: t("home.progress"),
              articles: t("home.progress.articles"),
              words: t("home.progress.words"),
            }}
          />
        </>
      )}

      <button
        onClick={() => navigate("/vocabulary")}
        className="mb-6 rounded-xl bg-surface px-4 py-3 text-left text-sm font-medium"
      >
        📚 {t("home.vocabulary")} →
      </button>

      {stats && stats.itemsQueued > 0 && (
        <button
          onClick={() => navigate("/bank")}
          className="mb-6 -mt-3 self-start text-xs text-subtext underline"
        >
          {t("home.queuedLink", { count: stats.itemsQueued })}
        </button>
      )}

      <div className="mb-6">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-medium text-subtext">{t("home.activeBank")}</p>
          <button onClick={() => navigate("/bank")} className="text-xs text-subtext underline">
            {t("home.seeAll")}
          </button>
        </div>
        {bank.length === 0 ? (
          <p className="text-sm text-subtext">{t("home.emptyBank")}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {bank.map((item) => (
              <BankChip key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>

      {startError && <p className="mb-3 text-sm text-red-500">{startError}</p>}

      <div className="mt-auto flex flex-col gap-2 pt-6">
        {practiceDue > 0 && (
          <Button variant="secondary" className="w-full" onClick={() => navigate("/practice")}>
            {t("home.practice", { count: practiceDue })}
          </Button>
        )}
        <Button className="w-full" onClick={startReading} disabled={starting}>
          {starting ? t("home.generating") : t("home.newReading")}
        </Button>
        {starting && <p className="mt-2 text-center text-xs text-subtext">{t("home.generatingHint")}</p>}
      </div>
    </div>
  );
}

function WeeklyProgressChart({
  stats,
  localeName,
  labels,
}: Readonly<{
  stats: Stats;
  localeName: string;
  labels: { title: string; articles: string; words: string };
}>) {
  const max = Math.max(1, ...stats.weeklyProgress.flatMap((week) => [week.articlesRead, week.wordsLearned]));
  return (
    <section className="mb-6 rounded-xl bg-surface p-4" aria-label={labels.title}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium">{labels.title}</h2>
        <div className="flex gap-3 text-[10px] text-subtext">
          <span>
            <i className="mr-1 inline-block h-2 w-2 rounded-sm bg-accent" />
            {labels.articles}
          </span>
          <span>
            <i className="mr-1 inline-block h-2 w-2 rounded-sm bg-teal" />
            {labels.words}
          </span>
        </div>
      </div>
      <div className="flex h-24 items-end gap-1">
        {stats.weeklyProgress.map((week) => {
          const date = new Date(`${week.weekStart}T00:00:00Z`).toLocaleDateString(localeName, {
            day: "numeric",
            month: "short",
          });
          return (
            <div
              key={week.weekStart}
              className="flex min-w-0 flex-1 items-end justify-center gap-px"
              title={`${date}: ${labels.articles} ${week.articlesRead}, ${labels.words} ${week.wordsLearned}`}
            >
              <div
                className="w-1/2 rounded-t bg-accent"
                style={{ height: `${week.articlesRead === 0 ? 0 : Math.max(2, (week.articlesRead / max) * 68)}px` }}
              />
              <div
                className="w-1/2 rounded-t bg-teal"
                style={{ height: `${week.wordsLearned === 0 ? 0 : Math.max(2, (week.wordsLearned / max) * 68)}px` }}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}

function StatTile({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl bg-surface px-3 py-4 text-center">
      <p className="text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-subtext">{label}</p>
    </div>
  );
}
