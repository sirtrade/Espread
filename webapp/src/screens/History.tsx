import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client.js";
import type { HistoryItem } from "../api/types.js";
import { Spinner } from "../components/Spinner.js";
import { ErrorState } from "../components/ErrorState.js";
import { useT, locale } from "../lib/i18n.js";

const PAGE_SIZE = 20;

export function History() {
  const { t, lang } = useT();
  const navigate = useNavigate();
  const formatDate = (ts: number) =>
    new Date(ts).toLocaleDateString(locale(lang), { day: "numeric", month: "short", year: "numeric" });
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { items: page, total: t } = await api.getHistory(PAGE_SIZE, 0);
      setItems(page);
      setTotal(t);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("history.loadError"));
    } finally {
      setLoading(false);
    }
  }

  async function loadMore() {
    setLoadingMore(true);
    try {
      const { items: page, total: t } = await api.getHistory(PAGE_SIZE, items.length);
      setItems((prev) => [...prev, ...page]);
      setTotal(t);
    } catch {
      /* the button stays visible; the user can retry */
    } finally {
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <Spinner label={t("history.loading")} />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col px-5 py-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t("home.history")}</h1>
        <button onClick={() => navigate("/")} className="text-sm text-subtext" aria-label={t("history.backHome")}>
          {t("history.backHome")}
        </button>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-subtext">{t("history.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id}>
              <button
                onClick={() => navigate(`/history/${item.id}`)}
                className="w-full rounded-xl bg-surface px-4 py-3 text-left"
              >
                <p className="font-medium">{item.title}</p>
                <p className="mt-1 text-xs text-subtext">
                  {item.topic} · {formatDate(item.readAt)} ·{" "}
                  {t("history.wordsCount", { count: item.markedWordsCount })} ·{" "}
                  {t("history.sentsCount", { count: item.markedSentsCount })}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}

      {items.length < total && (
        <button onClick={loadMore} disabled={loadingMore} className="mt-4 text-sm text-subtext underline">
          {loadingMore ? t("common.loading") : t("history.loadMore")}
        </button>
      )}
    </div>
  );
}
