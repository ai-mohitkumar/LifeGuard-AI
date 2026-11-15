import { useState } from "react";
import {
  AlertTriangle,
  Info,
  Link2,
  MessageSquareText,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { scamApi } from "../api/client";
import FeedbackWidget from "../components/FeedbackWidget";
import PlotlyChart from "../components/PlotlyChart";
import SemicircleRiskGauge from "../components/SemicircleRiskGauge";

const SMS_SAMPLES = [
  {
    label: "Safe Sample",
    text: "Hey, are we still meeting near the library at 5 pm for project review?",
  },
  {
    label: "Suspicious / Promo",
    text: "Special weekend offer on your mobile plan: reply YES to activate bonus 2GB data today.",
  },
  {
    label: "Scam Sample",
    text: "URGENT! You have won a FREE Rs 50,000 cash prize. Call 09061701461 now and claim your reward!",
  },
];

const URL_SAMPLES = [
  {
    label: "Safe URL",
    url: "https://www.wikipedia.org",
  },
  {
    label: "Suspicious / Long Path",
    url: "https://accounts-verification.example-support.com/login/session?redirect=home",
  },
  {
    label: "Phishing URL",
    url: "http://192.168.1.45/secure-login.paypal.verify-account.com/update?id=9981",
  },
];

const TIER_STYLES = {
  safe: {
    badge:
      "bg-green-100 text-verdict-safe-ink border-green-200 dark:bg-green-950/50 dark:text-green-300 dark:border-green-800/60",
    gaugeTone: "safe",
    icon: ShieldCheck,
    title: "Safe",
    tip: "This looks routine. As a steady habit, still double-check unexpected payment requests by calling the sender directly.",
  },
  suspicious: {
    badge:
      "bg-amber-50 text-verdict-warn-ink border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800/60",
    gaugeTone: "warn",
    icon: AlertTriangle,
    title: "Suspicious",
    tip: "Take a pause before replying or tapping links. Confirm directly inside your bank, courier, or service provider's official app.",
  },
  scam: {
    badge:
      "bg-red-50 text-verdict-danger-ink border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-800/60",
    gaugeTone: "danger",
    icon: ShieldAlert,
    title: "Likely Scam",
    tip: "Hold on before acting—do not share OTPs, UPI PINs, or card details, and do not open unverified links or call unfamiliar toll numbers.",
  },
};

export default function ScamShieldPage() {
  const [activeTab, setActiveTab] = useState("sms"); // "sms" | "url"
  const [smsText, setSmsText] = useState("");
  const [urlText, setUrlText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  async function handleAnalyze(event) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response =
        activeTab === "sms"
          ? await scamApi.predictSms(smsText)
          : await scamApi.predictUrl(urlText);
      setResult(response);
    } catch (err) {
      setError(err.message || "Prediction failed.");
    } finally {
      setLoading(false);
    }
  }

  const tier = result ? TIER_STYLES[result.label] : null;
  const TierIcon = tier?.icon || ShieldCheck;

  const topThreeReasons = result?.top_contributors
    ? [...result.top_contributors]
        .filter((c) => (result.label === "safe" ? true : c.direction === "scam"))
        .slice(0, 3)
    : [];
  const reasonsToDisplay =
    topThreeReasons.length > 0
      ? topThreeReasons
      : (result?.top_contributors || []).slice(0, 3);

  const contributorsReversed = result?.top_contributors
    ? [...result.top_contributors].reverse()
    : [];
  const plotData = contributorsReversed.length
    ? [
        {
          type: "bar",
          orientation: "h",
          x: contributorsReversed.map((c) => c.contribution),
          y: contributorsReversed.map((c) => c.feature),
          marker: {
            color: contributorsReversed.map((c) =>
              c.direction === "scam" ? "#EF4444" : "#22C55E"
            ),
          },
          hovertemplate: "%{y}: %{x:+.4f}<extra></extra>",
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      {/* Header + Mode Switch */}
      <div className="rounded-card border border-slate-200 bg-white p-5 shadow-soft dark:border-slate-800 dark:bg-brand-surface sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-verdict-danger-ink dark:bg-red-950/50 dark:text-red-300">
              Scam Shield
            </span>
            <h1 className="mt-2 font-display text-2xl font-bold text-brand-navy dark:text-white">
              SMS &amp; URL Check
            </h1>
            <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">
              Check risky messages and links before you tap.
            </p>
          </div>

          <div className="inline-flex rounded-xl bg-slate-100 p-1 dark:bg-brand-navy">
            <button
              type="button"
              onClick={() => {
                setActiveTab("sms");
                setError("");
                setResult(null);
              }}
              className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition ${
                activeTab === "sms"
                  ? "bg-white text-brand-navy shadow-sm dark:bg-brand-surface dark:text-white"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              }`}
            >
              <MessageSquareText className="h-4 w-4" />
              SMS Text
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab("url");
                setError("");
                setResult(null);
              }}
              className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition ${
                activeTab === "url"
                  ? "bg-white text-brand-navy shadow-sm dark:bg-brand-surface dark:text-white"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              }`}
            >
              <Link2 className="h-4 w-4" />
              URL Checker
            </button>
          </div>
        </div>

        {/* Input Form */}
        <form onSubmit={handleAnalyze} className="mt-5 space-y-4">
          {activeTab === "sms" ? (
            <div>
              <label
                htmlFor="smsInput"
                className="block text-sm font-medium text-slate-700 dark:text-slate-200"
              >
                SMS or message text
              </label>
              <textarea
                id="smsInput"
                rows={3}
                required
                value={smsText}
                onChange={(e) => setSmsText(e.target.value)}
                placeholder="Paste a message to check for scam risk..."
                className="mt-1.5 w-full rounded-control border border-slate-300 p-3 text-sm outline-none transition focus:border-brand-indigo focus:ring-2 focus:ring-brand-indigo/20"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                {SMS_SAMPLES.map((sample) => (
                  <button
                    key={sample.label}
                    type="button"
                    onClick={() => setSmsText(sample.text)}
                    className="rounded-lg border border-slate-200 bg-brand-offwhite px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-brand-navy dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    Try: {sample.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <label
                htmlFor="urlInput"
                className="block text-sm font-medium text-slate-700 dark:text-slate-200"
              >
                Website link (checked safely without opening)
              </label>
              <input
                id="urlInput"
                type="text"
                required
                value={urlText}
                onChange={(e) => setUrlText(e.target.value)}
                placeholder="https://example.com/login"
                className="mt-1.5 w-full rounded-control border border-slate-300 px-3.5 py-2.5 text-sm outline-none transition focus:border-brand-indigo focus:ring-2 focus:ring-brand-indigo/20"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                {URL_SAMPLES.map((sample) => (
                  <button
                    key={sample.label}
                    type="button"
                    onClick={() => setUrlText(sample.url)}
                    className="rounded-lg border border-slate-200 bg-brand-offwhite px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-brand-navy dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    Try: {sample.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-verdict-danger-ink dark:border-red-800/60 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </div>
          )}

          <div className="sticky bottom-3 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/95 p-2.5 shadow-md backdrop-blur dark:border-slate-700 dark:bg-brand-surface/95 sm:px-4 sm:py-3 sm:shadow-soft">
            <span className="hidden text-xs text-slate-500 dark:text-slate-400 sm:inline">
              {activeTab === "sms" ? "Safe · Suspicious · Scam" : "Links are never fetched"}
            </span>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-control bg-brand-indigo px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-indigo-hover disabled:opacity-60 sm:w-auto"
            >
              <ShieldAlert className="h-4 w-4" />
              {loading
                ? "Checking..."
                : activeTab === "sms"
                ? "Check Scam"
                : "Check URL"}
            </button>
          </div>
        </form>
      </div>

      {/* Prediction & Explainability Panel */}
      {result && tier && (
        <div className="grid gap-6 lg:grid-cols-5">
          {/* Left: Semicircle Risk Gauge, Top 3 Reasons, Safety Tip & Feedback */}
          <div className="space-y-5 rounded-card border border-slate-200 bg-white p-5 shadow-soft dark:border-slate-800 dark:bg-brand-surface sm:p-6 lg:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span
                className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-bold ${tier.badge}`}
              >
                <TierIcon className="h-4 w-4" />
                {tier.title}
              </span>
              <span className="font-numeric text-xs font-medium text-slate-500 dark:text-slate-400">
                {result.model_name} (v{result.model_version})
              </span>
            </div>

            <div className="rounded-xl border border-slate-100 bg-brand-offwhite py-4 dark:border-slate-800 dark:bg-brand-navy/60">
              <SemicircleRiskGauge
                percentage={result.scam_probability * 100}
                label="Scam Risk Score"
                verdictText={tier.title}
                tone={tier.gaugeTone}
                lowCut={Math.round(result.threshold_low * 100)}
                highCut={Math.round(result.threshold_high * 100)}
              />
            </div>

            {/* Top 3 Reasons Card */}
            {reasonsToDisplay.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-brand-offwhite p-4 dark:border-slate-700 dark:bg-brand-navy/60">
                <h3 className="font-display text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                  Top {reasonsToDisplay.length} Signals Flagged
                </h3>
                <ul className="mt-2 space-y-1.5 text-xs text-slate-700 dark:text-slate-200">
                  {reasonsToDisplay.map((reason, idx) => (
                    <li key={idx} className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">• {reason.feature}</span>
                      <span
                        className={`font-numeric shrink-0 font-semibold ${
                          reason.direction === "scam"
                            ? "text-verdict-danger-ink dark:text-red-300"
                            : "text-verdict-safe-ink dark:text-green-300"
                        }`}
                      >
                        {reason.contribution >= 0 ? "+" : ""}
                        {Number(reason.contribution).toFixed(3)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Calm Safety Tip Card */}
            <div className="flex items-start gap-2.5 rounded-xl border border-red-200/70 bg-red-50/60 p-4 text-xs leading-relaxed text-slate-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-slate-200">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-module-scam" />
              <div>
                <span className="block font-display font-semibold text-verdict-danger-ink dark:text-red-300">
                  Safety Tip
                </span>
                {tier.tip}
              </div>
            </div>

            <p className="rounded-xl bg-slate-50 p-3.5 text-sm leading-relaxed text-slate-700 dark:bg-brand-navy/60 dark:text-slate-300">
              {result.explanation_summary}
            </p>

            {result.extracted_features && (
              <div>
                <h3 className="mb-2 font-display text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Extracted URL Lexical Features
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {Object.entries(result.extracted_features).map(([k, v]) => (
                    <div
                      key={k}
                      className="flex items-center justify-between rounded-lg border border-slate-100 bg-brand-offwhite px-2.5 py-1.5 dark:border-slate-700 dark:bg-brand-navy/60"
                    >
                      <span className="truncate text-slate-600 dark:text-slate-300">{k}</span>
                      <span className="font-numeric font-semibold text-brand-navy dark:text-white">
                        {v}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <FeedbackWidget
              key={result.prediction_id}
              predictionId={result.prediction_id}
              labelOptions={["safe", "suspicious", "scam"]}
            />
          </div>

          {/* Right: Plotly Explainability Chart */}
          <div className="rounded-card border border-slate-200 bg-white p-5 shadow-soft dark:border-slate-800 dark:bg-brand-surface sm:p-6 lg:col-span-3">
            <h2 className="font-display text-base font-bold text-brand-navy dark:text-white">
              {result.sub_model === "sms"
                ? "Top Words / N-grams Driving Prediction"
                : "Top Lexical Feature SHAP Attributions"}
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Coral bars increase scam/phishing risk; green bars support safety.
            </p>

            {plotData.length > 0 ? (
              <PlotlyChart
                data={plotData}
                layout={{
                  margin: { l: 16, r: 20, t: 16, b: 40 },
                  xaxis: {
                    title:
                      result.sub_model === "sms"
                        ? "Log-odds / TF-IDF Contribution"
                        : "SHAP Contribution to Phishing Risk",
                    zeroline: true,
                    zerolinecolor: "#94a3b8",
                  },
                  yaxis: { automargin: true },
                }}
                className="mt-4 h-80 w-full"
              />
            ) : (
              <div className="mt-6 rounded-xl border border-slate-200 bg-brand-offwhite p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-brand-navy/60 dark:text-slate-400">
                No vocabulary tokens matched the trained TF-IDF dictionary for this short text.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
