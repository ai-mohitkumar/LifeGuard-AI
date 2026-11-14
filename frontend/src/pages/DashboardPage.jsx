import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Car,
  Clock,
  Database,
  HeartPulse,
  History,
  ShieldAlert,
  Wind,
} from "lucide-react";
import { platformApi } from "../api/client";
import SemicircleRiskGauge from "../components/SemicircleRiskGauge";
import { useAuth } from "../context/AuthContext";

const MODULES = [
  {
    key: "scam",
    to: "/scam",
    title: "Scam Shield",
    label: "SMS & URL risk",
    icon: ShieldAlert,
    dot: "bg-[#EF4444]",
    iconBox:
      "bg-red-50 text-module-scam border-red-200/80 dark:bg-red-950/40 dark:text-red-400 dark:border-red-900/60",
    cardHover: "hover:border-[#EF4444]/40",
    actionText: "text-module-scam-ink dark:text-red-300",
  },
  {
    key: "price",
    to: "/price",
    title: "Fair Price",
    label: "Used car & bike ₹",
    icon: Car,
    dot: "bg-[#F59E0B]",
    iconBox:
      "bg-amber-50 text-module-price border-amber-200/80 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900/60",
    cardHover: "hover:border-[#F59E0B]/45",
    actionText: "text-module-price-ink dark:text-amber-300",
  },
  {
    key: "health",
    to: "/health",
    title: "Health Check",
    label: "Risk awareness",
    icon: HeartPulse,
    dot: "bg-[#14B8A6]",
    iconBox:
      "bg-teal-50 text-module-health border-teal-200/80 dark:bg-teal-950/40 dark:text-teal-400 dark:border-teal-900/60",
    cardHover: "hover:border-[#14B8A6]/45",
    actionText: "text-brand-teal-ink dark:text-teal-300",
  },
  {
    key: "aqi",
    to: "/aqi",
    title: "Air Aware",
    label: "Next-day AQI",
    icon: Wind,
    dot: "bg-[#0EA5E9]",
    iconBox:
      "bg-sky-50 text-module-aqi border-sky-200/80 dark:bg-sky-950/40 dark:text-sky-400 dark:border-sky-900/60",
    cardHover: "hover:border-[#0EA5E9]/45",
    actionText: "text-module-aqi-ink dark:text-sky-300",
  },
];

const MODULE_LOOKUP = Object.fromEntries(MODULES.map((m) => [m.key, m]));

function getChipInfo(item) {
  if (!item) return { label: "Safe", cls: "bg-green-100 text-verdict-safe-ink" };
  if (item.module === "scam") {
    if (item.predicted_label === "scam") {
      return {
        label: "Likely Scam",
        cls: "bg-red-50 text-verdict-danger-ink border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-900/60",
      };
    }
    if (item.predicted_label === "suspicious") {
      return {
        label: "Suspicious",
        cls: "bg-amber-50 text-verdict-warn-ink border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-900/60",
      };
    }
    return {
      label: "Safe",
      cls: "bg-green-100 text-verdict-safe-ink border-green-200 dark:bg-green-950/50 dark:text-green-300 dark:border-green-900/60",
    };
  }
  if (item.module === "health") {
    if (item.predicted_label === "elevated_risk") {
      return {
        label: "Elevated",
        cls: "bg-red-50 text-verdict-danger-ink border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-900/60",
      };
    }
    if (item.predicted_label === "moderate_risk") {
      return {
        label: "Moderate",
        cls: "bg-amber-50 text-verdict-warn-ink border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-900/60",
      };
    }
    return {
      label: "Low Risk",
      cls: "bg-teal-50 text-brand-teal-ink border-teal-200 dark:bg-teal-950/50 dark:text-teal-300 dark:border-teal-900/60",
    };
  }
  if (item.module === "price") {
    return {
      label: item.predicted_label,
      cls: "bg-amber-50 text-verdict-warn-ink border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-900/60",
    };
  }
  return {
    label: item.predicted_label,
    cls: "bg-sky-50 text-module-aqi-ink border-sky-200 dark:bg-sky-950/50 dark:text-sky-300 dark:border-sky-900/60",
  };
}

function getPreviewSummary(item) {
  if (item.module === "price") {
    return `${item.input_payload?.name || "Vehicle"}${
      item.input_payload?.year ? ` (${item.input_payload.year})` : ""
    }`;
  }
  if (item.module === "health") {
    return item.sub_model === "diabetes" ? "Diabetes screen" : "Heart screen";
  }
  if (item.module === "aqi") {
    return `${item.input_payload?.station || "Station"} · AQI ${
      item.input_payload?.AQI ?? "—"
    }`;
  }
  return item.input_payload?.text || item.input_payload?.url || "Scam check";
}

function getNumericMetric(item) {
  if (item.predicted_value === null || item.predicted_value === undefined) return "—";
  if (item.module === "price") {
    return `₹${Math.round(Number(item.predicted_value)).toLocaleString("en-IN")}`;
  }
  if (item.module === "aqi") {
    return `AQI ${Math.round(Number(item.predicted_value))}`;
  }
  return `${(Number(item.predicted_value) * 100).toFixed(1)}%`;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [recentItems, setRecentItems] = useState([]);

  useEffect(() => {
    platformApi
      .getHistory()
      .then((rows) => setRecentItems(Array.isArray(rows) ? rows.slice(0, 4) : []))
      .catch(() => {
        // Non-blocking fallback
      });
  }, []);

  const latestRiskCheck = recentItems.find(
    (item) => (item.module === "scam" || item.module === "health") && item.predicted_value !== null
  );

  const gaugePercent = latestRiskCheck ? Number(latestRiskCheck.predicted_value) * 100 : 14.0;
  const gaugeTone = latestRiskCheck
    ? latestRiskCheck.predicted_label === "scam" || latestRiskCheck.predicted_label === "elevated_risk"
      ? "danger"
      : latestRiskCheck.predicted_label === "suspicious" || latestRiskCheck.predicted_label === "moderate_risk"
      ? "warn"
      : latestRiskCheck.module === "health"
      ? "teal"
      : "safe"
    : "safe";
  const gaugeVerdict = latestRiskCheck ? getChipInfo(latestRiskCheck).label : "Safe";

  return (
    <div className="space-y-6">
      {/* Compact Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="text-xs font-semibold text-brand-indigo dark:text-brand-indigo-light">
            Overview
          </span>
          <h1 className="font-display text-2xl font-bold tracking-tight text-brand-navy dark:text-white sm:text-3xl">
            Welcome, {user?.full_name}
          </h1>
        </div>

        <div className="flex items-center gap-2.5">
          <Link
            to="/history"
            className="inline-flex items-center gap-1.5 rounded-control border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-brand-surface dark:text-slate-200 dark:hover:bg-slate-800 sm:text-sm"
          >
            <History className="h-4 w-4 text-slate-500 dark:text-slate-400" />
            History
          </Link>
          <Link
            to="/registry"
            className="inline-flex items-center gap-1.5 rounded-control border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-brand-surface dark:text-slate-200 dark:hover:bg-slate-800 sm:text-sm"
          >
            <Database className="h-4 w-4 text-slate-500 dark:text-slate-400" />
            Models
          </Link>
        </div>
      </div>

      {/* 4 Tool Cards */}
      <section aria-label="Tools">
        <div className="grid grid-cols-2 gap-3.5 sm:gap-5 lg:grid-cols-4">
          {MODULES.map(({ to, title, label, icon: Icon, iconBox, cardHover, actionText }) => (
            <Link
              key={to}
              to={to}
              className={`group flex flex-col justify-between rounded-card border border-slate-200 bg-white p-4 shadow-soft transition hover:-translate-y-0.5 hover:shadow-soft-hover dark:border-slate-800 dark:bg-brand-surface sm:p-5 ${cardHover}`}
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border sm:h-11 sm:w-11 ${iconBox}`}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <ArrowRight className="h-4 w-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-600 dark:text-slate-600 dark:group-hover:text-slate-300" />
                </div>

                <h2 className="mt-3.5 font-display text-base font-bold text-brand-navy dark:text-white sm:mt-4 sm:text-lg">
                  {title}
                </h2>
                <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-slate-400 sm:text-sm">
                  {label}
                </p>
              </div>

              <span className={`mt-4 inline-flex items-center gap-1 text-xs font-semibold sm:text-sm ${actionText}`}>
                Check now
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Bento Metrics Row: Risk Gauge + Recent Checks */}
      <div className="grid gap-5 lg:grid-cols-12">
        <section className="flex flex-col justify-between rounded-card border border-slate-200 bg-white p-5 shadow-soft dark:border-slate-800 dark:bg-brand-surface sm:p-6 lg:col-span-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-semibold text-brand-navy dark:text-white">
              Risk gauge
            </h2>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-white/10 dark:text-slate-200">
              {latestRiskCheck ? MODULE_LOOKUP[latestRiskCheck.module]?.title || "Latest" : "Baseline"}
            </span>
          </div>

          <div className="my-2">
            <SemicircleRiskGauge
              percentage={gaugePercent}
              label={latestRiskCheck ? "Latest check" : "Baseline"}
              verdictText={gaugeVerdict}
              tone={gaugeTone}
            />
          </div>

          <div className="flex flex-wrap items-center justify-center gap-1.5 border-t border-slate-100 pt-3 dark:border-slate-800">
            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-[11px] font-semibold text-verdict-safe-ink dark:bg-green-950/50 dark:text-green-300">
              <span className="h-1.5 w-1.5 rounded-full bg-verdict-safe" /> Safe
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-verdict-warn-ink dark:bg-amber-950/50 dark:text-amber-300">
              <span className="h-1.5 w-1.5 rounded-full bg-verdict-warn" /> Suspicious
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-0.5 text-[11px] font-semibold text-verdict-danger-ink dark:bg-red-950/50 dark:text-red-300">
              <span className="h-1.5 w-1.5 rounded-full bg-verdict-danger" /> Scam
            </span>
          </div>
        </section>

        <section className="flex flex-col justify-between rounded-card border border-slate-200 bg-white p-5 shadow-soft dark:border-slate-800 dark:bg-brand-surface sm:p-6 lg:col-span-8">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3.5 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-brand-indigo dark:text-brand-indigo-light" />
              <h2 className="font-display text-base font-semibold text-brand-navy dark:text-white">
                Recent checks
              </h2>
            </div>
            <Link
              to="/history"
              className="inline-flex items-center gap-1 text-xs font-semibold text-brand-indigo hover:underline dark:text-brand-indigo-light"
            >
              View all
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {recentItems.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 py-8 text-center">
              <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                No checks yet
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                {MODULES.map(({ to, title, icon: Icon, iconBox }) => (
                  <Link
                    key={to}
                    to={to}
                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-brand-offwhite px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-brand-indigo/40 hover:text-brand-indigo dark:border-slate-700 dark:bg-brand-navy dark:text-slate-200"
                  >
                    <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full border ${iconBox}`}>
                      <Icon className="h-3 w-3" />
                    </span>
                    {title}
                  </Link>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-4 grid flex-1 gap-3 sm:grid-cols-2">
              {recentItems.map((item) => {
                const chip = getChipInfo(item);
                const mod = MODULE_LOOKUP[item.module];
                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-brand-offwhite px-4 py-3 dark:border-slate-700/70 dark:bg-brand-navy/60"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 shrink-0 rounded-full ${mod?.dot || "bg-brand-indigo"}`} />
                        <span className="text-xs font-semibold text-brand-navy dark:text-slate-100">
                          {mod?.title || item.module}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {new Date(item.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-xs text-slate-600 dark:text-slate-300">
                        {getPreviewSummary(item)}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="font-numeric text-sm font-bold text-brand-navy dark:text-white">
                        {getNumericMetric(item)}
                      </span>
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${chip.cls}`}
                      >
                        {chip.label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
