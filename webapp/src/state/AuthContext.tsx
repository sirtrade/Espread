import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { retrieveRawInitData } from "@telegram-apps/sdk-react";
import { api, loadStoredToken, setToken } from "../api/client.js";
import type { Profile } from "../api/types.js";
import { t } from "../lib/i18n.js";
import { initialLang } from "../telegram/telegram.js";
import { setTheme } from "../lib/theme.js";
import { setFontSize } from "../lib/fontSize.js";

/** Display prefs live on the profile; sync them into the DOM (and the
 *  localStorage cache used before auth completes) once the profile arrives. */
function applyDisplayPrefs(p: Profile): void {
  if (p.theme) setTheme(p.theme);
  if (p.fontSize) setFontSize(p.fontSize);
}

interface AuthState {
  profile: Profile | null;
  loading: boolean;
  error: string | null;
  setProfile: (p: Profile) => void;
  retry: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      setLoading(true);
      setError(null);
      try {
        const stored = loadStoredToken();
        if (stored) {
          setToken(stored);
          try {
            const me = await api.getMe();
            if (!cancelled) {
              setProfile(me);
              applyDisplayPrefs(me);
            }
            return;
          } catch {
            setToken(null);
          }
        }

        let rawInitData: string | undefined;
        try {
          rawInitData = retrieveRawInitData();
        } catch {
          rawInitData = undefined;
        }
        if (!rawInitData) {
          throw new Error(t(initialLang(), "auth.noSession"));
        }
        const { token, profile: fresh } = await api.authTelegram(rawInitData);
        setToken(token);
        if (!cancelled) {
          setProfile(fresh);
          applyDisplayPrefs(fresh);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : t(initialLang(), "auth.failed"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    boot();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  return (
    <AuthContext.Provider
      value={{ profile, loading, error, setProfile, retry: () => setAttempt((a) => a + 1) }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
