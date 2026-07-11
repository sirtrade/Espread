import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api, ApiRequestError } from "../api/client.js";
import type { BankItem, Stats } from "../api/types.js";
import { Spinner } from "../components/Spinner.js";
import { ErrorState } from "../components/ErrorState.js";
import { Button } from "../components/Button.js";
import { BankChip } from "../components/BankChip.js";
import { hapticImpact } from "../telegram/telegram.js";

export function Home() {
  const navigate = useNavigate();
  const location = useLocation() as { state?: { newlyLearned?: string[] } };
  const [stats, setStats] = useState<Stats | null>(null);
  const [bank, setBank] = useState<BankItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { session } = await api.getSession();
      if (session) {
        navigate("/read", { replace: true });
        return;
      }
      const [s, b] = await Promise.all([api.getStats(), api.getBank("active")]);
      setStats(s);
      setBank(b.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar tus datos");
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
      setStartError(err instanceof ApiRequestError ? err.message : "No se pudo generar la lectura");
    } finally {
      setStarting(false);
    }
  }

  if (loading) return <Spinner label="Cargando tu progreso..." />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col px-5 py-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Lector</h1>
        <button onClick={() => navigate("/settings")} className="text-sm text-subtext" aria-label="Ajustes">
          ⚙ Ajustes
        </button>
      </div>

      {location.state?.newlyLearned && location.state.newlyLearned.length > 0 && (
        <div className="banner-success mb-4 rounded-xl px-4 py-3 text-sm text-text">
          🎉 ¡Aprendiste {location.state.newlyLearned.length} palabra(s)/frase(s) nueva(s)!
        </div>
      )}

      {stats && (
        <div className="mb-6 grid grid-cols-3 gap-3">
          <StatTile label="Artículos" value={stats.articlesRead} />
          <StatTile label="En progreso" value={stats.itemsInProgress} />
          <StatTile label="Aprendidas" value={stats.itemsLearned} />
        </div>
      )}

      <div className="mb-6">
        <p className="mb-2 text-sm font-medium text-subtext">Tu banco activo</p>
        {bank.length === 0 ? (
          <p className="text-sm text-subtext">Aún no marcaste palabras. ¡Empieza a leer!</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {bank.map((item) => (
              <BankChip key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>

      {startError && <p className="mb-3 text-sm text-red-500">{startError}</p>}

      <div className="mt-auto pt-6">
        <Button className="w-full" onClick={startReading} disabled={starting}>
          {starting ? "Generando..." : "Nueva lectura"}
        </Button>
        {starting && <p className="mt-2 text-center text-xs text-subtext">Puede tardar hasta 30 segundos...</p>}
      </div>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-surface px-3 py-4 text-center">
      <p className="text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-subtext">{label}</p>
    </div>
  );
}
