import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, deviceTimezone } from "../api/client.js";
import { useAuth } from "../state/AuthContext.js";
import { Button } from "../components/Button.js";
import type { ExplainLang, Level } from "../api/types.js";
import { confirmDialog } from "../telegram/telegram.js";
import { ThemePicker } from "../components/ThemePicker.js";
import { FontSizePicker } from "../components/FontSizePicker.js";
import { useT } from "../lib/i18n.js";
import { langLabel } from "../lib/langs.js";

const LEVELS: Level[] = ["A2", "B1", "B2", "C1"];
const POOL_PRESETS: number[] = [10, 20, 30, 50, 0];
const LANG_VALUES: ExplainLang[] = ["ru", "en", "es"];

export function Settings() {
  const { t, lang } = useT();
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
      setMessage(t("settings.saved"));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("settings.saveError"));
    } finally {
      setSaving(false);
    }
  }

  async function resetProgress() {
    const ok = await confirmDialog(t("settings.resetConfirm"), t("settings.resetConfirmYes"));
    if (!ok) return;
    setResetting(true);
    setError(null);
    try {
      await api.resetProgress();
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("settings.resetError"));
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
        <h1 className="text-xl font-semibold">{t("home.settings")}</h1>
      </div>

      <div className="flex flex-col gap-6">
        <div>
          <p className="mb-2 text-sm font-medium">{t("settings.readingTheme")}</p>
          <div className="rounded-xl bg-surface px-4 py-3">
            <ThemePicker withLabels />
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium">{t("settings.textSize")}</p>
          <div className="rounded-xl bg-surface px-4 py-3">
            <FontSizePicker />
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium">{t("settings.level")}</p>
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
          <p className="mb-2 text-sm font-medium">{t("onboarding.explainLang")}</p>
          <div className="flex flex-col gap-2">
            {LANG_VALUES.map((value) => (
              <button
                key={value}
                onClick={() => setExplainLang(value)}
                className={`rounded-xl px-4 py-3 text-left text-sm font-medium ${
                  value === explainLang ? "bg-accent text-white" : "bg-surface"
                }`}
              >
                {langLabel(lang, value)}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium">{t("settings.topics")}</p>
          <div className="flex flex-wrap gap-2">
            {topics.map((topic) => (
              <button
                key={topic}
                onClick={() => removeTopic(topic)}
                className="rounded-full bg-accent px-4 py-2 text-sm text-white"
                title={t("settings.removeTopic")}
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
              placeholder={t("settings.addTopic")}
              className="border-subtle flex-1 rounded-xl border bg-surface px-3 py-2 text-sm outline-none"
            />
            <Button variant="secondary" onClick={addCustomTopic}>
              {t("common.add")}
            </Button>
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium">{t("onboarding.daily")}</p>
          <label className="flex items-center justify-between rounded-xl bg-surface px-4 py-3">
            <span className="text-sm">{t("onboarding.dailyToggle")}</span>
            <input
              type="checkbox"
              checked={dailyEnabled}
              onChange={(e) => setDailyEnabled(e.target.checked)}
              className="h-5 w-5 accent-[var(--tg-accent)]"
            />
          </label>
          {dailyEnabled && (
            <label className="mt-2 flex items-center justify-between rounded-xl bg-surface px-4 py-3">
              <span className="text-sm">{t("onboarding.time")}</span>
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
          <p className="mb-2 text-sm font-medium">{t("settings.botQuiz")}</p>
          <div className="rounded-xl bg-surface px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-sm">{t("settings.quizzesPerDay")}</span>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setBotQuizzesPerDay((n) => Math.max(0, n - 1))}
                  className="bg-subtle h-8 w-8 rounded-full text-lg leading-none"
                  aria-label={t("settings.less")}
                >
                  −
                </button>
                <span className="w-6 text-center text-sm font-semibold">{botQuizzesPerDay}</span>
                <button
                  onClick={() => setBotQuizzesPerDay((n) => Math.min(12, n + 1))}
                  className="bg-subtle h-8 w-8 rounded-full text-lg leading-none"
                  aria-label={t("settings.more")}
                >
                  +
                </button>
              </div>
            </div>
            <p className="mt-2 text-xs text-subtext">
              {botQuizzesPerDay === 0
                ? t("settings.quizOff")
                : t("settings.quizOn", { count: botQuizzesPerDay })}
            </p>
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium">{t("settings.pool")}</p>
          <div className="grid grid-cols-5 gap-2">
            {POOL_PRESETS.map((value) => (
              <button
                key={value}
                onClick={() => setActivePoolLimit(value)}
                className={`rounded-xl px-2 py-3 text-sm font-medium ${
                  value === activePoolLimit ? "bg-accent text-white" : "bg-surface"
                }`}
              >
                {value === 0 ? t("settings.poolUnlimited") : value}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-subtext">
            {activePoolLimit === 0
              ? t("settings.poolNoLimitNote")
              : t("settings.poolLimitNote", { count: activePoolLimit })}
          </p>
        </div>

        {message && <p className="text-sm text-teal">{message}</p>}
        {error && <p className="text-sm text-red-500">{error}</p>}

        <Button onClick={save} disabled={saving || topics.length === 0}>
          {saving ? t("common.saving") : t("settings.saveChanges")}
        </Button>

        <div className="mt-8 border-t border-subtle-light pt-6">
          <Button variant="secondary" className="w-full text-red-500" onClick={resetProgress} disabled={resetting}>
            {resetting ? t("settings.resetting") : t("settings.reset")}
          </Button>
        </div>
      </div>
    </div>
  );
}
