import { useState } from "react";
import { api, deviceTimezone } from "../api/client.js";
import { useAuth } from "../state/AuthContext.js";
import { Button } from "../components/Button.js";
import type { ExplainLang, Level } from "../api/types.js";
import { hapticSelect } from "../telegram/telegram.js";

const LEVELS: Level[] = ["A2", "B1", "B2", "C1"];
const LANGS: { value: ExplainLang; label: string }[] = [
  { value: "ru", label: "Русский" },
  { value: "en", label: "English" },
  { value: "es", label: "Solo español" },
];
const DEFAULT_TOPICS = ["Tecnología", "Deporte y fitness", "Cocina", "Ciencia", "Videojuegos", "América Latina"];

export function Onboarding() {
  const { setProfile } = useAuth();
  const [step, setStep] = useState(0);
  const [level, setLevel] = useState<Level>("A2");
  const [explainLang, setExplainLang] = useState<ExplainLang>("ru");
  const [topics, setTopics] = useState<string[]>(["Tecnología", "Ciencia"]);
  const [customTopic, setCustomTopic] = useState("");
  const [dailyEnabled, setDailyEnabled] = useState(true);
  const [dailyTime, setDailyTime] = useState("08:00");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleTopic(topic: string) {
    hapticSelect();
    setTopics((prev) => (prev.includes(topic) ? prev.filter((t) => t !== topic) : [...prev, topic]));
  }

  function addCustomTopic() {
    const t = customTopic.trim();
    if (t && !topics.includes(t)) setTopics((prev) => [...prev, t]);
    setCustomTopic("");
  }

  async function finish() {
    setSaving(true);
    setError(null);
    try {
      const profile = await api.patchMe({
        level,
        explainLang,
        topics,
        dailyEnabled,
        dailyTime,
        timezone: deviceTimezone(),
        markOnboarded: true,
      });
      setProfile(profile);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar tu perfil");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col px-5 py-8">
      <h1 className="mb-1 text-2xl font-semibold">Bienvenido a Lector</h1>
      <p className="mb-6 text-sm text-subtext">Lectura extensiva en español, a tu ritmo.</p>

      {step === 0 && (
        <div className="flex flex-1 flex-col gap-6">
          <div>
            <p className="mb-2 text-sm font-medium">Tu nivel de español</p>
            <div className="grid grid-cols-4 gap-2">
              {LEVELS.map((l) => (
                <button
                  key={l}
                  onClick={() => {
                    hapticSelect();
                    setLevel(l);
                  }}
                  className={`rounded-xl py-3 text-sm font-medium ${
                    level === l ? "bg-accent text-white" : "bg-surface text-text"
                  }`}
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
                  onClick={() => {
                    hapticSelect();
                    setExplainLang(l.value);
                  }}
                  className={`rounded-xl px-4 py-3 text-left text-sm font-medium ${
                    explainLang === l.value ? "bg-accent text-white" : "bg-surface text-text"
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="flex flex-1 flex-col gap-4">
          <p className="text-sm font-medium">Temas que te interesan</p>
          <div className="flex flex-wrap gap-2">
            {[...new Set([...DEFAULT_TOPICS, ...topics])].map((topic) => (
              <button
                key={topic}
                onClick={() => toggleTopic(topic)}
                className={`rounded-full px-4 py-2 text-sm ${
                  topics.includes(topic) ? "bg-accent text-white" : "bg-surface text-text"
                }`}
              >
                {topic}
              </button>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <input
              value={customTopic}
              onChange={(e) => setCustomTopic(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addCustomTopic()}
              placeholder="Otro tema..."
              className="border-subtle flex-1 rounded-xl border bg-surface px-3 py-2 text-sm outline-none"
            />
            <Button variant="secondary" onClick={addCustomTopic}>
              Añadir
            </Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-1 flex-col gap-4">
          <p className="text-sm font-medium">Lectura diaria</p>
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
            <label className="flex items-center justify-between rounded-xl bg-surface px-4 py-3">
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
      )}

      {error && <p className="mt-4 text-sm text-red-500">{error}</p>}

      <div className="mt-8 flex gap-3">
        {step > 0 && (
          <Button variant="secondary" onClick={() => setStep((s) => s - 1)}>
            Atrás
          </Button>
        )}
        {step < 2 && (
          <Button className="flex-1" onClick={() => setStep((s) => s + 1)} disabled={topics.length === 0 && step === 1}>
            Siguiente
          </Button>
        )}
        {step === 2 && (
          <Button className="flex-1" onClick={finish} disabled={saving}>
            {saving ? "Guardando..." : "Empezar a leer"}
          </Button>
        )}
      </div>
    </div>
  );
}
