import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, deviceTimezone } from "../api/client.js";
import { useAuth } from "../state/AuthContext.js";
import { Button } from "../components/Button.js";
import type { ExplainLang, Level } from "../api/types.js";
import { confirmDialog } from "../telegram/telegram.js";
import { ThemePicker } from "../components/ThemePicker.js";
import { FontSizePicker } from "../components/FontSizePicker.js";

const LEVELS: Level[] = ["A2", "B1", "B2", "C1"];
const POOL_PRESETS: { value: number; label: string }[] = [
  { value: 10, label: "10" },
  { value: 20, label: "20" },
  { value: 30, label: "30" },
  { value: 50, label: "50" },
  { value: 0, label: "Sin límite" },
];
const LANGS: { value: ExplainLang; label: string }[] = [
  { value: "ru", label: "Русский" },
  { value: "en", label: "English" },
  { value: "es", label: "Solo español" },
];

export function Settings() {
  const navigate = useNavigate();
  const { profile, setProfile } = useAuth();
  const [level, setLevel] = useState<Level>(profile!.level);
  const [explainLang, setExplainLang] = useState<ExplainLang>(profile!.explainLang);
  const [topics, setTopics] = useState<string[]>(profile!.topics);
  const [customTopic, setCustomTopic] = useState("");
  const [dailyEnabled, setDailyEnabled] = useState(profile!.dailyEnabled);
  const [dailyTime, setDailyTime] = useState(profile!.dailyTime);
  const [botQuizzesPerDay, setBotQuizzesPerDay] = useState(profile!.botQuizzesPerDay);
  const [activePoolLimit, setActivePoolLimit] = useState(profile!.activePoolLimit);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function removeTopic(topic: string) {
    setTopics((prev) => prev.filter((t) => t !== topic));
  }

  function addCustomTopic() {
    const t = customTopic.trim();
    if (t && !topics.includes(t)) setTopics((prev) => [...prev, t]);
    setCustomTopic("");
  }

  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const updated = await api.patchMe({
        level,
        explainLang,
        topics,
        dailyEnabled,
        dailyTime,
        botQuizzesPerDay,
        activePoolLimit,
        timezone: deviceTimezone(),
      });
      setProfile(updated);
      setMessage("Guardado");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  async function resetProgress() {
    const ok = await confirmDialog(
      "Esto borrará tu banco de palabras, tus artículos y tus estadísticas. Esta acción no se puede deshacer.",
      "Sí, reiniciar",
    );
    if (!ok) return;
    setResetting(true);
    setError(null);
    try {
      await api.resetProgress();
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo reiniciar el progreso");
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col px-5 py-6">
      <div className="mb-6 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-subtext">
          ←
        </button>
        <h1 className="text-xl font-semibold">Ajustes</h1>
      </div>

      <div className="flex flex-col gap-6">
        <div>
          <p className="mb-2 text-sm font-medium">Tema de lectura</p>
          <div className="rounded-xl bg-surface px-4 py-3">
            <ThemePicker withLabels />
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium">Tamaño del texto</p>
          <div className="rounded-xl bg-surface px-4 py-3">
            <FontSizePicker />
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium">Nivel</p>
          <div className="grid grid-cols-4 gap-2">
            {LEVELS.map((l) => (
              <button
                key={l}
                onClick={() => setLevel(l)}
                className={`rounded-xl py-3 text-sm font-medium ${l === level ? "bg-accent text-white" : "bg-surface"}`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium">Idioma de las explicaciones</p>
          <div className="flex flex-col gap-2">
            {LANGS.map((l) => (
              <button
                key={l.value}
                onClick={() => setExplainLang(l.value)}
                className={`rounded-xl px-4 py-3 text-left text-sm font-medium ${
                  l.value === explainLang ? "bg-accent text-white" : "bg-surface"
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium">Temas</p>
          <div className="flex flex-wrap gap-2">
            {topics.map((topic) => (
              <button
                key={topic}
                onClick={() => removeTopic(topic)}
                className="rounded-full bg-accent px-4 py-2 text-sm text-white"
                title="Quitar"
              >
                {topic} ✕
              </button>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <input
              value={customTopic}
              onChange={(e) => setCustomTopic(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addCustomTopic()}
              placeholder="Añadir tema..."
              className="border-subtle flex-1 rounded-xl border bg-surface px-3 py-2 text-sm outline-none"
            />
            <Button variant="secondary" onClick={addCustomTopic}>
              Añadir
            </Button>
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium">Lectura diaria</p>
          <label className="flex items-center justify-between rounded-xl bg-surface px-4 py-3">
            <span className="text-sm">Enviarme un artículo cada día</span>
            <input
              type="checkbox"
              checked={dailyEnabled}
              onChange={(e) => setDailyEnabled(e.target.checked)}
              className="h-5 w-5 accent-[var(--tg-accent)]"
            />
          </label>
          {dailyEnabled && (
            <label className="mt-2 flex items-center justify-between rounded-xl bg-surface px-4 py-3">
              <span className="text-sm">Hora</span>
              <input
                type="time"
                value={dailyTime}
                onChange={(e) => setDailyTime(e.target.value)}
                className="rounded-lg bg-transparent text-sm outline-none"
              />
            </label>
          )}
        </div>

        <div>
          <p className="mb-2 text-sm font-medium">Quiz de vocabulario en el chat</p>
          <div className="rounded-xl bg-surface px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-sm">Quizzes por día</span>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setBotQuizzesPerDay((n) => Math.max(0, n - 1))}
                  className="bg-subtle h-8 w-8 rounded-full text-lg leading-none"
                  aria-label="Menos"
                >
                  −
                </button>
                <span className="w-6 text-center text-sm font-semibold">{botQuizzesPerDay}</span>
                <button
                  onClick={() => setBotQuizzesPerDay((n) => Math.min(12, n + 1))}
                  className="bg-subtle h-8 w-8 rounded-full text-lg leading-none"
                  aria-label="Más"
                >
                  +
                </button>
              </div>
            </div>
            <p className="mt-2 text-xs text-subtext">
              {botQuizzesPerDay === 0
                ? "Desactivado. El bot no enviará quizzes."
                : `El bot te enviará ${botQuizzesPerDay} quiz(zes) entre las 09:00 y las 21:00.`}
            </p>
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium">Palabras en estudio</p>
          <div className="grid grid-cols-5 gap-2">
            {POOL_PRESETS.map((p) => (
              <button
                key={p.value}
                onClick={() => setActivePoolLimit(p.value)}
                className={`rounded-xl px-2 py-3 text-sm font-medium ${
                  p.value === activePoolLimit ? "bg-accent text-white" : "bg-surface"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-subtext">
            {activePoolLimit === 0
              ? "Sin límite: todas las palabras que guardes entran en estudio."
              : `Mantendrás hasta ${activePoolLimit} palabras en estudio a la vez. Las demás esperan en cola y entran a medida que dominas o descartas otras.`}
          </p>
        </div>

        {message && <p className="text-sm text-teal">{message}</p>}
        {error && <p className="text-sm text-red-500">{error}</p>}

        <Button onClick={save} disabled={saving || topics.length === 0}>
          {saving ? "Guardando..." : "Guardar cambios"}
        </Button>

        <div className="mt-8 border-t border-subtle-light pt-6">
          <Button variant="secondary" className="w-full text-red-500" onClick={resetProgress} disabled={resetting}>
            {resetting ? "Reiniciando..." : "Restablecer progreso"}
          </Button>
        </div>
      </div>
    </div>
  );
}
