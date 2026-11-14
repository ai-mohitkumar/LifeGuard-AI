import { useEffect, useState } from "react";
import { History, RefreshCw } from "lucide-react";
import { platformApi } from "../api/client";
import FeedbackWidget from "../components/FeedbackWidget";

const MODULE_FILTERS = [
  { value: "", label: "All Modules" },
  { value: "scam", label: "Scam Shield" },
  { value: "price", label: "Fair Price" },
  { value: "health", label: "Health Check" },
  { value: "aqi", label: "Air Aware" },
];

export default function HistoryPage() {
  const [items, setItems] = useState([]);
  const [moduleFilter, setModuleFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadHistory(mod = moduleFilter) {
    setLoading(true);
    setError("");
    try {
      const data = await platformApi.getHistory(mod);
      setItems(data);
    } catch (err) {
      setError(err.message || "Failed to load prediction history.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadHistory(moduleFilter);
  }, [moduleFilter]);

  function handleFeedbackSaved(updated) {
    setItems((prev) =>
      prev.map((row) => (row.id === updated.id ? updated : row))
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-card border border-slate-200 bg-white p-6 shadow-soft dark:border-slate-800 dark:bg-brand-surface sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand-indigo dark:text-brand-indigo-light">
            <History className="h-4 w-4" />
            Per-User Log &amp; Ground Truth Feedback
          </span>
          <h1 className="mt-1 font-display text-2xl font-bold text-brand-navy dark:text-white">
            Prediction History
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={moduleFilter}
            onChange={(e) => setModuleFilter(e.target.value)}
            className="rounded-control border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
          >
            {MODULE_FILTERS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => loadHistory()}
            className="inline-flex items-center gap-1.5 rounded-control border border-slate-200 bg-brand-offwhite px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-brand-navy dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-verdict-danger-ink dark:border-red-800/60 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-card border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-soft dark:border-slate-800 dark:bg-brand-surface dark:text-slate-400">
          Loading predictions...
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-card border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-soft dark:border-slate-800 dark:bg-brand-surface dark:text-slate-400">
          No checks saved yet. Test an SMS in Scam Shield, value a bike in Fair Price, or preview
          tomorrow&apos;s air quality—your explained history will appear right here.
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => {
            const isPrice = item.module === "price";
            const isHealth = item.module === "health";
            const isAqi = item.module === "aqi";
            const inputPreview = isPrice
              ? `${item.input_payload?.name || "Vehicle"} · ${item.input_payload?.year || ""} · ${Number(
                  item.input_payload?.km_driven || 0
                ).toLocaleString("en-IN")} km${
                  item.input_payload?.fuel ? ` · ${item.input_payload.fuel}` : ""
                }${item.input_payload?.owner ? ` · ${item.input_payload.owner}` : ""}`
              : isHealth
              ? item.sub_model === "diabetes"
                ? `Diabetes Screen · Glucose=${item.input_payload?.Glucose ?? "Imputed"}, BMI=${
                    item.input_payload?.BMI ?? "Imputed"
                  }, Age=${item.input_payload?.Age}`
                : `Heart Screen · Age=${item.input_payload?.age}, cp=${item.input_payload?.cp}, thalach=${item.input_payload?.thalach}, oldpeak=${item.input_payload?.oldpeak}`
              : isAqi
              ? `${item.input_payload?.station || "Station"} · ${item.input_payload?.date || ""} · Today AQI=${
                  item.input_payload?.AQI ?? "—"
                } · PM2.5=${item.input_payload?.["PM2.5"] ?? "Imputed"} µg/m³ · Wind=${
                  item.input_payload?.WSPM ?? "—"
                } m/s`
              : item.input_payload?.text ||
                item.input_payload?.url ||
                JSON.stringify(item.input_payload);

            const labelBadge =
              isPrice || isAqi
                ? item.predicted_label
                : `${item.predicted_label}${
                    item.predicted_value !== null
                      ? ` (${(item.predicted_value * 100).toFixed(1)}%)`
                      : ""
                  }`;

            const aqiLabel = isAqi ? String(item.predicted_label || "") : "";
            const badgeStyle = isPrice
              ? "bg-amber-50 text-verdict-warn-ink dark:bg-amber-950/50 dark:text-amber-300"
              : isAqi
              ? aqiLabel.startsWith("Very Poor") || aqiLabel.startsWith("Severe")
                ? "bg-red-50 text-verdict-danger-ink dark:bg-red-950/50 dark:text-red-300"
                : aqiLabel.startsWith("Poor")
                ? "bg-orange-100 text-orange-800 dark:bg-orange-950/50 dark:text-orange-300"
                : aqiLabel.startsWith("Moderate")
                ? "bg-amber-50 text-verdict-warn-ink dark:bg-amber-950/50 dark:text-amber-300"
                : "bg-green-100 text-verdict-safe-ink dark:bg-green-950/50 dark:text-green-300"
              : item.predicted_label === "scam" || item.predicted_label === "elevated_risk"
              ? "bg-red-50 text-verdict-danger-ink dark:bg-red-950/50 dark:text-red-300"
              : item.predicted_label === "suspicious" || item.predicted_label === "moderate_risk"
              ? "bg-amber-50 text-verdict-warn-ink dark:bg-amber-950/50 dark:text-amber-300"
              : "bg-green-100 text-verdict-safe-ink dark:bg-green-950/50 dark:text-green-300";

            const feedbackOptions = isPrice
              ? ["fair_estimate", "overestimated", "underestimated"]
              : isHealth
              ? ["accurate_screening", "false_alarm", "missed_risk"]
              : isAqi
              ? ["accurate_forecast", "overestimated_aqi", "underestimated_aqi"]
              : ["safe", "suspicious", "scam"];

            return (
              <div
                key={item.id}
                className="space-y-3 rounded-card border border-slate-200 bg-white p-5 shadow-soft dark:border-slate-800 dark:bg-brand-surface"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-brand-indigo/10 px-2.5 py-1 text-xs font-semibold uppercase text-brand-indigo dark:bg-brand-indigo-light/15 dark:text-brand-indigo-light">
                      {item.module}
                      {item.sub_model ? ` · ${item.sub_model}` : ""}
                    </span>
                    <span
                      className={`font-numeric rounded-full px-2.5 py-1 text-xs font-bold uppercase ${badgeStyle}`}
                    >
                      {labelBadge}
                    </span>
                    <span className="font-numeric text-xs text-slate-500 dark:text-slate-400">
                      {item.model_name} v{item.model_version}
                    </span>
                  </div>
                  <span className="font-numeric text-xs text-slate-400">
                    {new Date(item.created_at).toLocaleString()}
                  </span>
                </div>

                <p className="break-all rounded-xl bg-brand-offwhite px-3.5 py-2.5 text-sm text-slate-800 dark:bg-brand-navy/60 dark:text-slate-200">
                  {inputPreview}
                </p>

                <FeedbackWidget
                  predictionId={item.id}
                  labelOptions={feedbackOptions}
                  initialFeedback={
                    item.feedback_is_correct !== null
                      ? {
                          is_correct: item.feedback_is_correct,
                          correct_label: item.feedback_label,
                        }
                      : null
                  }
                  onSubmitted={handleFeedbackSaved}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
