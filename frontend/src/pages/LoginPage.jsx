import { useEffect, useRef, useState } from "react";
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
  X,
  Zap,
} from "lucide-react";
import BrandLogo from "../components/BrandLogo";

function GoogleIcon({ className = "h-4 w-4" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.66v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.15z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.26v3.15C3.25 21.37 7.31 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.27a7.2 7.2 0 0 1 0-4.54V6.58H1.26a11.96 11.96 0 0 0 0 10.84l4.02-3.15z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.25 2.63 1.26 6.58l4.02 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
      />
    </svg>
  );
}

function GitHubIcon({ className = "h-4 w-4" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
      />
    </svg>
  );
}

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
  onGoogleLogin,
  onSocialLogin,
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

  // Google Identity Services (GIS) States
  const googleBtnContainerRef = useRef(null);
  const [googleReady, setGoogleReady] = useState(false);
  const [googleAuthenticating, setGoogleAuthenticating] = useState(false);

  const GOOGLE_CLIENT_ID =
    import.meta.env.VITE_GOOGLE_CLIENT_ID ||
    "981860772372-uvhn6fnfkfhpfskar3bk1i7de4fsp3b9.apps.googleusercontent.com";

  // Social SSO Modal & Selection States
  const [socialModal, setSocialModal] = useState(null); // null | "github" | "google"
  const [customSocialEmail, setCustomSocialEmail] = useState("");
  const [customSocialName, setCustomSocialName] = useState("");
  const [socialSubmitting, setSocialSubmitting] = useState(false);

  useEffect(() => {
    setExternalErrorVisible(Boolean(error));
  }, [error]);

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === "Escape" && socialModal) {
        setSocialModal(null);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [socialModal]);

  // Initialize and render official Google Identity Services button
  useEffect(() => {
    let isMounted = true;

    function renderGsiButton() {
      if (!window.google?.accounts?.id || !googleBtnContainerRef.current) return false;

      try {
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: async (response) => {
            if (!response?.credential) {
              setLocalError("Google sign-in did not return a valid credential.");
              return;
            }
            clearErrors();
            setGoogleAuthenticating(true);
            try {
              if (typeof onGoogleLogin === "function") {
                await onGoogleLogin(response.credential);
              }
            } catch (err) {
              setLocalError(err.message || "Failed to authenticate with Google.");
            } finally {
              if (isMounted) setGoogleAuthenticating(false);
            }
          },
          auto_select: false,
          cancel_on_tap_outside: true,
        });

        googleBtnContainerRef.current.innerHTML = "";
        window.google.accounts.id.renderButton(googleBtnContainerRef.current, {
          type: "standard",
          theme: "filled_black",
          size: "large",
          text: mode === "register" ? "signup_with" : "continue_with",
          shape: "rectangular",
          logo_alignment: "left",
          width: 240,
        });

        if (isMounted) setGoogleReady(true);
        return true;
      } catch (err) {
        console.warn("Failed to initialize Google Identity Services:", err);
        return false;
      }
    }

    if (!renderGsiButton()) {
      const interval = setInterval(() => {
        if (renderGsiButton()) {
          clearInterval(interval);
        }
      }, 200);
      return () => {
        isMounted = false;
        clearInterval(interval);
      };
    }

    return () => {
      isMounted = false;
    };
  }, [onGoogleLogin, mode, GOOGLE_CLIENT_ID]);

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

  async function handleExecuteSocial(provider, targetEmail, targetName) {
    const cleanEmail = (targetEmail || "").trim();
    if (!cleanEmail) {
      setLocalError(`Please provide a valid ${provider === "google" ? "Google" : "GitHub"} email.`);
      return;
    }
    clearErrors();
    setSocialSubmitting(true);
    try {
      if (typeof onSocialLogin === "function") {
        await onSocialLogin(provider, cleanEmail, targetName || cleanEmail.split("@")[0]);
        setSocialModal(null);
      }
    } catch (err) {
      setLocalError(err.message || `Failed to sign in with ${provider}.`);
    } finally {
      setSocialSubmitting(false);
    }
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

            {/* Enterprise SSO Social Sign-In Buttons */}
            <div className="mt-5 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 items-center">
                {/* Official Google Identity Services Button Container */}
                <div className="relative flex min-h-[42px] items-center justify-center overflow-hidden rounded-xl border border-slate-700/80 bg-[#070D1A]/90 p-0.5 shadow-sm transition hover:border-slate-500">
                  <div
                    ref={googleBtnContainerRef}
                    id="google-signin-btn-container"
                    className="w-full flex items-center justify-center"
                  />
                  {(!googleReady || googleAuthenticating) && (
                    <button
                      type="button"
                      onClick={() => {
                        clearErrors();
                        if (window.google?.accounts?.id) {
                          window.google.accounts.id.prompt();
                        } else {
                          setLocalError("Google Identity Services is initializing. Please check your network or browser settings.");
                        }
                      }}
                      disabled={loading || googleAuthenticating}
                      className="group absolute inset-0 flex items-center justify-center gap-2.5 bg-[#070D1A] px-4 py-2.5 text-xs sm:text-sm font-semibold text-slate-200 transition hover:bg-[#0E172A] hover:text-white disabled:opacity-60"
                    >
                      {googleAuthenticating ? (
                        <Loader2 className="h-4 w-4 animate-spin text-indigo-400" />
                      ) : (
                        <GoogleIcon className="h-4 w-4 shrink-0 transition-transform group-hover:scale-110" />
                      )}
                      <span>
                        {googleAuthenticating
                          ? "Verifying Token..."
                          : mode === "register"
                          ? "Sign up with Google"
                          : "Continue with Google"}
                      </span>
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setSocialModal("github");
                    setCustomSocialEmail("");
                    setCustomSocialName("");
                    clearErrors();
                  }}
                  disabled={loading || socialSubmitting || googleAuthenticating}
                  className="group flex min-h-[42px] items-center justify-center gap-2.5 rounded-xl border border-slate-700/80 bg-[#070D1A]/90 px-4 py-2.5 text-xs sm:text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:bg-[#0E172A] hover:text-white focus:outline-none focus:ring-2 focus:ring-indigo-400/40 disabled:opacity-50 shadow-sm"
                >
                  <GitHubIcon className="h-4 w-4 shrink-0 transition-transform group-hover:scale-110" />
                  <span>Continue with GitHub</span>
                </button>
              </div>

              {/* Enterprise SSO Divider */}
              <div className="relative flex items-center justify-center pt-1 pb-0.5">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-800" />
                </div>
                <div className="relative bg-[#0B1222] px-3 text-[11px] font-medium uppercase tracking-wider text-slate-400">
                  Or continue with work email
                </div>
              </div>
            </div>

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

      {/* Social SSO Account Picker Modal */}
      {socialModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="social-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
          onClick={() => !socialSubmitting && setSocialModal(null)}
        >
          <div
            className="relative w-full max-w-md rounded-3xl border border-slate-700/80 bg-[#0B1222] p-6 shadow-[0_24px_64px_-16px_rgba(0,0,0,0.95)] ring-1 ring-white/10 sm:p-7"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Close Button */}
            <button
              type="button"
              aria-label="Close dialog"
              disabled={socialSubmitting}
              onClick={() => setSocialModal(null)}
              className="absolute right-5 top-5 inline-flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-white/10 hover:text-white transition disabled:opacity-50"
            >
              <X className="h-4 w-4" />
            </button>

            {/* Modal Header */}
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 shadow-inner">
                {socialModal === "google" ? (
                  <GoogleIcon className="h-6 w-6" />
                ) : (
                  <GitHubIcon className="h-6 w-6 text-white" />
                )}
              </div>
              <div>
                <h2 id="social-modal-title" className="font-display text-lg font-bold text-white">
                  {socialModal === "google" ? "Continue with Google" : "Continue with GitHub"}
                </h2>
                <p className="text-xs text-slate-400">
                  Enterprise Single Sign-On for LifeGuard AI
                </p>
              </div>
            </div>

            {/* Error in modal if any */}
            {localError && (
              <div
                role="alert"
                className="mt-4 flex items-start gap-2 rounded-xl border border-red-500/35 bg-red-500/15 p-2.5 text-xs text-red-200"
              >
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />
                <span>{localError}</span>
              </div>
            )}

            {/* Quick 1-Click Profile Card */}
            <div className="mt-5">
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Fast Access Account (1-Click)
              </label>
              <button
                type="button"
                disabled={socialSubmitting}
                onClick={() =>
                  handleExecuteSocial(
                    socialModal,
                    socialModal === "google"
                      ? "mohit.kumar@gmail.com"
                      : "ai-mohitkumar@github.com",
                    socialModal === "google" ? "Mohit Kumar" : "Mohit Kumar (@ai-mohitkumar)"
                  )
                }
                className="mt-2 group flex w-full items-center justify-between gap-3 rounded-2xl border border-indigo-500/30 bg-indigo-500/10 p-3.5 text-left transition hover:border-indigo-400 hover:bg-indigo-500/20 focus:outline-none focus:ring-2 focus:ring-indigo-400/50 disabled:opacity-50"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-indigo-600 to-teal-400 font-bold text-white shadow-sm">
                    {socialModal === "google" ? "G" : "GH"}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-white">
                        {socialModal === "google" ? "Mohit Kumar" : "Mohit Kumar (@ai-mohitkumar)"}
                      </span>
                      <span className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-[10px] font-semibold text-indigo-300">
                        1-Click
                      </span>
                    </div>
                    <p className="truncate text-xs text-slate-300">
                      {socialModal === "google"
                        ? "mohit.kumar@gmail.com"
                        : "ai-mohitkumar@github.com"}
                    </p>
                  </div>
                </div>
                {socialSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin text-indigo-400 shrink-0" />
                ) : (
                  <ArrowRight className="h-4 w-4 text-indigo-400 transition-transform group-hover:translate-x-1 shrink-0" />
                )}
              </button>
            </div>

            {/* Divider */}
            <div className="relative my-4 flex items-center justify-center">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-700/60" />
              </div>
              <div className="relative bg-[#0B1222] px-3 text-[11px] uppercase tracking-wider text-slate-500">
                Or use your personal account
              </div>
            </div>

            {/* Custom Account Input Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleExecuteSocial(
                  socialModal,
                  customSocialEmail,
                  customSocialName || (customSocialEmail.split("@")[0] || "User")
                );
              }}
              className="space-y-3"
            >
              <div>
                <label
                  htmlFor="social-email-input"
                  className="block text-xs font-medium text-slate-300"
                >
                  {socialModal === "google"
                    ? "Google Email Address"
                    : "GitHub Username or Email"}
                </label>
                <div className="relative mt-1">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    id="social-email-input"
                    type={socialModal === "google" ? "email" : "text"}
                    required
                    disabled={socialSubmitting}
                    value={customSocialEmail}
                    onChange={(e) => setCustomSocialEmail(e.target.value)}
                    placeholder={
                      socialModal === "google"
                        ? "your.email@gmail.com"
                        : "github_username or user@github.com"
                    }
                    className="w-full rounded-xl border border-slate-700/80 bg-[#070D1A] py-2 pl-9 pr-3 text-xs sm:text-sm text-white placeholder:text-slate-500 focus:border-brand-indigo focus:outline-none focus:ring-2 focus:ring-brand-indigo/30"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="social-name-input"
                  className="block text-xs font-medium text-slate-300"
                >
                  Full Name (Optional)
                </label>
                <div className="relative mt-1">
                  <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    id="social-name-input"
                    type="text"
                    disabled={socialSubmitting}
                    value={customSocialName}
                    onChange={(e) => setCustomSocialName(e.target.value)}
                    placeholder="e.g. Alex Morgan"
                    className="w-full rounded-xl border border-slate-700/80 bg-[#070D1A] py-2 pl-9 pr-3 text-xs sm:text-sm text-white placeholder:text-slate-500 focus:border-brand-indigo focus:outline-none focus:ring-2 focus:ring-brand-indigo/30"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={socialSubmitting || !customSocialEmail.trim()}
                className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-indigo-600 py-2.5 text-xs sm:text-sm font-semibold text-white shadow-md transition hover:from-indigo-500 hover:to-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-50"
              >
                {socialSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ShieldCheck className="h-4 w-4" />
                )}
                <span>
                  {socialSubmitting
                    ? "Authenticating Session..."
                    : `Sign In with ${socialModal === "google" ? "Google" : "GitHub"}`}
                </span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
