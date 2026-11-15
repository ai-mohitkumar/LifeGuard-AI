import { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  Car,
  Database,
  HeartPulse,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  ShieldAlert,
  Sun,
  Wind,
  X,
} from "lucide-react";
import { authApi } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import BrandLogo from "./BrandLogo";

const NAV_ITEMS = [
  { to: "/", label: "Overview", icon: LayoutDashboard },
  { to: "/scam", label: "Scam Shield", icon: ShieldAlert },
  { to: "/price", label: "Fair Price", icon: Car },
  { to: "/health", label: "Health Check", icon: HeartPulse },
  { to: "/aqi", label: "Air Aware", icon: Wind },
  { to: "/history", label: "History", icon: History },
  { to: "/registry", label: "Models", icon: Database },
];

export default function Navbar() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [apiStatus, setApiStatus] = useState("checking");

  useEffect(() => {
    let active = true;
    authApi
      .health()
      .then((res) => {
        if (active) {
          setApiStatus(res && res.database === "connected" ? "online" : "degraded");
        }
      })
      .catch(() => {
        if (active) setApiStatus("offline");
      });
    return () => {
      active = false;
    };
  }, []);

  function handleLogout() {
    logout();
    setMobileOpen(false);
    navigate("/login");
  }

  const statusStyles = {
    online:
      "bg-green-50 text-verdict-safe-ink border-green-200 dark:bg-green-950/40 dark:text-green-300 dark:border-green-800/60",
    degraded:
      "bg-amber-50 text-verdict-warn-ink border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60",
    offline:
      "bg-red-50 text-verdict-danger-ink border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800/60",
    checking:
      "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
  };

  const statusLabel = {
    online: "Online",
    degraded: "Degraded",
    offline: "Offline",
    checking: "Checking...",
  };

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur transition-colors dark:border-slate-800 dark:bg-brand-navy/95">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
        {/* Brand */}
        <NavLink
          to="/"
          className="flex shrink-0 items-center gap-2 pr-1 font-semibold text-brand-navy dark:text-brand-offwhite"
        >
          <BrandLogo size={32} className="shrink-0" />
          <span className="font-display text-base font-bold tracking-tight">
            LifeGuard <span className="text-brand-indigo dark:text-brand-indigo-light">AI</span>
          </span>
        </NavLink>

        {/* Desktop navigation */}
        <nav className="hidden min-w-0 items-center gap-0.5 lg:flex">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-1.5 whitespace-nowrap rounded-xl px-2 py-1.5 text-xs font-medium transition xl:px-2.5 xl:text-[13px] ${
                  isActive
                    ? "bg-brand-indigo/10 text-brand-indigo dark:bg-brand-indigo-light/15 dark:text-brand-indigo-light"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                }`
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Right controls */}
        <div className="hidden shrink-0 items-center gap-2 lg:flex">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-brand-surface dark:text-slate-300 dark:hover:bg-slate-700"
          >
            {theme === "dark" ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4" />}
          </button>

          <span
            className={`hidden items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium xl:inline-flex ${statusStyles[apiStatus]}`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                apiStatus === "online"
                  ? "bg-verdict-safe"
                  : apiStatus === "offline"
                  ? "bg-verdict-danger"
                  : "bg-verdict-warn"
              }`}
            />
            {statusLabel[apiStatus]}
          </span>

          {user && (
            <div className="flex items-center gap-2 border-l border-slate-200 pl-2.5 dark:border-slate-700">
              <span
                title={user.email}
                className="hidden max-w-[100px] truncate text-xs font-semibold text-slate-800 dark:text-slate-100 2xl:block"
              >
                {user.full_name}
              </span>
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex min-h-[36px] items-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign out
              </button>
            </div>
          )}
        </div>

        {/* Mobile menu & theme toggle */}
        <div className="flex items-center gap-2 lg:hidden">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {theme === "dark" ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={() => setMobileOpen((prev) => !prev)}
            aria-label="Toggle navigation menu"
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="border-t border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-brand-navy lg:hidden">
          <div className="mb-3 flex items-center justify-between">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${statusStyles[apiStatus]}`}
            >
              {statusLabel[apiStatus]}
            </span>
            {user && (
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                {user.email}
              </span>
            )}
          </div>
          <nav className="grid gap-1">
            {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  `flex min-h-[44px] items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium ${
                    isActive
                      ? "bg-brand-indigo/10 text-brand-indigo dark:bg-brand-indigo-light/15 dark:text-brand-indigo-light"
                      : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                  }`
                }
              >
                <Icon className="h-4 w-4" />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>
          {user && (
            <button
              type="button"
              onClick={handleLogout}
              className="mt-3 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-verdict-danger-ink hover:bg-red-50 dark:border-slate-700 dark:text-red-400 dark:hover:bg-red-950/30"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          )}
        </div>
      )}
    </header>
  );
}
