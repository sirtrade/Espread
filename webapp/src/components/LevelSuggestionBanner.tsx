import { useEffect, useRef, useState } from "react";
import { api } from "../api/client.js";
import type { LevelSuggestion } from "../api/types.js";
import { useAuth } from "../state/AuthContext.js";
import { useT } from "../lib/i18n.js";
import { Button } from "./Button.js";

export function LevelSuggestionBanner({
  suggestion,
  onResolved,
}: Readonly<{
  suggestion: LevelSuggestion;
  onResolved: () => void;
}>) {
  const { t } = useT();
  const { setProfile } = useAuth();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reported = useRef(false);

  useEffect(() => {
    if (reported.current) return;
    reported.current = true;
    api.markLevelSuggestion({ ...suggestion, action: "seen" }).catch(() => {
      // The banner is already visible. A stale/racing acknowledgement should
      // not make it disappear; the next server evaluation resolves the state.
    });
  }, [suggestion]);

  async function changeLevel() {
    setSaving(true);
    setError(null);
    try {
      const profile = await api.patchMe({ level: suggestion.targetLevel });
      setProfile(profile);
      onResolved();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("levelSuggestion.error"));
      setSaving(false);
    }
  }

  async function keepLevel() {
    setSaving(true);
    setError(null);
    try {
      await api.markLevelSuggestion({ ...suggestion, action: "dismissed" });
      onResolved();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("levelSuggestion.error"));
      setSaving(false);
    }
  }

  return (
    <section className="mb-4 rounded-2xl bg-surface px-4 py-4" aria-live="polite">
      <p className="text-sm font-medium">
        {suggestion.direction === "up"
          ? t("levelSuggestion.up", { level: suggestion.targetLevel })
          : t("levelSuggestion.down", { level: suggestion.targetLevel })}
      </p>
      <div className="mt-3 flex gap-2">
        <Button className="flex-1" onClick={changeLevel} disabled={saving}>
          {t("levelSuggestion.change", { level: suggestion.targetLevel })}
        </Button>
        <Button className="flex-1" variant="secondary" onClick={keepLevel} disabled={saving}>
          {t("levelSuggestion.keep")}
        </Button>
      </div>
      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
    </section>
  );
}
