import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Database } from "lucide-react";
import { platformApi } from "../api/client";
import PlotlyChart from "../components/PlotlyChart";

function formatInr(val) {
  if (val === undefined || val === null || Number.isNaN(Number(val))) return "—";
  return `₹${Math.round(Number(val)).toLocaleString("en-IN")}`;
}

function formatNum(val, decimals = 2, suffix = "") {
  if (val === undefined || val === null || Number.isNaN(Number(val))) return "—";
  return `${Number(val).toFixed(decimals)}${suffix}`;
}

function getSummaryMetric(m) {
  if (m.module === "price") {
    return { label: "MAE", value: formatInr(m.metrics?.mae) };
  }
  if (m.module === "aqi" && m.sub_model === "regressor") {
    return { label: "MAE", value: formatNum(m.metrics?.mae, 2, " AQI") };
  }
  if (m.module === "aqi" && m.sub_model === "classifier") {
    return { label: "W-F1", value: formatNum(m.metrics?.weighted_f1, 4) };
  }
  if (m.module === "health") {
    return { label: "ROC-AUC", value: formatNum(m.metrics?.roc_auc, 4) };
  }
  return { label: "F1", value: formatNum(m.metrics?.f1, 4) };
}

function getSparklineSeries(m) {
  const rows = Array.isArray(m.comparison_table) ? m.comparison_table : [];
  if (m.module === "price" || (m.module === "aqi" && m.sub_model === "regressor")) {
    return rows.map((r) => Number(r.cv_r2_mean ?? 0));
  }
  if (m.module === "aqi" && m.sub_model === "classifier") {
    return rows.map((r) => Number(r.cv_weighted_f1_mean ?? 0));
  }
  if (m.module === "health") {
    return rows.map((r) => Number(r.cv_roc_auc_mean ?? 0));
  }
  return rows.map((r) => Number(r.cv_pr_auc_mean ?? 0));
}

function MetricSparkline({ values }) {
  if (!values || values.length < 2) {
    return <span className="text-xs text-slate-400">—</span>;
  }
  const w = 96;
  const h = 28;
  const pad = 4;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1e-6;
  const pts = values.map((v, idx) => {
    const x = pad + (idx / (values.length - 1)) * (w - pad * 2);
    const y = h - pad - ((v - min) / span) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const [lastX, lastY] = pts[pts.length - 1].split(",");

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={pts.join(" ")}
        className="text-brand-indigo dark:text-brand-indigo-light"
      />
      <circle cx={lastX} cy={lastY} r="3" className="fill-brand-teal" />
    </svg>
  );
}

export default function ModelRegistryPage() {
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    platformApi
      .getModels()
      .then((data) => setModels(data))
      .catch((err) => setError(err.message || "Failed to load model registry."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div className="rounded-card border border-slate-200 bg-white p-6 shadow-soft dark:border-slate-800 dark:bg-brand-surface">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand-indigo dark:text-brand-indigo-light">
          <Database className="h-4 w-4" />
          ML Governance &amp; Model Cards
        </span>
        <h1 className="mt-1 font-display text-2xl font-bold text-brand-navy dark:text-white">
          Model Registry
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Active trained pipelines, cross-validation trajectory sparklines, untouched test metrics,
          error analysis, and documented limitations.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-verdict-danger-ink dark:border-red-800/60 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-card border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-soft dark:border-slate-800 dark:bg-brand-surface dark:text-slate-400">
          Loading registered models...
        </div>
      ) : models.length === 0 ? (
        <div className="rounded-card border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-soft dark:border-slate-800 dark:bg-brand-surface dark:text-slate-400">
          No trained models registered yet. Run a module training script (e.g.{" "}
          <code className="font-numeric">python ml/scam/train.py</code>) and refresh.
        </div>
      ) : (
        <div className="space-y-6">
          {/* Prompt 4 Admin Model Summary Table with Metric Sparklines */}
          <section className="overflow-hidden rounded-card border border-slate-200 bg-white shadow-soft dark:border-slate-800 dark:bg-brand-surface">
            <div className="border-b border-slate-100 px-6 py-4 dark:border-slate-800">
              <h2 className="font-display text-base font-bold text-brand-navy dark:text-white">
                Registered Pipelines Overview
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Summary table comparing active production models across all four LifeGuard AI modules.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left text-xs dark:divide-slate-800">
                <thead className="bg-brand-offwhite text-slate-600 dark:bg-brand-navy/60 dark:text-slate-300">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Module</th>
                    <th className="px-4 py-3 font-semibold">Model Name</th>
                    <th className="px-4 py-3 font-semibold">Version</th>
                    <th className="px-4 py-3 font-semibold">Key Test Metric</th>
                    <th className="px-4 py-3 font-semibold">CV Progression</th>
                    <th className="px-4 py-3 font-semibold">Trained Date</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {models.map((m) => {
                    const summary = getSummaryMetric(m);
                    return (
                      <tr
                        key={`summary-${m.id}`}
                        className="hover:bg-slate-50/70 dark:hover:bg-brand-navy/40"
                      >
                        <td className="px-4 py-3">
                          <span className="rounded-full bg-brand-indigo/10 px-2.5 py-0.5 text-[11px] font-bold uppercase text-brand-indigo dark:bg-brand-indigo-light/15 dark:text-brand-indigo-light">
                            {m.module} · {m.sub_model}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-semibold text-brand-navy dark:text-white">
                          {m.model_name}
                        </td>
                        <td className="font-numeric px-4 py-3 text-slate-600 dark:text-slate-300">
                          v{m.version}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-slate-500 dark:text-slate-400">{summary.label}: </span>
                          <span className="font-numeric font-bold text-brand-navy dark:text-white">
                            {summary.value}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <MetricSparkline values={getSparklineSeries(m)} />
                        </td>
                        <td className="font-numeric px-4 py-3 text-slate-500 dark:text-slate-400">
                          {new Date(m.trained_at).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-[11px] font-semibold text-verdict-safe-ink dark:bg-green-950/50 dark:text-green-300">
                            <span className="h-1.5 w-1.5 rounded-full bg-verdict-safe" />
                            Active
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {models.map((m) => {
            const isPrice = m.module === "price";
            const isAqiReg = m.module === "aqi" && m.sub_model === "regressor";
            const isAqiCls = m.module === "aqi" && m.sub_model === "classifier";
            const isHealth = m.module === "health";
            const calTest = m.metrics?.calibration_curve_test;
            const calCv = m.metrics?.calibration_curve_cv_oof;

            return (
              <section
                key={m.id}
                className="space-y-5 rounded-card border border-slate-200 bg-white p-6 shadow-soft dark:border-slate-800 dark:bg-brand-surface"
              >
                {/* Header */}
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4 dark:border-slate-800">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-brand-indigo/10 px-2.5 py-1 text-xs font-bold uppercase text-brand-indigo dark:bg-brand-indigo-light/15 dark:text-brand-indigo-light">
                        {m.module} · {m.sub_model}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-verdict-safe-ink dark:bg-green-950/50 dark:text-green-300">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Active v{m.version}
                      </span>
                    </div>
                    <h2 className="mt-2 font-display text-xl font-bold text-brand-navy dark:text-white">
                      {m.model_name}
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Trained: {new Date(m.trained_at).toLocaleString()} · Artifact:{" "}
                      <code className="font-numeric">{m.artifact_path}</code>
                    </p>
                  </div>

                  {/* Key Test Metrics */}
                  {isPrice ? (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {[
                        ["Test MAE", formatInr(m.metrics?.mae)],
                        ["Test RMSE", formatInr(m.metrics?.rmse)],
                        [
                          "Test R²",
                          m.metrics?.r2 !== undefined ? Number(m.metrics.r2).toFixed(4) : "—",
                        ],
                        [
                          "Median |Err|",
                          formatInr(m.error_analysis?.median_abs_error_inr),
                        ],
                      ].map(([label, val]) => (
                        <div
                          key={label}
                          className="rounded-xl border border-slate-200 bg-brand-offwhite px-3 py-2 text-center dark:border-slate-800 dark:bg-brand-navy/60"
                        >
                          <span className="block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                            {label}
                          </span>
                          <span className="font-numeric text-base font-bold text-brand-navy dark:text-white">
                            {val}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : isAqiReg ? (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {[
                        ["Future MAE", formatNum(m.metrics?.mae, 2, " AQI")],
                        ["Future RMSE", formatNum(m.metrics?.rmse, 2, " AQI")],
                        ["Future R²", formatNum(m.metrics?.r2, 4)],
                        ["Median |Err|", formatNum(m.error_analysis?.median_abs_error, 2, " AQI")],
                      ].map(([label, val]) => (
                        <div
                          key={label}
                          className="rounded-xl border border-slate-200 bg-brand-offwhite px-3 py-2 text-center dark:border-slate-800 dark:bg-brand-navy/60"
                        >
                          <span className="block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                            {label}
                          </span>
                          <span className="font-numeric text-base font-bold text-brand-navy dark:text-white">
                            {val}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : isAqiCls ? (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {[
                        ["Weighted F1", m.metrics?.weighted_f1],
                        ["Macro F1", m.metrics?.macro_f1],
                        ["Adj-1 Acc", m.metrics?.adjacent_1_accuracy],
                        ["Unhealthy Recall", m.metrics?.unhealthy_recall],
                      ].map(([label, val]) => (
                        <div
                          key={label}
                          className="rounded-xl border border-slate-200 bg-brand-offwhite px-3 py-2 text-center dark:border-slate-800 dark:bg-brand-navy/60"
                        >
                          <span className="block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                            {label}
                          </span>
                          <span className="font-numeric text-base font-bold text-brand-navy dark:text-white">
                            {val !== undefined ? Number(val).toFixed(4) : "—"}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : isHealth ? (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {[
                        ["Tuned Recall", m.metrics?.recall],
                        ["ROC-AUC", m.metrics?.roc_auc],
                        ["Brier Score", m.metrics?.brier_score],
                        ["Alert Recall", m.metrics?.test_alert_recall_including_moderate],
                      ].map(([label, val]) => (
                        <div
                          key={label}
                          className="rounded-xl border border-slate-200 bg-brand-offwhite px-3 py-2 text-center dark:border-slate-800 dark:bg-brand-navy/60"
                        >
                          <span className="block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                            {label}
                          </span>
                          <span className="font-numeric text-base font-bold text-brand-navy dark:text-white">
                            {val !== undefined ? Number(val).toFixed(4) : "—"}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {[
                        ["Precision", m.metrics?.precision],
                        ["Recall", m.metrics?.recall],
                        ["F1", m.metrics?.f1],
                        ["PR-AUC", m.metrics?.pr_auc],
                      ].map(([label, val]) => (
                        <div
                          key={label}
                          className="rounded-xl border border-slate-200 bg-brand-offwhite px-3 py-2 text-center dark:border-slate-800 dark:bg-brand-navy/60"
                        >
                          <span className="block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                            {label}
                          </span>
                          <span className="font-numeric text-base font-bold text-brand-navy dark:text-white">
                            {val !== undefined ? Number(val).toFixed(4) : "—"}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Thresholds / Uncertainty Bands */}
                {m.thresholds && Object.keys(m.thresholds).length > 0 && (
                  <div className="flex flex-wrap gap-3 text-xs">
                    {isPrice ? (
                      <span className="font-numeric rounded-lg bg-amber-50 px-3 py-1.5 font-medium text-verdict-warn-ink dark:bg-amber-950/50 dark:text-amber-300">
                        Prediction uncertainty band: ±{" "}
                        {formatInr(m.thresholds.uncertainty_band_mae_inr)} (untouched test MAE)
                      </span>
                    ) : isAqiReg ? (
                      <>
                        <span className="font-numeric rounded-lg bg-amber-50 px-3 py-1.5 font-medium text-verdict-warn-ink dark:bg-amber-950/50 dark:text-amber-300">
                          Forecast uncertainty band: ±{" "}
                          {formatNum(m.thresholds.uncertainty_band_mae, 2, " AQI pts")} (untouched future test MAE)
                        </span>
                        <span className="rounded-lg bg-sky-50 px-3 py-1.5 font-medium text-module-aqi-ink dark:bg-sky-950/50 dark:text-sky-300">
                          Strict Chronological Future Split (No Random Split)
                        </span>
                      </>
                    ) : isAqiCls ? (
                      <>
                        <span className="font-numeric rounded-lg bg-red-50 px-3 py-1.5 font-medium text-verdict-danger-ink dark:bg-red-950/50 dark:text-red-300">
                          Unhealthy-Spike Alert threshold ≥ {m.thresholds.unhealthy_alert_min} (Poor / Very Poor / Severe)
                        </span>
                        {m.metrics?.unhealthy_pr_auc !== undefined && (
                          <span className="font-numeric rounded-lg bg-indigo-50 px-3 py-1.5 font-medium text-brand-indigo dark:bg-indigo-950/50 dark:text-brand-indigo-light">
                            Unhealthy PR-AUC: {Number(m.metrics.unhealthy_pr_auc).toFixed(4)}
                          </span>
                        )}
                        {m.metrics?.accuracy !== undefined && (
                          <span className="font-numeric rounded-lg bg-green-100 px-3 py-1.5 font-medium text-verdict-safe-ink dark:bg-green-950/50 dark:text-green-300">
                            Exact 6-Class Future Acc: {(m.metrics.accuracy * 100).toFixed(2)}%
                          </span>
                        )}
                      </>
                    ) : isHealth ? (
                      <>
                        <span className="font-numeric rounded-lg bg-amber-50 px-3 py-1.5 font-medium text-verdict-warn-ink dark:bg-amber-950/50 dark:text-amber-300">
                          Moderate risk threshold ≥ {m.thresholds.moderate_risk_min}
                        </span>
                        <span className="font-numeric rounded-lg bg-red-50 px-3 py-1.5 font-medium text-verdict-danger-ink dark:bg-red-950/50 dark:text-red-300">
                          Elevated risk threshold ≥ {m.thresholds.elevated_risk_min}
                        </span>
                        <span className="rounded-lg bg-teal-50 px-3 py-1.5 font-medium text-brand-teal-ink dark:bg-teal-950/50 dark:text-teal-300">
                          Awareness only — not medical advice
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="font-numeric rounded-lg bg-amber-50 px-3 py-1.5 font-medium text-verdict-warn-ink dark:bg-amber-950/50 dark:text-amber-300">
                          Suspicious threshold ≥ {m.thresholds.suspicious_min}
                        </span>
                        <span className="font-numeric rounded-lg bg-red-50 px-3 py-1.5 font-medium text-verdict-danger-ink dark:bg-red-950/50 dark:text-red-300">
                          Scam threshold ≥ {m.thresholds.scam_min}
                        </span>
                        {m.metrics?.test_alert_recall_including_suspicious !== undefined && (
                          <span className="font-numeric rounded-lg bg-green-100 px-3 py-1.5 font-medium text-verdict-safe-ink dark:bg-green-950/50 dark:text-green-300">
                            Test alert recall (suspicious + scam):{" "}
                            {(m.metrics.test_alert_recall_including_suspicious * 100).toFixed(2)}%
                          </span>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* CV Comparison Table */}
                <div>
                  <h3 className="mb-2 font-display text-sm font-semibold text-brand-navy dark:text-white">
                    {isAqiReg || isAqiCls
                      ? "Chronological Expanding-Window CV Comparison Table (No Random Split)"
                      : isPrice
                      ? "5-Fold Cross-Validation Comparison Table"
                      : "Stratified Cross-Validation Comparison Table"}
                  </h3>
                  <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                    {isPrice ? (
                      <table className="min-w-full divide-y divide-slate-200 text-left text-xs dark:divide-slate-800">
                        <thead className="bg-brand-offwhite text-slate-600 dark:bg-brand-navy/60 dark:text-slate-300">
                          <tr>
                            <th className="px-3 py-2.5 font-semibold">Model</th>
                            <th className="px-3 py-2.5 font-semibold">CV MAE (mean ± std)</th>
                            <th className="px-3 py-2.5 font-semibold">CV RMSE (mean ± std)</th>
                            <th className="px-3 py-2.5 font-semibold">CV R² (mean ± std)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-brand-surface">
                          {m.comparison_table.map((row) => (
                            <tr
                              key={row.model}
                              className={
                                row.model === m.model_name
                                  ? "bg-indigo-50/50 font-semibold dark:bg-indigo-950/40"
                                  : ""
                              }
                            >
                              <td className="px-3 py-2 text-brand-navy dark:text-white">{row.model}</td>
                              <td className="font-numeric px-3 py-2 text-slate-700 dark:text-slate-300">
                                {formatInr(row.cv_mae_mean)} ± {formatInr(row.cv_mae_std)}
                              </td>
                              <td className="font-numeric px-3 py-2 text-slate-700 dark:text-slate-300">
                                {formatInr(row.cv_rmse_mean)} ± {formatInr(row.cv_rmse_std)}
                              </td>
                              <td className="font-numeric px-3 py-2 text-slate-700 dark:text-slate-300">
                                {row.cv_r2_mean.toFixed(4)} ± {row.cv_r2_std.toFixed(4)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : isAqiReg ? (
                      <table className="min-w-full divide-y divide-slate-200 text-left text-xs dark:divide-slate-800">
                        <thead className="bg-brand-offwhite text-slate-600 dark:bg-brand-navy/60 dark:text-slate-300">
                          <tr>
                            <th className="px-3 py-2.5 font-semibold">Model</th>
                            <th className="px-3 py-2.5 font-semibold">CV MAE (mean ± std)</th>
                            <th className="px-3 py-2.5 font-semibold">CV RMSE (mean ± std)</th>
                            <th className="px-3 py-2.5 font-semibold">CV R² (mean ± std)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-brand-surface">
                          {m.comparison_table.map((row) => (
                            <tr
                              key={row.model}
                              className={
                                row.model === m.model_name
                                  ? "bg-indigo-50/50 font-semibold dark:bg-indigo-950/40"
                                  : ""
                              }
                            >
                              <td className="px-3 py-2 text-brand-navy dark:text-white">{row.model}</td>
                              <td className="font-numeric px-3 py-2 text-slate-700 dark:text-slate-300">
                                {row.cv_mae_mean.toFixed(2)} ± {row.cv_mae_std.toFixed(2)}
                              </td>
                              <td className="font-numeric px-3 py-2 text-slate-700 dark:text-slate-300">
                                {row.cv_rmse_mean.toFixed(2)} ± {row.cv_rmse_std.toFixed(2)}
                              </td>
                              <td className="font-numeric px-3 py-2 text-slate-700 dark:text-slate-300">
                                {row.cv_r2_mean.toFixed(4)} ± {row.cv_r2_std.toFixed(4)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : isAqiCls ? (
                      <table className="min-w-full divide-y divide-slate-200 text-left text-xs dark:divide-slate-800">
                        <thead className="bg-brand-offwhite text-slate-600 dark:bg-brand-navy/60 dark:text-slate-300">
                          <tr>
                            <th className="px-3 py-2.5 font-semibold">Model</th>
                            <th className="px-3 py-2.5 font-semibold">Macro F1 (mean ± std)</th>
                            <th className="px-3 py-2.5 font-semibold">Weighted F1</th>
                            <th className="px-3 py-2.5 font-semibold">Exact Acc</th>
                            <th className="px-3 py-2.5 font-semibold">Adj-1 Acc</th>
                            <th className="px-3 py-2.5 font-semibold">Unhealthy Recall</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-brand-surface">
                          {m.comparison_table.map((row) => (
                            <tr
                              key={row.model}
                              className={
                                row.model === m.model_name
                                  ? "bg-indigo-50/50 font-semibold dark:bg-indigo-950/40"
                                  : ""
                              }
                            >
                              <td className="px-3 py-2 text-brand-navy dark:text-white">{row.model}</td>
                              <td className="font-numeric px-3 py-2 text-slate-700 dark:text-slate-300">
                                {row.cv_macro_f1_mean.toFixed(4)} ± {row.cv_macro_f1_std.toFixed(4)}
                              </td>
                              <td className="font-numeric px-3 py-2 text-slate-700 dark:text-slate-300">
                                {row.cv_weighted_f1_mean.toFixed(4)}
                              </td>
                              <td className="font-numeric px-3 py-2 text-slate-700 dark:text-slate-300">
                                {row.cv_accuracy_mean.toFixed(4)}
                              </td>
                              <td className="font-numeric px-3 py-2 text-slate-700 dark:text-slate-300">
                                {row.cv_adjacent_acc_mean.toFixed(4)}
                              </td>
                              <td className="font-numeric px-3 py-2 text-slate-700 dark:text-slate-300">
                                {row.cv_unhealthy_recall_mean.toFixed(4)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : isHealth ? (
                      <table className="min-w-full divide-y divide-slate-200 text-left text-xs dark:divide-slate-800">
                        <thead className="bg-brand-offwhite text-slate-600 dark:bg-brand-navy/60 dark:text-slate-300">
                          <tr>
                            <th className="px-3 py-2.5 font-semibold">Model</th>
                            <th className="px-3 py-2.5 font-semibold">ROC-AUC (mean ± std)</th>
                            <th className="px-3 py-2.5 font-semibold">Brier Score (lower better)</th>
                            <th className="px-3 py-2.5 font-semibold">Recall @ 0.50</th>
                            <th className="px-3 py-2.5 font-semibold">F1 @ 0.50</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-brand-surface">
                          {m.comparison_table.map((row) => (
                            <tr
                              key={row.model}
                              className={
                                row.model === m.model_name
                                  ? "bg-indigo-50/50 font-semibold dark:bg-indigo-950/40"
                                  : ""
                              }
                            >
                              <td className="px-3 py-2 text-brand-navy dark:text-white">{row.model}</td>
                              <td className="font-numeric px-3 py-2 text-slate-700 dark:text-slate-300">
                                {row.cv_roc_auc_mean.toFixed(4)} ± {row.cv_roc_auc_std.toFixed(4)}
                              </td>
                              <td className="font-numeric px-3 py-2 text-slate-700 dark:text-slate-300">
                                {row.cv_brier_mean.toFixed(4)} ± {row.cv_brier_std.toFixed(4)}
                              </td>
                              <td className="font-numeric px-3 py-2 text-slate-700 dark:text-slate-300">
                                {row.cv_recall_mean.toFixed(4)}
                              </td>
                              <td className="font-numeric px-3 py-2 text-slate-700 dark:text-slate-300">
                                {row.cv_f1_mean.toFixed(4)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <table className="min-w-full divide-y divide-slate-200 text-left text-xs dark:divide-slate-800">
                        <thead className="bg-brand-offwhite text-slate-600 dark:bg-brand-navy/60 dark:text-slate-300">
                          <tr>
                            <th className="px-3 py-2.5 font-semibold">Model</th>
                            <th className="px-3 py-2.5 font-semibold">PR-AUC (mean ± std)</th>
                            <th className="px-3 py-2.5 font-semibold">F1</th>
                            <th className="px-3 py-2.5 font-semibold">F2</th>
                            <th className="px-3 py-2.5 font-semibold">Recall</th>
                            <th className="px-3 py-2.5 font-semibold">Precision</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-brand-surface">
                          {m.comparison_table.map((row) => (
                            <tr
                              key={row.model}
                              className={
                                row.model === m.model_name
                                  ? "bg-indigo-50/50 font-semibold dark:bg-indigo-950/40"
                                  : ""
                              }
                            >
                              <td className="px-3 py-2 text-brand-navy dark:text-white">{row.model}</td>
                              <td className="font-numeric px-3 py-2 text-slate-700 dark:text-slate-300">
                                {row.cv_pr_auc_mean.toFixed(4)} ± {row.cv_pr_auc_std.toFixed(4)}
                              </td>
                              <td className="font-numeric px-3 py-2 text-slate-700 dark:text-slate-300">
                                {row.cv_f1_mean.toFixed(4)}
                              </td>
                              <td className="font-numeric px-3 py-2 text-slate-700 dark:text-slate-300">
                                {row.cv_f2_mean.toFixed(4)}
                              </td>
                              <td className="font-numeric px-3 py-2 text-slate-700 dark:text-slate-300">
                                {row.cv_recall_mean.toFixed(4)}
                              </td>
                              <td className="font-numeric px-3 py-2 text-slate-700 dark:text-slate-300">
                                {row.cv_precision_mean.toFixed(4)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>

                {/* Calibration Curve (Health Check) */}
                {isHealth && (calTest || calCv) && (
                  <div className="rounded-xl border border-slate-200 bg-brand-offwhite/50 p-4 dark:border-slate-800 dark:bg-brand-navy/40">
                    <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                      Reliability / Calibration Curve
                    </h3>
                    <PlotlyChart
                      data={[
                        {
                          type: "scatter",
                          mode: "lines",
                          name: "Perfect Calibration",
                          x: [0, 1],
                          y: [0, 1],
                          line: { dash: "dash", color: "#94a3b8", width: 2 },
                        },
                        ...(calCv
                          ? [
                              {
                                type: "scatter",
                                mode: "lines+markers",
                                name: "CV Out-of-Fold",
                                x: calCv.mean_predicted_prob,
                                y: calCv.fraction_of_positives,
                                line: { color: "#6366f1", width: 2 },
                              },
                            ]
                          : []),
                        ...(calTest
                          ? [
                              {
                                type: "scatter",
                                mode: "lines+markers",
                                name: "Untouched Test",
                                x: calTest.mean_predicted_prob,
                                y: calTest.fraction_of_positives,
                                line: { color: "#14b8a6", width: 2.5 },
                              },
                            ]
                          : []),
                      ]}
                      layout={{
                        margin: { l: 45, r: 16, t: 12, b: 52 },
                        xaxis: { title: "Mean Predicted Probability", range: [0, 1] },
                        yaxis: { title: "Observed Fraction Positive", range: [0, 1] },
                        legend: { orientation: "h", y: -0.3, x: 0 },
                      }}
                      className="h-64 w-full"
                    />
                  </div>
                )}

                {/* Error Analysis & Limitations */}
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 bg-brand-offwhite p-4 dark:border-slate-800 dark:bg-brand-navy/60">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                      Untouched Test Error Analysis
                    </h3>

                    {isPrice ? (
                      <>
                        {m.error_analysis?.tier_mae?.length > 0 && (
                          <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                            {m.error_analysis.tier_mae.map((t) => (
                              <div
                                key={t.tier}
                                className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-center dark:border-slate-700 dark:bg-brand-surface"
                              >
                                <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                                  {t.tier} (n={t.count})
                                </span>
                                <span className="font-numeric font-bold text-brand-navy dark:text-white">
                                  {formatInr(t.mae_inr)}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                        {m.error_analysis?.worst_residuals_sample?.length > 0 && (
                          <div className="mt-3">
                            <span className="text-xs font-semibold text-verdict-danger-ink dark:text-red-400">
                              Largest Untouched Test Residuals:
                            </span>
                            <ul className="mt-1 space-y-1 text-xs text-slate-600 dark:text-slate-300">
                              {m.error_analysis.worst_residuals_sample.slice(0, 3).map((res, idx) => (
                                <li key={idx} className="truncate">
                                  • {res.name} ({res.year}): actual{" "}
                                  <span className="font-numeric">{formatInr(res.actual_inr)}</span> vs pred{" "}
                                  <span className="font-numeric">{formatInr(res.predicted_inr)}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </>
                    ) : isAqiReg ? (
                      <>
                        {m.error_analysis?.seasonal_mae && (
                          <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                            {[
                              [
                                "Winter Haze (Nov–Feb)",
                                m.error_analysis.seasonal_mae.winter_haze_months_nov_feb,
                              ],
                              [
                                "Non-Winter Months",
                                m.error_analysis.seasonal_mae.non_winter_months,
                              ],
                            ].map(
                              ([label, info]) =>
                                info && (
                                  <div
                                    key={label}
                                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-center dark:border-slate-700 dark:bg-brand-surface"
                                  >
                                    <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                                      {label} (n={info.count})
                                    </span>
                                    <span className="font-numeric font-bold text-brand-navy dark:text-white">
                                      {formatNum(info.mae, 2, " AQI")}
                                    </span>
                                  </div>
                                )
                            )}
                          </div>
                        )}
                        {m.error_analysis?.worst_spikes_sample?.length > 0 && (
                          <div className="mt-3">
                            <span className="text-xs font-semibold text-verdict-danger-ink dark:text-red-400">
                              Largest Unseen Future Episode Residuals:
                            </span>
                            <ul className="mt-1 space-y-1 text-xs text-slate-600 dark:text-slate-300">
                              {m.error_analysis.worst_spikes_sample.slice(0, 3).map((res, idx) => (
                                <li key={idx} className="truncate">
                                  • {res.station} ({res.date}): today {res.today_aqi} → actual{" "}
                                  {res.actual_next_aqi} vs pred {res.predicted_next_aqi}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </>
                    ) : isAqiCls ? (
                      <>
                        {m.error_analysis?.per_class_f1 && (
                          <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                            {Object.entries(m.error_analysis.per_class_f1).map(([cat, f1Val]) => (
                              <div
                                key={cat}
                                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-center dark:border-slate-700 dark:bg-brand-surface"
                              >
                                <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                                  {cat} F1
                                </span>
                                <span className="font-numeric font-bold text-brand-navy dark:text-white">
                                  {Number(f1Val).toFixed(4)}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                        {m.error_analysis?.note && (
                          <p className="mt-2.5 text-xs text-slate-600 dark:text-slate-300">
                            {m.error_analysis.note}
                          </p>
                        )}
                      </>
                    ) : isHealth ? (
                      <>
                        {m.error_analysis?.confusion_matrix_at_t_high && (
                          <p className="font-numeric mt-2 text-xs text-slate-700 dark:text-slate-300">
                            Confusion Matrix @ elevated threshold: TN=
                            {m.error_analysis.confusion_matrix_at_t_high.tn}, FP=
                            {m.error_analysis.confusion_matrix_at_t_high.fp}, FN=
                            {m.error_analysis.confusion_matrix_at_t_high.fn}, TP=
                            {m.error_analysis.confusion_matrix_at_t_high.tp} (missed below
                            moderate band:{" "}
                            {m.error_analysis.missed_positives_even_below_moderate_band})
                          </p>
                        )}
                        {m.error_analysis?.false_negatives_sample?.length > 0 && (
                          <p className="mt-2 text-xs text-verdict-danger-ink dark:text-red-400">
                            Borderline false negative example: risk_prob=
                            <span className="font-numeric">
                              {m.error_analysis.false_negatives_sample[0].risk_prob}
                            </span>{" "}
                            (reinforces screening awareness vs clinical diagnosis).
                          </p>
                        )}
                      </>
                    ) : (
                      <>
                        {m.error_analysis?.confusion_matrix_at_t_high && (
                          <p className="font-numeric mt-2 text-xs text-slate-700 dark:text-slate-300">
                            Confusion Matrix @ scam threshold: TN=
                            {m.error_analysis.confusion_matrix_at_t_high.tn}, FP=
                            {m.error_analysis.confusion_matrix_at_t_high.fp}, FN=
                            {m.error_analysis.confusion_matrix_at_t_high.fn}, TP=
                            {m.error_analysis.confusion_matrix_at_t_high.tp} (FN even after
                            suspicious band:{" "}
                            {m.error_analysis.missed_scams_even_after_suspicious_band})
                          </p>
                        )}
                        {m.error_analysis?.false_negatives_sample?.length > 0 && (
                          <div className="mt-3">
                            <span className="text-xs font-semibold text-verdict-danger-ink dark:text-red-400">
                              Sample Missed Scams (False Negatives):
                            </span>
                            <ul className="mt-1 space-y-1 text-xs text-slate-600 dark:text-slate-300">
                              {m.error_analysis.false_negatives_sample.slice(0, 2).map((fn, idx) => (
                                <li key={idx} className="truncate">
                                  • [{fn.scam_prob}] {fn.text || fn.url}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-800/50 dark:bg-amber-950/30">
                    <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-verdict-warn-ink dark:text-amber-300">
                      <AlertCircle className="h-4 w-4" />
                      Documented Limitations
                    </h3>
                    <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-slate-700 dark:text-slate-200">
                      {m.limitations.map((lim, idx) => (
                        <li key={idx}>• {lim}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
