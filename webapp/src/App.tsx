import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./state/AuthContext.js";
import { Spinner } from "./components/Spinner.js";
import { ErrorState } from "./components/ErrorState.js";
import { Onboarding } from "./screens/Onboarding.js";
import { Home } from "./screens/Home.js";
import { Reading } from "./screens/Reading.js";
import { Review } from "./screens/Review.js";
import { Settings } from "./screens/Settings.js";
import { Bank } from "./screens/Bank.js";
import { History } from "./screens/History.js";
import { HistoryArticle } from "./screens/HistoryArticle.js";
import { Quiz } from "./screens/Quiz.js";
import { Practice } from "./screens/Practice.js";
import { t } from "./lib/i18n.js";
import { initialLang } from "./telegram/telegram.js";

function Gate() {
  const { profile, loading, error, retry } = useAuth();
  const lang = profile?.explainLang ?? initialLang();

  if (loading) return <Spinner label={t(lang, "gate.connecting")} />;
  if (error) return <ErrorState message={error} onRetry={retry} />;
  if (!profile) return null;
  if (!profile.onboarded) return <Onboarding />;

  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/read" element={<Reading />} />
      <Route path="/review" element={<Review />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="/bank" element={<Bank />} />
      <Route path="/history" element={<History />} />
      <Route path="/history/:id" element={<HistoryArticle />} />
      <Route path="/quiz" element={<Quiz />} />
      <Route path="/practice" element={<Practice />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Gate />
      </BrowserRouter>
    </AuthProvider>
  );
}
