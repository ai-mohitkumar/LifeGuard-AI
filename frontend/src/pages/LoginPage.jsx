import { useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Car,
  CheckCircle2,
  Cpu,
  Eye,
  EyeOff,
  HeartPulse,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  User,
  Wind,
  Zap,
} from "lucide-react";
import BrandLogo from "../components/BrandLogo";

const TELEMETRY_MODULES = [
  {
    id: "scam",
    name: "Scam Shield",
    badge: "Active",
    badgeColor: "bg-red-500/10 text-red-300 border-red-500/30",
    dot: "bg-red-400",
    metric: "99.8% Prec",
    desc: "Smishing & zero-day phishing guard",
    icon: ShieldAlert,
  },
  {
    id: "price",
    name: "Fair Price",
    badge: "Calibrated",
    badgeColor: "bg-amber-500/10 text-amber-300 border-amber-500/30",
    dot: "bg-amber-400",
    metric: "SHAP Drivers",
    desc: "Resale valuation & anomaly filter",
    icon: Car,
  },
  {
    id: "health",
    name: "Health Check",
    badge: "Verified",
    badgeColor: "bg-teal-500/10 text-teal-300 border-teal-500/30",
    dot: "bg-teal-400",
    metric: "Brier 0.12",
    desc: "Preventive screening risk radar",
    icon: HeartPulse,
  },
  {
    id: "aqi",
    name: "Air Aware",
    badge: "Live Feed",
    badgeColor: "bg-sky-500/10 text-sky-300 border-sky-500/30",
    dot: "bg-sky-400",
    metric: "546 Stations",
    desc: "24h national atmospheric forecast",
    icon: Wind,
  },
];

export default function LoginPage({
  onLogin,
  onRegister,
  loading = false,
  error = "",
}) {
  const [mode, setMode] = useState("login"); // "login" | "register"
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState("");
  const [externalErrorVisible, setExternalErrorVisible] = useState(Boolean(error));

  useEffect(() => {
    setExternalErrorVisible(Boolean(error));
  }, [error]);

  const displayError = localError || (externalErrorVisible ? error : "");

  function switchMode(nextMode) {
    setMode(nextMode);
    setLocalError("");
    setExternalErrorVisible(false);
  }

  function clearErrors() {
    if (localError) setLocalError("");
    if (externalErrorVisible) setExternalErrorVisible(false);
  }

  function handleDemoFill() {
    setEmail("mohit@lifeguard.ai");
    setPassword("Enterprise@2026");
    setName("Mohit Kumar");
    clearErrors();
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setLocalError("");

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setLocalError("Please enter your work email address.");
      return;
    }

    if (mode === "register") {
      const trimmedName = name.trim();
      if (trimmedName.length < 2) {
        setLocalError("Please enter your full name (at least 2 characters).");
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
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-x-hidden bg-[#060911] px-4 py-8 text-white selection:bg-brand-indigo selection:text-white sm:px-6 lg:px-8">
      {/* Background Cyber Mesh & Radial Glows */}
      <div
        className="pointer-events-none absolute inset-0 z-0 opacity-70"
        style={{
          backgroundImage:
            "radial-gradient(circle at 18% 22%, rgba(79, 70, 229, 0.22), transparent 45%), radial-gradient(circle at 82% 78%, rgba(20, 184, 166, 0.16), transparent 48%), radial-gradient(circle at 50% 50%, rgba(15, 23, 42, 0.9), transparent 80%)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 z-0 bg-[linear-gradient(to_right,#1e293b12_1px,transparent_1px),linear-gradient(to_bottom,#1e293b12_1px,transparent_1px)] bg-[size:32px_32px] opacity-40 [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)]"
      />

      {/* Main Enterprise Container */}
      <main className="relative z-10 w-full max-w-5xl">
        <div className="grid items-center gap-8 lg:grid-cols-12 lg:gap-10">
          {/* Left Column: Enterprise Sign-In Card (7 cols) */}
          <section
            aria-label="Enterprise Sign-In"
            className="rounded-3xl border border-slate-700/60 bg-[#0B1222]/90 p-6 shadow-[0_24px_64px_-16px_rgba(0,0,0,0.85)] ring-1 ring-white/5 backdrop-blur-2xl sm:p-8 lg:col-span-7"
          >
            {/* Top Brand & Security Tag */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-5">
              <div className="flex items-center gap-2.5">
                <BrandLogo size={32} />
                <span className="font-display text-lg font-bold tracking-tight text-white sm:text-xl">
                  LifeGuard <span className="text-brand-indigo-light">AI</span>
                </span>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                <span>Zero-Trust Security</span>
              </div>
            </div>

            {/* Title & Mode Switcher */}
            <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">
                  {mode === "login" ? "Enterprise Sign-In" : "Create Account"}
                </h1>
                <p className="mt-1 text-xs text-slate-300 sm:text-sm">
                  {mode === "login"
                    ? "Access your verified AI decision console."
                    : "Register to deploy supervised AI guardrails."}
                </p>
              </div>

              {/* Segmented Auth Switcher */}
              <div
                role="tablist"
                aria-label="Authentication Type"
                className="inline-flex rounded-xl border border-white/10 bg-[#050811] p-1 self-start sm:self-auto"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === "login"}
                  onClick={() => switchMode("login")}
                  className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
                    mode === "login"
                      ? "bg-brand-indigo text-white shadow-sm"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === "register"}
                  onClick={() => switchMode("register")}
                  className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
                    mode === "register"
                      ? "bg-brand-indigo text-white shadow-sm"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Register
                </button>
              </div>
            </div>

            {/* Error Banner */}
            {displayError && (
              <div
                role="alert"
                className="mt-4 flex items-start gap-2.5 rounded-xl border border-red-500/35 bg-red-500/15 p-3 text-xs text-red-200"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                <span>{displayError}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              {mode === "register" && (
                <div>
                  <label
                    htmlFor="login-name"
                    className="block text-xs font-semibold uppercase tracking-wider text-slate-300"
                  >
                    Full Name
                  </label>
                  <div className="relative mt-1.5">
                    <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
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
                      placeholder="Mohit Kumar"
                      className="w-full rounded-xl border border-slate-700/80 bg-[#070D1A] py-2.5 pl-10 pr-3.5 text-sm text-white placeholder:text-slate-500 focus:border-brand-indigo focus:outline-none focus:ring-2 focus:ring-brand-indigo/30"
                    />
                  </div>
                </div>
              )}

              <div>
                <label
                  htmlFor="login-email"
                  className="block text-xs font-semibold uppercase tracking-wider text-slate-300"
                >
                  Work Email
                </label>
                <div className="relative mt-1.5">
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
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
                    placeholder="user@enterprise.com"
                    className="w-full rounded-xl border border-slate-700/80 bg-[#070D1A] py-2.5 pl-10 pr-3.5 text-sm text-white placeholder:text-slate-500 focus:border-brand-indigo focus:outline-none focus:ring-2 focus:ring-brand-indigo/30"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="login-password"
                    className="block text-xs font-semibold uppercase tracking-wider text-slate-300"
                  >
                    Master Password
                  </label>
                  {mode === "login" && (
                    <span className="text-xs text-slate-400 hover:text-slate-200 cursor-pointer">
                      Forgot?
                    </span>
                  )}
                </div>
                <div className="relative mt-1.5">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
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
                    placeholder={mode === "register" ? "8+ characters required" : "Enter password"}
                    className="w-full rounded-xl border border-slate-700/80 bg-[#070D1A] py-2.5 pl-10 pr-11 text-sm text-white placeholder:text-slate-500 focus:border-brand-indigo focus:outline-none focus:ring-2 focus:ring-brand-indigo/30"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Remember Me & Demo Fill */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
                <label className="flex items-center gap-2 cursor-pointer text-slate-300 select-none">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-700 bg-[#070D1A] text-brand-indigo focus:ring-0"
                  />
                  <span>Trust this terminal</span>
                </label>

                <button
                  type="button"
                  onClick={handleDemoFill}
                  className="inline-flex items-center gap-1 font-semibold text-brand-teal hover:underline"
                >
                  <Sparkles className="h-3 w-3" />
                  Fill Demo
                </button>
              </div>

              {/* Submit CTA */}
              <button
                type="submit"
                disabled={loading}
                className="mt-2 inline-flex min-h-[46px] w-full items-center justify-center gap-2.5 rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_28px_-6px_rgba(99,102,241,0.65)] transition hover:from-indigo-500 hover:to-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-400/50 disabled:opacity-60"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ShieldCheck className="h-4 w-4" />
                )}
                <span>
                  {loading
                    ? mode === "login"
                      ? "Verifying Session..."
                      : "Registering..."
                    : mode === "login"
                    ? "Sign In to Platform"
                    : "Create Workspace Account"}
                </span>
                {!loading && <ArrowRight className="h-4 w-4 opacity-70" />}
              </button>
            </form>

            {/* Compliance Footer */}
            <div className="mt-6 flex flex-wrap items-center justify-center gap-4 border-t border-white/10 pt-4 text-[11px] text-slate-400">
              <span className="flex items-center gap-1.5">
                <KeyRound className="h-3.5 w-3.5 text-slate-400" />
                256-Bit Encrypted
              </span>
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                SOC-2 Ready
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-teal-400" />
                TLS 1.3 Strict
              </span>
            </div>
          </section>

          {/* Right Column: Cyber Threat Telemetry & Guardrails Showcase (5 cols) */}
          <section
            aria-label="Security Telemetry Showcase"
            className="flex flex-col justify-between space-y-4 rounded-3xl border border-slate-700/60 bg-[#090F1C]/80 p-6 shadow-2xl backdrop-blur-xl lg:col-span-5"
          >
            {/* Telemetry Header */}
            <div>
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-brand-indigo-light">
                  <Cpu className="h-3.5 w-3.5" />
                  Live Platform Guardrails
                </span>
                <span className="font-numeric rounded-full border border-slate-700 bg-slate-800/80 px-2 py-0.5 text-[10px] font-semibold text-slate-300">
                  v0.2.0
                </span>
              </div>
              <h2 className="mt-2 font-display text-lg font-bold text-white">
                Deterministic Security Radar
              </h2>
              <p className="text-xs text-slate-300">
                Four supervised learning pipelines monitoring threats in real time.
              </p>
            </div>

            {/* 4 Telemetry Modules Grid */}
            <div className="space-y-2.5">
              {TELEMETRY_MODULES.map((mod) => {
                const Icon = mod.icon;
                return (
                  <div
                    key={mod.id}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-white/[0.08] bg-[#050914]/80 p-3 transition hover:border-white/20"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5">
                        <Icon className="h-4 w-4 text-white" />
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className={`h-1.5 w-1.5 rounded-full ${mod.dot}`} />
                          <span className="truncate text-xs font-semibold text-white">
                            {mod.name}
                          </span>
                        </div>
                        <p className="truncate text-[11px] text-slate-400">{mod.desc}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="font-numeric block text-xs font-bold text-white">
                        {mod.metric}
                      </span>
                      <span
                        className={`inline-block rounded-full border px-1.5 py-0.2 text-[9px] font-semibold uppercase ${mod.badgeColor}`}
                      >
                        {mod.badge}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Enterprise Security Banner */}
            <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/10 p-3.5 text-xs text-slate-300">
              <div className="flex items-center gap-1.5 font-semibold text-indigo-300">
                <Zap className="h-3.5 w-3.5 text-indigo-400" />
                Zero-Telemetry Leaks
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-300">
                Local isolation ensures private models never share user queries with external models or third parties.
              </p>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
