import { useState } from "react";
import { api } from "../api/client.js";
import { useAuth } from "../state/AuthContext.js";
import { useT } from "../lib/i18n.js";
import { Button } from "./Button.js";

/**
 * Soft "remove topic X from your interests?" banner (F-19), shown on Home
 * after repeated "not interested" skips of one topic. The topic is never
 * removed automatically: "remove" goes through the ordinary profile topics
 * update, "keep" records a dismissal so the suggestion stays away until
 * enough new skips accumulate.
 */
export function TopicSuggestionBanner({
  topic,
  onResolved,
}: Readonly<{
  topic: string;
  onResolved: () => void;
}>) {
  const { t } = useT();
  const { profile, setProfile } = useAuth();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function removeTopic() {
    setSaving(true);
    setError(null);
    try {
      const topics = (profile?.topics ?? []).filter((item) => item !== topic);
      if (profile && topics.length !== profile.topics.length) {
        const updated = await api.patchMe({ topics });
        setProfile(updated);
      }
      onResolved();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("topicSuggestion.error"));
      setSaving(false);
    }
  }

  async function keepTopic() {
    setSaving(true);
    setError(null);
    try {
      await api.dismissTopicSuggestion(topic);
      onResolved();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("topicSuggestion.error"));
      setSaving(false);
    }
  }

  return (
    <section className="mb-4 rounded-2xl bg-surface px-4 py-4" aria-live="polite">
      <p className="text-sm font-medium">{t("topicSuggestion.title", { topic })}</p>
      <div className="mt-3 flex gap-2">
        <Button className="flex-1" onClick={removeTopic} disabled={saving}>
          {t("topicSuggestion.remove")}
        </Button>
        <Button className="flex-1" variant="secondary" onClick={keepTopic} disabled={saving}>
          {t("topicSuggestion.keep")}
        </Button>
      </div>
      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
    </section>
  );
}
