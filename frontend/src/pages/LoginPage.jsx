import { useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Car,
  Eye,
  EyeOff,
  HeartPulse,
  Loader2,
  Lock,
  Mail,
  ShieldAlert,
  User,
  Wind,
} from "lucide-react";
import BrandLogo from "../components/BrandLogo";

const PREVIEW_MODULES = [
  {
    id: "scam",
    label: "Scam",
    title: "Scam Shield",
    icon: ShieldAlert,
    dot: "bg-[#EF4444]",
    activeTab: "bg-[#EF4444]/15 text-red-200 border-[#EF4444]/40",
    pill: "border-[#EF4444]/40 bg-[#EF4444]/15 text-red-200",
    metric: "92%",
    verdict: "Likely scam",
    caption: "“KYC expires · bit.ly/kyc”",
  },
  {
    id: "price",
    label: "Price",
    title: "Fair Price",
    icon: Car,
    dot: "bg-[#F59E0B]",
    activeTab: "bg-[#F59E0B]/15 text-amber-200 border-[#F59E0B]/40",
    pill: "border-[#F59E0B]/40 bg-[#F59E0B]/15 text-amber-200",
    metric: "₹4.85L",
    verdict: "Fair value",
    caption: "2018 Creta · ₹4.4L – ₹5.2L",
  },
  {
    id: "health",
    label: "Health",
    title: "Health Check",
    icon: HeartPulse,
    dot: "bg-[#14B8A6]",
    activeTab: "bg-[#14B8A6]/15 text-teal-200 border-[#14B8A6]/40",
    pill: "border-[#14B8A6]/40 bg-[#14B8A6]/15 text-teal-200",
    metric: "18%",
    verdict: "Low risk",
    caption: "Diabetes · Normal indicators",
  },
  {
    id: "aqi",
    label: "Air",
    title: "Air Aware",
    icon: Wind,
    dot: "bg-[#0EA5E9]",
    activeTab: "bg-[#0EA5E9]/15 text-sky-200 border-[#0EA5E9]/40",
    pill: "border-[#0EA5E9]/40 bg-[#0EA5E9]/15 text-sky-200",
    metric: "68",
    verdict: "Satisfactory",
    caption: "Next-day AQI · Safe outdoors",
  },
];

export default function LoginPage({
  onLogin,
  onRegister,
  loading = false,
  error = "",
}) {
  const [mode, setMode] = useState("login"); // "login" | "register"
  const [activePreview, setActivePreview] = useState("scam");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState("");
  const [externalErrorVisible, setExternalErrorVisible] = useState(Boolean(error));

  useEffect(() => {
    setExternalErrorVisible(Boolean(error));
  }, [error]);

  const displayError = localError || (externalErrorVisible ? error : "");
  const preview =
    PREVIEW_MODULES.find((item) => item.id === activePreview) || PREVIEW_MODULES[0];

  function switchMode(nextMode) {
    setMode(nextMode);
    setLocalError("");
    setExternalErrorVisible(false);
  }

  function clearErrors() {
    if (localError) setLocalError("");
    if (externalErrorVisible) setExternalErrorVisible(false);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setLocalError("");

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setLocalError("Please enter your email address.");
      return;
    }

    if (mode === "register") {
      const trimmedName = name.trim();
      if (trimmedName.length < 2) {
        setLocalError("Please enter your name (at least 2 characters).");
        return;
      }
      if (password.length < 8) {
        setLocalError("Password must be at least 8 characters.");
        return;
      }
      if (typeof onRegister === "function") {
        await onRegister(trimmedName, trimmedEmail, password);
      }
    } else if (typeof onLogin === "function") {
      await onLogin(trimmedEmail, password);
    }
  }

  return (
    <div
      className="relative flex min-h-screen w-full flex-col items-center justify-center overflow-hidden bg-[#070B14] px-4 py-5 text-white sm:px-6 sm:py-6"
      style={{
        backgroundImage:
          "radial-gradient(ellipse 65% 55% at 16% 14%, rgba(59, 63, 216, 0.28), transparent 62%), radial-gradient(ellipse 60% 55% at 84% 86%, rgba(20, 184, 166, 0.20), transparent 62%), radial-gradient(circle at 50% 45%, rgba(30, 58, 138, 0.16), transparent 60%)",
      }}
    >
      <main className="relative z-10 w-full max-w-[440px]">
        {/* Centered brand header */}
        <header className="mb-4 flex flex-col items-center text-center">
          <div className="inline-flex items-center gap-2.5">
            <BrandLogo size={34} />
            <span className="font-display text-xl font-bold tracking-tight text-white">
              LifeGuard <span className="text-[#2DD4BF]">AI</span>
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-300">
            Smart daily checks in one workspace.
          </p>
        </header>

        {/* Centered login card ("login bar") */}
        <section
          aria-label={mode === "login" ? "Sign in" : "Create account"}
          className="rounded-2xl border border-white/15 bg-[#0F172A]/85 p-6 shadow-[0_24px_64px_-16px_rgba(0,0,0,0.75)] ring-1 ring-inset ring-white/5 backdrop-blur-xl"
        >
          <div
            role="tablist"
            aria-label="Account access"
            className="grid grid-cols-2 rounded-xl border border-white/10 bg-[#080D1A]/85 p-1"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === "login"}
              onClick={() => switchMode("login")}
              className={`rounded-lg py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#818CF8] ${
                mode === "login"
                  ? "border border-white/10 bg-[#1E293B] text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "register"}
              onClick={() => switchMode("register")}
              className={`rounded-lg py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#818CF8] ${
                mode === "register"
                  ? "border border-white/10 bg-[#1E293B] text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Create account
            </button>
          </div>

          <h1 className="mt-5 font-display text-2xl font-bold tracking-tight text-white">
            {mode === "login" ? "Welcome back" : "Create account"}
          </h1>

          {displayError && (
            <div
              role="alert"
              className="mt-4 flex items-start gap-2 rounded-xl border border-red-500/35 bg-red-500/15 px-3.5 py-2.5 text-sm text-red-200"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{displayError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            {mode === "register" && (
              <div>
                <label
                  htmlFor="login-name"
                  className="block text-sm font-medium text-slate-200"
                >
                  Full name
                </label>
                <div className="relative mt-1.5">
                  <User
                    className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                    aria-hidden="true"
                  />
                  <input
                    id="login-name"
                    type="text"
                    autoComplete="name"
                    required
                    minLength={2}
                    maxLength={100}
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      clearErrors();
                    }}
                    placeholder="Riya Mehta"
                    className="w-full rounded-[12px] border border-slate-700/80 bg-[#080E1C] py-2.5 pl-10 pr-3.5 text-sm text-white placeholder:text-slate-400 focus:border-[#6366F1] focus:outline-none focus:ring-2 focus:ring-[#3B3FD8]/40"
                  />
                </div>
              </div>
            )}

            <div>
              <label
                htmlFor="login-email"
                className="block text-sm font-medium text-slate-200"
              >
                Email
              </label>
              <div className="relative mt-1.5">
                <Mail
                  className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                  aria-hidden="true"
                />
                <input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    clearErrors();
                  }}
                  placeholder="you@example.com"
                  className="w-full rounded-[12px] border border-slate-700/80 bg-[#080E1C] py-2.5 pl-10 pr-3.5 text-sm text-white placeholder:text-slate-400 focus:border-[#6366F1] focus:outline-none focus:ring-2 focus:ring-[#3B3FD8]/40"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="login-password"
                className="block text-sm font-medium text-slate-200"
              >
                Password
              </label>
              <div className="relative mt-1.5">
                <Lock
                  className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                  aria-hidden="true"
                />
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  required
                  minLength={mode === "register" ? 8 : 1}
                  maxLength={72}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    clearErrors();
                  }}
                  placeholder={
                    mode === "register" ? "8+ characters" : "Enter password"
                  }
                  className="w-full rounded-[12px] border border-slate-700/80 bg-[#080E1C] py-2.5 pl-10 pr-11 text-sm text-white placeholder:text-slate-400 focus:border-[#6366F1] focus:outline-none focus:ring-2 focus:ring-[#3B3FD8]/40"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#818CF8]"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Eye className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-2 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[12px] bg-[#3B3FD8] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_10px_24px_-8px_rgba(59,63,216,0.7)] transition hover:bg-[#494DF0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#818CF8] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0F172A] disabled:cursor-not-allowed disabled:opacity-65"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              )}
              <span>
                {loading
                  ? mode === "login"
                    ? "Signing in..."
                    : "Creating account..."
                  : mode === "login"
                  ? "Sign in"
                  : "Create account"}
              </span>
            </button>
          </form>

          <p className="mt-4 border-t border-white/10 pt-3.5 text-center text-xs text-slate-400">
            Health Check is for awareness only, not medical advice.
          </p>
        </section>

        {/* Compact interactive tool switcher beneath the login card */}
        <section
          aria-label="Live tool preview"
          className="mt-3 rounded-2xl border border-white/10 bg-[#0F172A]/75 p-3 backdrop-blur-md"
        >
          <div className="grid grid-cols-4 gap-1.5" role="tablist" aria-label="Tool preview">
            {PREVIEW_MODULES.map(({ id, label, icon: Icon, activeTab }) => {
              const selected = activePreview === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setActivePreview(id)}
                  className={`inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl border px-1.5 py-1.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#818CF8] ${
                    selected
                      ? activeTab
                      : "border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.08] hover:text-white"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span className="truncate">{label}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-2.5 flex items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-[#080D1A]/75 px-3.5 py-2.5">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 shrink-0 rounded-full ${preview.dot}`} />
                <span className="text-xs font-semibold text-white">{preview.title}</span>
              </div>
              <p className="mt-0.5 truncate text-xs text-slate-300">{preview.caption}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="font-numeric text-base font-bold text-white">
                {preview.metric}
              </span>
              <span
                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${preview.pill}`}
              >
                {preview.verdict}
              </span>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
