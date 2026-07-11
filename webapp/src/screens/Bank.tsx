import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client.js";
import type { BankItem, BankStatus } from "../api/types.js";
import { Spinner } from "../components/Spinner.js";
import { ErrorState } from "../components/ErrorState.js";
import { hapticSelect } from "../telegram/telegram.js";

const TABS: { value: BankStatus; label: string }[] = [
  { value: "active", label: "En progreso" },
  { value: "learned", label: "Aprendidas" },
  { value: "ignored", label: "Descartadas" },
];

export function Bank() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<BankStatus>("active");
  const [items, setItems] = useState<BankItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  async function load(status: BankStatus) {
    setLoading(true);
    setError(null);
    try {
      const { items: rows } = await api.getBank(status);
      setItems(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar tu banco");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(tab);
  }, [tab]);

  async function changeStatus(item: BankItem, status: BankStatus) {
    hapticSelect();
    setBusyId(item.id);
    try {
      await api.patchBankItem(item.id, status);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar la palabra");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col px-5 py-6">
      <div className="mb-6 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-subtext">
          ←
        </button>
        <h1 className="text-xl font-semibold">Tu banco de palabras</h1>
      </div>

      <div className="mb-4 flex gap-2">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`rounded-full px-4 py-1.5 text-xs font-medium ${
              tab === t.value ? "bg-accent text-white" : "bg-surface text-subtext"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <Spinner label="Cargando palabras..." />
      ) : error && items.length === 0 ? (
        <ErrorState message={error} onRetry={() => load(tab)} />
      ) : items.length === 0 ? (
        <p className="text-sm text-subtext">
          {tab === "active" && "No hay palabras en progreso. ¡Marca palabras mientras lees!"}
          {tab === "learned" && "Aún no hay palabras aprendidas. Llegarán con la práctica."}
          {tab === "ignored" && "No hay palabras descartadas."}
        </p>
      ) : (
        <ul className="flex flex-col gap-2 pb-8">
          {error && <p className="text-xs text-red-500">{error}</p>}
          {items.map((item) => (
            <li key={item.id} className="rounded-xl bg-surface px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">
                    {item.term}
                    {item.isPhrase && <span className="ml-2 text-xs text-subtext">frase</span>}
                  </p>
                  {item.translation && <p className="text-sm text-subtext">{item.translation}</p>}
                </div>
                {tab === "active" && (
                  <span className="flex shrink-0 gap-0.5" title={`${item.cleanStreak}/3 encuentros limpios`}>
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className={`h-1.5 w-1.5 rounded-full ${i < item.cleanStreak ? "bg-amber" : "dot-empty"}`}
                      />
                    ))}
                  </span>
                )}
              </div>
              {item.firstContext && (
                <p className="mt-1 text-xs italic text-subtext">«{item.firstContext}»</p>
              )}
              <div className="mt-2 flex gap-2">
                {tab === "active" && (
                  <>
                    <StatusButton disabled={busyId === item.id} onClick={() => changeStatus(item, "learned")}>
                      Ya la sé
                    </StatusButton>
                    <StatusButton disabled={busyId === item.id} onClick={() => changeStatus(item, "ignored")}>
                      Descartar
                    </StatusButton>
                  </>
                )}
                {tab !== "active" && (
                  <StatusButton disabled={busyId === item.id} onClick={() => changeStatus(item, "active")}>
                    Practicar de nuevo
                  </StatusButton>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatusButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-full bg-bg px-3 py-1 text-xs font-medium text-subtext disabled:opacity-50"
    >
      {children}
    </button>
  );
}
