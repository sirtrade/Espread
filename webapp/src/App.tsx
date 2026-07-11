import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./state/AuthContext.js";
import { Spinner } from "./components/Spinner.js";
import { ErrorState } from "./components/ErrorState.js";
import { Onboarding } from "./screens/Onboarding.js";
import { Home } from "./screens/Home.js";
import { Reading } from "./screens/Reading.js";
import { Review } from "./screens/Review.js";
import { Settings } from "./screens/Settings.js";

function Gate() {
  const { profile, loading, error, retry } = useAuth();

  if (loading) return <Spinner label="Conectando con Telegram..." />;
  if (error) return <ErrorState message={error} onRetry={retry} />;
  if (!profile) return null;
  if (!profile.onboarded) return <Onboarding />;

  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/read" element={<Reading />} />
      <Route path="/review" element={<Review />} />
      <Route path="/settings" element={<Settings />} />
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
