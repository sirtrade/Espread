import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client.js";
import type { BankItem, BankStatus } from "../api/types.js";
import { Spinner } from "../components/Spinner.js";
import { ErrorState } from "../components/ErrorState.js";
import { hapticSelect } from "../telegram/telegram.js";
import { POS_LABEL, displayLemma, highlightSurface } from "../lib/vocab.js";

const TABS: { value: BankStatus; label: string }[] = [
  { value: "active", label: "En progreso" },
  { value: "queued", label: "En cola" },
  { value: "learned", label: "Aprendidas" },
  { value: "ignored", label: "Descartadas" },
];

const LEARNED_STREAK = 3;

/** Show the search box only once a tab holds enough words to warrant it. */
const SEARCH_THRESHOLD = 10;

/** SRS timer -> a short human line. The server may not send `nextPracticeAt`
 *  yet, so `undefined`/`null` both read as "coming soon". */
function nextPracticeLabel(at: number | null | undefined): string {
  if (at == null) return "Repaso pronto";
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const target = new Date(at);
  const startOfTarget = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime();
  const days = Math.round((startOfTarget - startOfToday) / 86_400_000);
  if (days <= 0) return "Repaso hoy";
  if (days === 1) return "Repaso mañana";
  return `Repaso en ${days} días`;
}

export function Bank() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<BankStatus>("active");
  const [items, setItems] = useState<BankItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [query, setQuery] = useState("");

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
    setOpenId(null);
    setQuery("");
  }, [tab]);

  async function changeStatus(item: BankItem, status: BankStatus) {
    hapticSelect();
    setBusyId(item.id);
    try {
      await api.patchBankItem(item.id, status);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      setOpenId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar la palabra");
    } finally {
      setBusyId(null);
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) => i.lemma.toLowerCase().includes(q) || (i.translation?.toLowerCase().includes(q) ?? false),
    );
  }, [items, query]);

  function toggleOpen(id: number) {
    hapticSelect();
    setOpenId((cur) => (cur === id ? null : id));
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col px-5 py-6">
      <div className="mb-6 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-subtext">
          ←
        </button>
        <h1 className="text-xl font-semibold">Tu banco de palabras</h1>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
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

      {!loading && items.length > SEARCH_THRESHOLD && (
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar palabra o traducción"
          className="mb-3 w-full rounded-xl bg-surface px-4 py-2 text-sm outline-none placeholder:text-subtext"
        />
      )}

      {loading ? (
        <Spinner label="Cargando palabras..." />
      ) : error && items.length === 0 ? (
        <ErrorState message={error} onRetry={() => load(tab)} />
      ) : items.length === 0 ? (
        <p className="text-sm text-subtext">
          {tab === "active" && "No hay palabras en progreso. ¡Marca palabras mientras lees!"}
          {tab === "queued" && "No hay palabras en cola. Se llena al superar tu límite de palabras en estudio."}
          {tab === "learned" && "Aún no hay palabras aprendidas. Llegarán con la práctica."}
          {tab === "ignored" && "No hay palabras descartadas."}
        </p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-subtext">No hay palabras que coincidan con «{query}».</p>
      ) : (
        <ul className="flex flex-col gap-1.5 pb-8">
          {error && <p className="text-xs text-red-500">{error}</p>}
          {filtered.map((item) => (
            <li key={item.id} className="overflow-hidden rounded-xl bg-surface">
              <button
                onClick={() => toggleOpen(item.id)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                aria-expanded={openId === item.id}
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className="truncate font-medium">{displayLemma(item)}</span>
                    {item.pos === "phrase" && (
                      <span className="shrink-0 text-[0.65rem] uppercase tracking-wide text-subtext">frase</span>
                    )}
                  </span>
                  {item.translation && (
                    <span className="mt-0.5 block truncate text-sm text-subtext">{item.translation}</span>
                  )}
                </span>
                {tab === "active" && (
                  <span className="flex shrink-0 gap-0.5" title={`${item.cleanStreak}/${LEARNED_STREAK} encuentros limpios`}>
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className={`h-1.5 w-1.5 rounded-full ${i < item.cleanStreak ? "bg-amber" : "dot-empty"}`}
                      />
                    ))}
                  </span>
                )}
              </button>

              {openId === item.id && (
                <BankDetail item={item} busy={busyId === item.id} onChangeStatus={changeStatus} />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function BankDetail({
  item,
  busy,
  onChangeStatus,
}: {
  item: BankItem;
  busy: boolean;
  onChangeStatus: (item: BankItem, status: BankStatus) => void;
}) {
  return (
    <div className="border-subtle-light border-t px-4 py-4">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-lg font-semibold">{displayLemma(item)}</span>
        <span className="text-sm text-subtext">· {POS_LABEL[item.pos] ?? "palabra"}</span>
        {item.freqBand === "rare" && (
          <span className="badge-amber rounded-full px-2 py-0.5 text-xs font-medium text-text">poco frecuente</span>
        )}
      </div>

      {item.translation && <p className="mt-2 text-base">{item.translation}</p>}
      {item.note && <p className="mt-1 text-sm text-subtext">{item.note}</p>}

      {item.firstContext && (
        <div className="border-subtle-light mt-3 border-l-2 pl-3">
          <p className="text-sm italic">{highlightSurface(item.firstContext, item.surfaceForm ?? "")}</p>
          {item.contextTranslation && <p className="mt-1 text-sm text-subtext">{item.contextTranslation}</p>}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between text-xs text-subtext">
        <span className="flex items-center gap-1.5">
          Encuentros {Math.min(item.cleanStreak, LEARNED_STREAK)}/{LEARNED_STREAK}
          <span className="flex gap-0.5">
            {Array.from({ length: LEARNED_STREAK }, (_, i) => (
              <span key={i} className={`h-1.5 w-1.5 rounded-full ${i < item.cleanStreak ? "bg-amber" : "dot-empty"}`} />
            ))}
          </span>
        </span>
        {item.status === "active" && <span>{nextPracticeLabel(item.nextPracticeAt)}</span>}
      </div>

      {item.status === "queued" && (
        <p className="mt-3 text-xs text-subtext">
          En cola: entrará en estudio automáticamente cuando se libere un lugar, o actívala ahora mismo.
        </p>
      )}

      <div className="mt-4 flex gap-2">
        {item.status === "active" && (
          <>
            <DetailButton disabled={busy} onClick={() => onChangeStatus(item, "learned")}>
              Ya la sé
            </DetailButton>
            <DetailButton disabled={busy} onClick={() => onChangeStatus(item, "ignored")}>
              Descartar
            </DetailButton>
          </>
        )}
        {item.status === "queued" && (
          <DetailButton disabled={busy} onClick={() => onChangeStatus(item, "active")}>
            Estudiar ahora
          </DetailButton>
        )}
        {(item.status === "learned" || item.status === "ignored") && (
          <DetailButton disabled={busy} onClick={() => onChangeStatus(item, "active")}>
            Practicar de nuevo
          </DetailButton>
        )}
      </div>
    </div>
  );
}

function DetailButton({
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
      className="rounded-full bg-bg px-4 py-1.5 text-xs font-medium text-subtext disabled:opacity-50"
    >
      {children}
    </button>
  );
}
