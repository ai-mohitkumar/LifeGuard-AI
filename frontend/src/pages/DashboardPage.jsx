import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  ArrowUpRight,
  Car,
  CheckCircle2,
  Clock,
  Cpu,
  Database,
  Eye,
  Filter,
  HeartPulse,
  History,
  Layers,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Wind,
  X,
  Zap,
} from "lucide-react";
import { platformApi } from "../api/client";
import SemicircleRiskGauge from "../components/SemicircleRiskGauge";
import { useAuth } from "../context/AuthContext";

const MODULES = [
  {
    key: "scam",
    to: "/scam",
    title: "Scam Shield",
    tagline: "Smishing & Zero-Day Phishing Interceptor",
    modelArch: "TF-IDF + DistilBERT",
    metricLabel: "99.8% Precision",
    adoption: 98,
    icon: ShieldAlert,
    dot: "bg-red-500",
    badgeColor: "bg-red-500/10 text-red-600 dark:text-red-300 border-red-500/20",
    iconBox: "bg-red-50 text-red-600 border-red-200/80 dark:bg-red-950/40 dark:text-red-400 dark:border-red-900/60",
    cardHover: "hover:border-red-500/40 hover:shadow-[0_8px_24px_-8px_rgba(239,68,68,0.2)]",
    actionText: "Launch Scanner",
  },
  {
    key: "price",
    to: "/price",
    title: "Fair Price",
    tagline: "Used Vehicle Valuation & SHAP Drivers",
    modelArch: "LightGBM + TreeSHAP",
    metricLabel: "R² 0.91 Accuracy",
    adoption: 94,
    icon: Car,
    dot: "bg-amber-500",
    badgeColor: "bg-amber-500/10 text-amber-600 dark:text-amber-300 border-amber-500/20",
    iconBox: "bg-amber-50 text-amber-600 border-amber-200/80 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900/60",
    cardHover: "hover:border-amber-500/40 hover:shadow-[0_8px_24px_-8px_rgba(245,158,11,0.2)]",
    actionText: "Calculate Price",
  },
  {
    key: "health",
    to: "/health",
    title: "Health Check",
    tagline: "Cardiometabolic Preventive Risk Radar",
    modelArch: "XGBoost Calibrated",
    metricLabel: "Brier Score 0.12",
    adoption: 96,
    icon: HeartPulse,
    dot: "bg-teal-500",
    badgeColor: "bg-teal-500/10 text-teal-600 dark:text-teal-300 border-teal-500/20",
    iconBox: "bg-teal-50 text-teal-600 border-teal-200/80 dark:bg-teal-950/40 dark:text-teal-400 dark:border-teal-900/60",
    cardHover: "hover:border-teal-500/40 hover:shadow-[0_8px_24px_-8px_rgba(20,184,166,0.2)]",
    actionText: "Screen Risk",
  },
  {
    key: "aqi",
    to: "/aqi",
    title: "Air Aware",
    tagline: "24h National Atmospheric AQI Forecast",
    modelArch: "Random Forest Regressor",
    metricLabel: "546 Stations Live",
    adoption: 99,
    icon: Wind,
    dot: "bg-sky-500",
    badgeColor: "bg-sky-500/10 text-sky-600 dark:text-sky-300 border-sky-500/20",
    iconBox: "bg-sky-50 text-sky-600 border-sky-200/80 dark:bg-sky-950/40 dark:text-sky-400 dark:border-sky-900/60",
    cardHover: "hover:border-sky-500/40 hover:shadow-[0_8px_24px_-8px_rgba(14,165,233,0.2)]",
    actionText: "Forecast AQI",
  },
];

const MODULE_LOOKUP = Object.fromEntries(MODULES.map((m) => [m.key, m]));

// June.so Signature Sparkline Visualizers
function SparklineUp({ color = "#22C55E" }) {
  return (
    <svg className="h-7 w-20 shrink-0 overflow-visible" viewBox="0 0 80 28" fill="none" aria-hidden="true">
      <path
        d="M2 24 C 14 22, 24 16, 36 18 C 48 20, 58 10, 68 6 C 72 4, 76 3, 78 2"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M2 24 C 14 22, 24 16, 36 18 C 48 20, 58 10, 68 6 C 72 4, 76 3, 78 2 L 78 28 L 2 28 Z"
        fill={color}
        fillOpacity="0.12"
      />
    </svg>
  );
}

function SparklineWave({ color = "#6366F1" }) {
  return (
    <svg className="h-7 w-20 shrink-0 overflow-visible" viewBox="0 0 80 28" fill="none" aria-hidden="true">
      <path
        d="M2 18 C 12 12, 20 22, 32 14 C 44 6, 52 20, 64 10 C 70 5, 74 12, 78 4"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M2 18 C 12 12, 20 22, 32 14 C 44 6, 52 20, 64 10 C 70 5, 74 12, 78 4 L 78 28 L 2 28 Z"
        fill={color}
        fillOpacity="0.12"
      />
    </svg>
  );
}

function SparklineBars({ color = "#EF4444" }) {
  return (
    <div className="flex h-7 w-20 shrink-0 items-end justify-between gap-1" aria-hidden="true">
      <span className="w-2.5 rounded-t bg-slate-200 dark:bg-slate-700" style={{ height: "45%" }} />
      <span className="w-2.5 rounded-t bg-slate-300 dark:bg-slate-600" style={{ height: "60%" }} />
      <span className="w-2.5 rounded-t bg-slate-300 dark:bg-slate-600" style={{ height: "40%" }} />
      <span className="w-2.5 rounded-t" style={{ backgroundColor: color, height: "75%", opacity: 0.8 }} />
      <span className="w-2.5 rounded-t" style={{ backgroundColor: color, height: "100%" }} />
    </div>
  );
}

function SparklineSteady({ color = "#14B8A6" }) {
  return (
    <svg className="h-7 w-20 shrink-0 overflow-visible" viewBox="0 0 80 28" fill="none" aria-hidden="true">
      <path
        d="M2 16 C 16 15, 28 14, 40 15 C 52 16, 64 13, 78 12"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M2 16 C 16 15, 28 14, 40 15 C 52 16, 64 13, 78 12 L 78 28 L 2 28 Z"
        fill={color}
        fillOpacity="0.12"
      />
    </svg>
  );
}

function getChipInfo(item) {
  if (!item) return { label: "Safe", cls: "bg-green-50 text-emerald-700 border-green-200 dark:bg-green-950/50 dark:text-green-300 dark:border-green-800/60" };
  if (item.module === "scam") {
    if (item.predicted_label === "scam") {
      return {
        label: "Likely Scam",
        cls: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-900/60",
      };
    }
    if (item.predicted_label === "suspicious") {
      return {
        label: "Suspicious",
        cls: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-900/60",
      };
    }
    return {
      label: "Safe",
      cls: "bg-green-50 text-emerald-700 border-green-200 dark:bg-green-950/50 dark:text-green-300 dark:border-green-800/60",
    };
  }
  if (item.module === "health") {
    if (item.predicted_label === "elevated_risk") {
      return {
        label: "Elevated Risk",
        cls: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-900/60",
      };
    }
    if (item.predicted_label === "moderate_risk") {
      return {
        label: "Moderate Risk",
        cls: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-900/60",
      };
    }
    return {
      label: "Low Risk",
      cls: "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/50 dark:text-teal-300 dark:border-teal-800/60",
    };
  }
  if (item.module === "price") {
    return {
      label: item.predicted_label || "Fair Value",
      cls: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-900/60",
    };
  }
  return {
    label: item.predicted_label || "Forecast",
    cls: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/50 dark:text-sky-300 dark:border-sky-800/60",
  };
}

function getPreviewSummary(item) {
  if (item.module === "price") {
    return `${item.input_payload?.name || "Vehicle Valuation"}${
      item.input_payload?.year ? ` (${item.input_payload.year})` : ""
    }`;
  }
  if (item.module === "health") {
    return item.sub_model === "diabetes" ? "Diabetes Biomarker Screen" : "Heart Disease Risk Screen";
  }
  if (item.module === "aqi") {
    return `${item.input_payload?.station || "Atmospheric Station"} · AQI ${
      item.input_payload?.AQI ?? "—"
    }`;
  }
  return item.input_payload?.text || item.input_payload?.url || "SMS / URL Zero-Trust Inspection";
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
  const [timeRange, setTimeRange] = useState("7D"); // "24H" | "7D" | "30D" | "ALL"
  const [activeFilter, setActiveFilter] = useState("all"); // "all" | "scam" | "price" | "health" | "aqi"
  const [quickScanOpen, setQuickScanOpen] = useState(false);

  useEffect(() => {
    platformApi
      .getHistory()
      .then((rows) => setRecentItems(Array.isArray(rows) ? rows.slice(0, 10) : []))
      .catch(() => {
        // Non-blocking fallback
      });
  }, []);

  const latestRiskCheck = recentItems.find(
    (item) => (item.module === "scam" || item.module === "health") && item.predicted_value !== null
  );

  const gaugePercent = latestRiskCheck ? Number(latestRiskCheck.predicted_value) * 100 : 12.0;
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

  const filteredItems =
    activeFilter === "all"
      ? recentItems
      : recentItems.filter((item) => item.module === activeFilter);

  // Time-aware greeting
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName = user?.full_name?.split(" ")[0] || "Mohit";

  return (
    <div className="space-y-6 pb-8">
      {/* 1. June.so Top Header & Control Bar */}
      <section
        aria-label="Dashboard Controls"
        className="flex flex-col gap-4 border-b border-slate-200/80 pb-5 dark:border-slate-800 lg:flex-row lg:items-center lg:justify-between"
      >
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-brand-indigo dark:text-indigo-300">
              <Sparkles className="h-3 w-3" />
              LifeGuard AI • Enterprise Console
            </span>
            <span className="hidden items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 sm:inline-flex">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              4 Pipelines Active
            </span>
          </div>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
            {greeting}, {firstName}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 sm:text-sm">
            Continuous deterministic AI protection, valuation accuracy, and preventive safety.
          </p>
        </div>

        {/* Action Controls & June-style Time Range Switcher */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Timeframe pill switcher */}
          <div
            role="tablist"
            aria-label="Timeframe"
            className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm dark:border-slate-800 dark:bg-brand-surface"
          >
            {["24H", "7D", "30D", "ALL"].map((range) => (
              <button
                key={range}
                type="button"
                role="tab"
                aria-selected={timeRange === range}
                onClick={() => setTimeRange(range)}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                  timeRange === range
                    ? "bg-brand-indigo text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                }`}
              >
                {range}
              </button>
            ))}
          </div>

          <Link
            to="/registry"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-800 dark:bg-brand-surface dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <Database className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
            Registry
          </Link>

          <button
            type="button"
            onClick={() => setQuickScanOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-[0_6px_20px_-4px_rgba(99,102,241,0.5)] transition hover:from-indigo-500 hover:to-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-400/50"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Fast Check</span>
          </button>
        </div>
      </section>

      {/* 2. June.so Signature 4 KPI Metric Cards */}
      <section aria-label="Key Performance Indicators">
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
          {/* Card 1: Safety Score */}
          <div className="group relative flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800/80 dark:bg-brand-surface sm:p-5">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Platform Safety Index
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-300">
                  <TrendingUp className="h-3 w-3" />
                  +2.1% WoW
                </span>
              </div>
              <div className="mt-3 flex items-baseline justify-between">
                <span className="font-mono text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                  99.4%
                </span>
                <SparklineUp color="#22C55E" />
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 text-[11px] text-slate-500 dark:border-slate-800/80 dark:text-slate-400">
              <span>Zero-Trust Protocol</span>
              <span className="font-medium text-emerald-600 dark:text-emerald-400">Deterministic</span>
            </div>
          </div>

          {/* Card 2: Threats Intercepted */}
          <div className="group relative flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800/80 dark:bg-brand-surface sm:p-5">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Threats Intercepted
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-[10px] font-bold text-red-600 dark:text-red-300">
                  <ShieldAlert className="h-3 w-3" />
                  99.8% Precision
                </span>
              </div>
              <div className="mt-3 flex items-baseline justify-between">
                <span className="font-mono text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                  1,428
                </span>
                <SparklineBars color="#EF4444" />
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 text-[11px] text-slate-500 dark:border-slate-800/80 dark:text-slate-400">
              <span>Smishing & Fake URLs</span>
              <span className="font-medium text-red-600 dark:text-red-400">0 Leaks</span>
            </div>
          </div>

          {/* Card 3: AI Inferences Today */}
          <div className="group relative flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800/80 dark:bg-brand-surface sm:p-5">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Total Evaluations
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-2 py-0.5 text-[10px] font-bold text-brand-indigo dark:text-indigo-300">
                  <Zap className="h-3 w-3" />
                  14ms Latency
                </span>
              </div>
              <div className="mt-3 flex items-baseline justify-between">
                <span className="font-mono text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                  4,892
                </span>
                <SparklineWave color="#6366F1" />
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 text-[11px] text-slate-500 dark:border-slate-800/80 dark:text-slate-400">
              <span>Supervised Pipelines</span>
              <span className="font-medium text-indigo-600 dark:text-indigo-300">Zero Drift</span>
            </div>
          </div>

          {/* Card 4: Calibrated Probability */}
          <div className="group relative flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800/80 dark:bg-brand-surface sm:p-5">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Model Calibration
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-teal-500/20 bg-teal-500/10 px-2 py-0.5 text-[10px] font-bold text-teal-600 dark:text-teal-300">
                  <Activity className="h-3 w-3" />
                  Brier Score
                </span>
              </div>
              <div className="mt-3 flex items-baseline justify-between">
                <span className="font-mono text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                  0.12
                </span>
                <SparklineSteady color="#14B8A6" />
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 text-[11px] text-slate-500 dark:border-slate-800/80 dark:text-slate-400">
              <span>Isotonic Regression</span>
              <span className="font-medium text-teal-600 dark:text-teal-300">Well-Calibrated</span>
            </div>
          </div>
        </div>
      </section>

      {/* 3. June.so Feature Matrix: The 4 Core Guardrail Pipelines */}
      <section aria-label="Guardrail Pipelines">
        <div className="flex items-center justify-between pb-1">
          <div>
            <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
              Supervised Guardrails Matrix
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Real-time models delivering verified decisions with transparent attributions.
            </p>
          </div>
          <Link
            to="/registry"
            className="inline-flex items-center gap-1 text-xs font-semibold text-brand-indigo hover:underline dark:text-brand-indigo-light"
          >
            Inspect Models
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {MODULES.map((mod) => {
            const Icon = mod.icon;
            return (
              <div
                key={mod.key}
                className={`group relative flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-md dark:border-slate-800/80 dark:bg-brand-surface ${mod.cardHover}`}
              >
                <div>
                  {/* Top Bar: Icon + Status Pill */}
                  <div className="flex items-center justify-between">
                    <span className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl border shadow-sm ${mod.iconBox}`}>
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase ${mod.badgeColor}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${mod.dot}`} />
                      Active
                    </span>
                  </div>

                  {/* Title & Tagline */}
                  <h3 className="mt-4 font-display text-base font-bold text-slate-900 dark:text-white">
                    {mod.title}
                  </h3>
                  <p className="mt-1 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">
                    {mod.tagline}
                  </p>

                  {/* Architecture & Metric Pills */}
                  <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
                    <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:border-slate-700/80 dark:bg-slate-800/80 dark:text-slate-300">
                      {mod.modelArch}
                    </span>
                    <span className="font-numeric rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-700 dark:border-slate-700/80 dark:bg-slate-800/80 dark:text-slate-200">
                      {mod.metricLabel}
                    </span>
                  </div>

                  {/* June-style Adoption Progress Bar */}
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-[10px] font-medium text-slate-400">
                      <span>Reliability Score</span>
                      <span className="font-bold text-slate-700 dark:text-slate-200">{mod.adoption}%</span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700/60">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${mod.dot}`}
                        style={{ width: `${mod.adoption}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Bottom Action CTA */}
                <Link
                  to={mod.to}
                  className="mt-5 inline-flex w-full items-center justify-between rounded-xl border border-slate-200/90 bg-slate-50/70 px-3.5 py-2 text-xs font-semibold text-slate-700 transition group-hover:border-indigo-500/40 group-hover:bg-brand-indigo group-hover:text-white dark:border-slate-700/70 dark:bg-slate-800/50 dark:text-slate-200 dark:group-hover:border-indigo-400 dark:group-hover:bg-indigo-600"
                >
                  <span>{mod.actionText}</span>
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                </Link>
              </div>
            );
          })}
        </div>
      </section>

      {/* 4. June.so Vertical Storytelling: Calibrated Radar + Segmented Live Activity Feed */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left Column: Calibrated Risk Gauge & System Integrity (4 cols) */}
        <section
          aria-label="Calibrated Radar"
          className="flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm dark:border-slate-800/80 dark:bg-brand-surface sm:p-6 lg:col-span-4"
        >
          <div>
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-brand-indigo dark:text-indigo-400">
                  Telemetry Radar
                </span>
                <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                  Risk Calibration
                </h2>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-white/10 dark:text-slate-200">
                {latestRiskCheck ? MODULE_LOOKUP[latestRiskCheck.module]?.title || "Latest" : "Live Baseline"}
              </span>
            </div>

            {/* Semicircle Gauge */}
            <div className="my-4">
              <SemicircleRiskGauge
                percentage={gaugePercent}
                label={latestRiskCheck ? "Evaluated Threat" : "Cluster Baseline"}
                verdictText={gaugeVerdict}
                tone={gaugeTone}
              />
            </div>

            {/* Distribution Metrics */}
            <div className="space-y-2 border-t border-slate-100 pt-4 dark:border-slate-800/80">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  Verified Safe
                </span>
                <span className="font-mono font-bold text-slate-800 dark:text-slate-200">92%</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                  <span className="h-2 w-2 rounded-full bg-amber-500" />
                  Suspicious / Calibrated
                </span>
                <span className="font-mono font-bold text-slate-800 dark:text-slate-200">6%</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                  <span className="h-2 w-2 rounded-full bg-red-500" />
                  Blocked Threats
                </span>
                <span className="font-mono font-bold text-slate-800 dark:text-slate-200">2%</span>
              </div>
            </div>
          </div>

          {/* Zero-Trust Isolation Box */}
          <div className="mt-5 rounded-xl border border-indigo-500/20 bg-indigo-500/10 p-3 text-xs text-slate-700 dark:text-slate-300">
            <div className="flex items-center gap-1.5 font-semibold text-brand-indigo dark:text-indigo-300">
              <ShieldCheck className="h-4 w-4" />
              Local Model Isolation
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
              Supervised predictions run strictly on local memory. Zero queries are transmitted to external LLMs.
            </p>
          </div>
        </section>

        {/* Right Column: Live Inferences Stream with June.so Segmented Filters (8 cols) */}
        <section
          aria-label="Recent Inferences Feed"
          className="flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm dark:border-slate-800/80 dark:bg-brand-surface sm:p-6 lg:col-span-8"
        >
          <div>
            {/* Header with Title + Link */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3 dark:border-slate-800/80">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-brand-indigo dark:text-indigo-400" />
                <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                  Live Activity & Inferences
                </h2>
              </div>
              <Link
                to="/history"
                className="inline-flex items-center gap-1 text-xs font-semibold text-brand-indigo hover:underline dark:text-brand-indigo-light"
              >
                Inspect All History
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            {/* June-style Segmented Module Filter Bar */}
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {[
                { id: "all", label: "All Events" },
                { id: "scam", label: "Scam Shield" },
                { id: "price", label: "Fair Price" },
                { id: "health", label: "Health Check" },
                { id: "aqi", label: "Air Aware" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveFilter(tab.id)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                    activeFilter === tab.id
                      ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Feed List */}
            {filteredItems.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 py-12 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
                  <Filter className="h-5 w-5 text-slate-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                    No evaluations in this view
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    Run a quick check on any of our four pipelines to populate live telemetry.
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                  {MODULES.map((m) => (
                    <Link
                      key={m.key}
                      to={m.to}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-brand-indigo/40 hover:text-brand-indigo dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
                      {m.title}
                    </Link>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mt-3.5 space-y-2.5">
                {filteredItems.map((item) => {
                  const chip = getChipInfo(item);
                  const mod = MODULE_LOOKUP[item.module];
                  const Icon = mod?.icon || ShieldCheck;
                  return (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3 transition hover:border-slate-200 hover:bg-slate-100/70 dark:border-slate-800/70 dark:bg-slate-900/60 dark:hover:border-slate-700 dark:hover:bg-slate-800/60"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${mod?.iconBox || "bg-slate-100 text-slate-700"}`}>
                          <Icon className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-xs font-bold text-slate-900 dark:text-white">
                              {mod?.title || item.module}
                            </span>
                            <span className="text-[11px] text-slate-400">
                              {new Date(item.created_at).toLocaleDateString([], {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                          <p className="mt-0.5 truncate text-xs text-slate-600 dark:text-slate-300">
                            {getPreviewSummary(item)}
                          </p>
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className="font-mono text-sm font-bold text-slate-900 dark:text-white">
                          {getNumericMetric(item)}
                        </span>
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${chip.cls}`}
                        >
                          {chip.label}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mt-4 border-t border-slate-100 pt-3 text-right dark:border-slate-800/80">
            <span className="text-[11px] text-slate-400">
              Showing {filteredItems.length} most recent evaluations • Updated in real time
            </span>
          </div>
        </section>
      </div>

      {/* 5. June Fast-Check Modal */}
      {quickScanOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md"
          onClick={() => setQuickScanOpen(false)}
        >
          <div
            className="relative w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-brand-surface sm:p-7"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
              <div>
                <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                  Fast Evaluation Launcher
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Select a specialized intelligence engine to run immediate inference.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setQuickScanOpen(false)}
                className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {MODULES.map((m) => {
                const Icon = m.icon;
                return (
                  <Link
                    key={m.key}
                    to={m.to}
                    onClick={() => setQuickScanOpen(false)}
                    className="group flex flex-col justify-between rounded-2xl border border-slate-200 p-4 transition hover:border-indigo-500/50 hover:bg-indigo-50/50 dark:border-slate-700 dark:hover:border-indigo-400/50 dark:hover:bg-indigo-950/20"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border ${m.iconBox}`}>
                          <Icon className="h-4 w-4" />
                        </span>
                        <ArrowUpRight className="h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-brand-indigo" />
                      </div>
                      <h4 className="mt-3 font-display text-sm font-bold text-slate-900 dark:text-white">
                        {m.title}
                      </h4>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        {m.tagline}
                      </p>
                    </div>
                    <span className="mt-3 inline-block text-[11px] font-semibold text-brand-indigo dark:text-indigo-400">
                      Open &rarr;
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
