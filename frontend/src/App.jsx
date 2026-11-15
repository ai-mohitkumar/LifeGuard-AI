import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import Navbar from "./components/Navbar";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import AirAwarePage from "./pages/AirAwarePage";
import DashboardPage from "./pages/DashboardPage";
import FairPricePage from "./pages/FairPricePage";
import HealthCheckPage from "./pages/HealthCheckPage";
import HistoryPage from "./pages/HistoryPage";
import LoginPage from "./pages/LoginPage";
import ModelRegistryPage from "./pages/ModelRegistryPage";
import ScamShieldPage from "./pages/ScamShieldPage";

function ProtectedLayout({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-brand-offwhite text-sm text-slate-500 dark:bg-brand-navy dark:text-slate-400">
        Verifying session...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen bg-brand-offwhite transition-colors duration-200 dark:bg-brand-navy">
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}

function PublicOnlyLogin() {
  const { user, loading, login, register, googleLogin } = useAuth();
  const navigate = useNavigate();
  const [authError, setAuthError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("auth_error");
    if (err) {
      setAuthError(decodeURIComponent(err));
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  if (loading) return null;
  if (user) return <Navigate to="/" replace />;

  async function handleLogin(email, password) {
    setAuthError("");
    setSubmitting(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      setAuthError(err.message || "Authentication failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRegister(name, email, password, confirmPassword) {
    setAuthError("");
    setSubmitting(true);
    try {
      await register(name, email, password, confirmPassword);
      navigate("/");
    } catch (err) {
      setAuthError(err.message || "Could not create account. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGoogleLogin(idToken) {
    setAuthError("");
    setSubmitting(true);
    try {
      await googleLogin(idToken);
      navigate("/");
    } catch (err) {
      setAuthError(err.message || "Google authentication failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <LoginPage
      onLogin={handleLogin}
      onRegister={handleRegister}
      onGoogleLogin={handleGoogleLogin}
      loading={submitting}
      error={authError}
    />
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
          <Route path="/login" element={<PublicOnlyLogin />} />

          <Route
            path="/"
            element={
              <ProtectedLayout>
                <DashboardPage />
              </ProtectedLayout>
            }
          />

          <Route
            path="/scam"
            element={
              <ProtectedLayout>
                <ScamShieldPage />
              </ProtectedLayout>
            }
          />

          <Route
            path="/price"
            element={
              <ProtectedLayout>
                <FairPricePage />
              </ProtectedLayout>
            }
          />

          <Route
            path="/health"
            element={
              <ProtectedLayout>
                <HealthCheckPage />
              </ProtectedLayout>
            }
          />

          <Route
            path="/aqi"
            element={
              <ProtectedLayout>
                <AirAwarePage />
              </ProtectedLayout>
            }
          />

          <Route
            path="/history"
            element={
              <ProtectedLayout>
                <HistoryPage />
              </ProtectedLayout>
            }
          />

          <Route
            path="/registry"
            element={
              <ProtectedLayout>
                <ModelRegistryPage />
              </ProtectedLayout>
            }
          />

          <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
