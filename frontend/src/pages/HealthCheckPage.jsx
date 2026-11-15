import { useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Droplets,
  HeartPulse,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { healthCheckApi } from "../api/client";
import FeedbackWidget from "../components/FeedbackWidget";
import PlotlyChart from "../components/PlotlyChart";
import SemicircleRiskGauge from "../components/SemicircleRiskGauge";

const DIABETES_SAMPLES = [
  {
    label: "Lower-Risk Routine",
    form: {
      Pregnancies: 1,
      Glucose: 92,
      BloodPressure: 70,
      SkinThickness: 22,
      Insulin: 80,
      BMI: 22.8,
      DiabetesPedigreeFunction: 0.24,
      Age: 25,
    },
  },
  {
    label: "Moderate / Missing Insulin",
    form: {
      Pregnancies: 2,
      Glucose: 118,
      BloodPressure: 74,
      SkinThickness: "",
      Insulin: "",
      BMI: 29.4,
      DiabetesPedigreeFunction: 0.45,
      Age: 34,
    },
  },
  {
    label: "Elevated-Risk Profile",
    form: {
      Pregnancies: 5,
      Glucose: 166,
      BloodPressure: 84,
      SkinThickness: 32,
      Insulin: 185,
      BMI: 36.2,
      DiabetesPedigreeFunction: 0.85,
      Age: 49,
    },
  },
];

const HEART_SAMPLES = [
  {
    label: "Lower-Risk Profile",
    form: {
      age: 41,
      sex: 0,
      cp: 2,
      trestbps: 118,
      chol: 196,
      fbs: 0,
      restecg: 0,
      thalach: 174,
      exang: 0,
      oldpeak: 0.0,
      slope: 1,
      ca: 0,
      thal: 3,
    },
  },
  {
    label: "Moderate (Missing ca/thal)",
    form: {
      age: 54,
      sex: 1,
      cp: 3,
      trestbps: 134,
      chol: 238,
      fbs: 0,
      restecg: 0,
      thalach: 148,
      exang: 0,
      oldpeak: 1.0,
      slope: 2,
      ca: "",
      thal: "",
    },
  },
  {
    label: "Elevated-Risk Clinical Profile",
    form: {
      age: 62,
      sex: 1,
      cp: 4,
      trestbps: 152,
      chol: 282,
      fbs: 1,
      restecg: 2,
      thalach: 118,
      exang: 1,
      oldpeak: 2.6,
      slope: 2,
      ca: 2,
      thal: 7,
    },
  },
];

const TIER_STYLES = {
  low_risk: {
    badge:
      "bg-teal-50 text-brand-teal-ink border-teal-200 dark:bg-teal-950/50 dark:text-teal-300 dark:border-teal-800/60",
    gaugeTone: "teal",
    icon: CheckCircle2,
    title: "Low Awareness Risk",
  },
  moderate_risk: {
    badge:
      "bg-amber-50 text-verdict-warn-ink border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800/60",
    gaugeTone: "warn",
    icon: AlertTriangle,
    title: "Moderate Risk — Checkup Suggested",
  },
  elevated_risk: {
    badge:
      "bg-red-50 text-verdict-danger-ink border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-800/60",
    gaugeTone: "danger",
    icon: ShieldAlert,
    title: "Elevated Risk — Consult a Doctor",
  },
};

export default function HealthCheckPage() {
  const [activeTab, setActiveTab] = useState("diabetes"); // "diabetes" | "heart"
  const [options, setOptions] = useState(null);
  const [diabetesForm, setDiabetesForm] = useState(DIABETES_SAMPLES[1].form);
  const [heartForm, setHeartForm] = useState(HEART_SAMPLES[0].form);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  useEffect(() => {
    healthCheckApi
      .getOptions()
      .then((data) => setOptions(data))
      .catch(() => {
        // Non-blocking fallback
      });
  }, []);

  async function handleScreen(event) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const toOptNum = (v) => (v === "" || v === null || v === undefined ? null : Number(v));
      const response =
        activeTab === "diabetes"
          ? await healthCheckApi.predictDiabetes({
              Pregnancies: Number(diabetesForm.Pregnancies),
              Glucose: toOptNum(diabetesForm.Glucose),
              BloodPressure: toOptNum(diabetesForm.BloodPressure),
              SkinThickness: toOptNum(diabetesForm.SkinThickness),
              Insulin: toOptNum(diabetesForm.Insulin),
              BMI: toOptNum(diabetesForm.BMI),
              DiabetesPedigreeFunction: Number(diabetesForm.DiabetesPedigreeFunction),
              Age: Number(diabetesForm.Age),
            })
          : await healthCheckApi.predictHeart({
              age: Number(heartForm.age),
              sex: Number(heartForm.sex),
              cp: Number(heartForm.cp),
              trestbps: Number(heartForm.trestbps),
              chol: Number(heartForm.chol),
              fbs: Number(heartForm.fbs),
              restecg: Number(heartForm.restecg),
              thalach: Number(heartForm.thalach),
              exang: Number(heartForm.exang),
              oldpeak: Number(heartForm.oldpeak),
              slope: Number(heartForm.slope),
              ca: toOptNum(heartForm.ca),
              thal: toOptNum(heartForm.thal),
            });
      setResult(response);
    } catch (err) {
      setError(err.message || "Health risk screening failed.");
    } finally {
      setLoading(false);
    }
  }

  const tier = result ? TIER_STYLES[result.risk_tier] : null;
  const TierIcon = tier?.icon || Activity;

  const contributorsReversed = result?.top_contributors
    ? [...result.top_contributors].reverse()
    : [];
  const driverPlotData = contributorsReversed.length
    ? [
        {
          type: "bar",
          orientation: "h",
          x: contributorsReversed.map((c) => c.contribution),
          y: contributorsReversed.map((c) => `${c.feature}`),
          marker: {
            color: contributorsReversed.map((c) =>
              c.direction === "higher_risk" ? "#EF4444" : "#14B8A6"
            ),
          },
          hovertemplate: "%{y}: %{x:+.4f}<extra></extra>",
        },
      ]
    : [];

  const trackCal = options?.calibration_curves?.[activeTab];
  const calPlotData = trackCal
    ? [
        {
          type: "scatter",
          mode: "lines",
          name: "Ideal Perfect Calibration",
          x: [0, 1],
          y: [0, 1],
          line: { dash: "dash", color: "#94a3b8", width: 2 },
        },
        ...(trackCal.cv_oof
          ? [
              {
                type: "scatter",
                mode: "lines+markers",
                name: "5-Fold CV OOF (Calibrated)",
                x: trackCal.cv_oof.mean_predicted_prob,
                y: trackCal.cv_oof.fraction_of_positives,
                line: { color: "#6366f1", width: 2 },
                marker: { size: 7 },
              },
            ]
          : []),
        ...(trackCal.test
          ? [
              {
                type: "scatter",
                mode: "lines+markers",
                name: "Untouched Test Set",
                x: trackCal.test.mean_predicted_prob,
                y: trackCal.test.fraction_of_positives,
                line: { color: "#14b8a6", width: 2.5 },
                marker: { size: 8 },
              },
            ]
          : []),
      ]
    : [];

  return (
    <div className="space-y-5">
      {/* Mandatory Medical Awareness Disclaimer */}
      <div
        role="alert"
        className="flex items-center gap-2 rounded-card border border-teal-200 bg-teal-50/80 px-3.5 py-2 text-xs text-brand-teal-ink shadow-soft dark:border-teal-800/60 dark:bg-teal-950/40 dark:text-teal-200"
      >
        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-module-health" />
        <p>Awareness screening only · Consult a physician for medical advice.</p>
      </div>

      {/* Header + Form */}
      <div className="rounded-card border border-slate-200 bg-white p-5 shadow-soft dark:border-slate-800 dark:bg-brand-surface sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-brand-teal-ink dark:bg-teal-950/50 dark:text-teal-300">
              Health Check
            </span>
            <h1 className="mt-2 font-display text-2xl font-bold text-brand-navy dark:text-white">
              Diabetes &amp; Heart Risk Check
            </h1>
            <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">
              Screen preventive health indicators.
            </p>
          </div>

          <div className="inline-flex rounded-xl bg-slate-100 p-1 dark:bg-brand-navy">
            <button
              type="button"
              onClick={() => {
                setActiveTab("diabetes");
                setError("");
                setResult(null);
              }}
              className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition ${
                activeTab === "diabetes"
                  ? "bg-white text-brand-navy shadow-sm dark:bg-brand-surface dark:text-white"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              }`}
            >
              <Droplets className="h-4 w-4 text-module-health" />
              Diabetes
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab("heart");
                setError("");
                setResult(null);
              }}
              className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition ${
                activeTab === "heart"
                  ? "bg-white text-brand-navy shadow-sm dark:bg-brand-surface dark:text-white"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              }`}
            >
              <HeartPulse className="h-4 w-4 text-module-health" />
              Heart Disease
            </button>
          </div>
        </div>

        {/* Presets */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
            <Sparkles className="h-3.5 w-3.5 text-module-health" />
            Samples:
          </span>
          {(activeTab === "diabetes" ? DIABETES_SAMPLES : HEART_SAMPLES).map((sample) => (
            <button
              key={sample.label}
              type="button"
              onClick={() =>
                activeTab === "diabetes"
                  ? setDiabetesForm(sample.form)
                  : setHeartForm(sample.form)
              }
              className="rounded-lg border border-slate-200 bg-brand-offwhite px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-brand-navy dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {sample.label}
            </button>
          ))}
        </div>

        {/* Form */}
        <form onSubmit={handleScreen} className="mt-4 space-y-4">
          {activeTab === "diabetes" ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label htmlFor="dPreg" className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Pregnancies (count)
                </label>
                <input
                  id="dPreg"
                  type="number"
                  min={0}
                  max={20}
                  required
                  value={diabetesForm.Pregnancies}
                  onChange={(e) =>
                    setDiabetesForm({ ...diabetesForm, Pregnancies: e.target.value })
                  }
                  className="font-numeric mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-teal focus:ring-2 focus:ring-brand-teal/20"
                />
              </div>

              <div>
                <label htmlFor="dGlu" className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Plasma Glucose (mg/dL, optional)
                </label>
                <input
                  id="dGlu"
                  type="number"
                  step="any"
                  min={20}
                  max={400}
                  value={diabetesForm.Glucose}
                  onChange={(e) =>
                    setDiabetesForm({ ...diabetesForm, Glucose: e.target.value })
                  }
                  placeholder="Imputed if blank"
                  className="font-numeric mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-teal focus:ring-2 focus:ring-brand-teal/20"
                />
              </div>

              <div>
                <label htmlFor="dBP" className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Diastolic BP (mm Hg, optional)
                </label>
                <input
                  id="dBP"
                  type="number"
                  step="any"
                  min={20}
                  max={200}
                  value={diabetesForm.BloodPressure}
                  onChange={(e) =>
                    setDiabetesForm({ ...diabetesForm, BloodPressure: e.target.value })
                  }
                  placeholder="Imputed if blank"
                  className="font-numeric mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-teal focus:ring-2 focus:ring-brand-teal/20"
                />
              </div>

              <div>
                <label htmlFor="dSkin" className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Skin Thickness (mm, optional)
                </label>
                <input
                  id="dSkin"
                  type="number"
                  step="any"
                  min={1}
                  max={120}
                  value={diabetesForm.SkinThickness}
                  onChange={(e) =>
                    setDiabetesForm({ ...diabetesForm, SkinThickness: e.target.value })
                  }
                  placeholder="Imputed if blank"
                  className="font-numeric mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-teal focus:ring-2 focus:ring-brand-teal/20"
                />
              </div>

              <div>
                <label htmlFor="dIns" className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Serum Insulin (mu U/ml, optional)
                </label>
                <input
                  id="dIns"
                  type="number"
                  step="any"
                  min={1}
                  max={900}
                  value={diabetesForm.Insulin}
                  onChange={(e) =>
                    setDiabetesForm({ ...diabetesForm, Insulin: e.target.value })
                  }
                  placeholder="Imputed if blank"
                  className="font-numeric mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-teal focus:ring-2 focus:ring-brand-teal/20"
                />
              </div>

              <div>
                <label htmlFor="dBmi" className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                  BMI (kg/m², optional)
                </label>
                <input
                  id="dBmi"
                  type="number"
                  step="0.1"
                  min={10}
                  max={80}
                  value={diabetesForm.BMI}
                  onChange={(e) =>
                    setDiabetesForm({ ...diabetesForm, BMI: e.target.value })
                  }
                  placeholder="Imputed if blank"
                  className="font-numeric mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-teal focus:ring-2 focus:ring-brand-teal/20"
                />
              </div>

              <div>
                <label htmlFor="dDpf" className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Diabetes Pedigree Function
                </label>
                <input
                  id="dDpf"
                  type="number"
                  step="0.01"
                  min={0.01}
                  max={3.5}
                  required
                  value={diabetesForm.DiabetesPedigreeFunction}
                  onChange={(e) =>
                    setDiabetesForm({
                      ...diabetesForm,
                      DiabetesPedigreeFunction: e.target.value,
                    })
                  }
                  className="font-numeric mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-teal focus:ring-2 focus:ring-brand-teal/20"
                />
              </div>

              <div>
                <label htmlFor="dAge" className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Age (years)
                </label>
                <input
                  id="dAge"
                  type="number"
                  min={18}
                  max={110}
                  required
                  value={diabetesForm.Age}
                  onChange={(e) =>
                    setDiabetesForm({ ...diabetesForm, Age: e.target.value })
                  }
                  className="font-numeric mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-teal focus:ring-2 focus:ring-brand-teal/20"
                />
              </div>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label htmlFor="hAge" className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Age (years)
                </label>
                <input
                  id="hAge"
                  type="number"
                  min={18}
                  max={110}
                  required
                  value={heartForm.age}
                  onChange={(e) => setHeartForm({ ...heartForm, age: e.target.value })}
                  className="font-numeric mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-teal focus:ring-2 focus:ring-brand-teal/20"
                />
              </div>

              <div>
                <label htmlFor="hSex" className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Biological Sex
                </label>
                <select
                  id="hSex"
                  value={heartForm.sex}
                  onChange={(e) => setHeartForm({ ...heartForm, sex: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-teal focus:ring-2 focus:ring-brand-teal/20"
                >
                  <option value={1}>1 - Male</option>
                  <option value={0}>0 - Female</option>
                </select>
              </div>

              <div>
                <label htmlFor="hCp" className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Chest Pain Type (cp)
                </label>
                <select
                  id="hCp"
                  value={heartForm.cp}
                  onChange={(e) => setHeartForm({ ...heartForm, cp: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-teal focus:ring-2 focus:ring-brand-teal/20"
                >
                  {(
                    options?.heart?.cp_choices || [
                      { value: 1, label: "1 - Typical Angina" },
                      { value: 2, label: "2 - Atypical Angina" },
                      { value: 3, label: "3 - Non-anginal Pain" },
                      { value: 4, label: "4 - Asymptomatic" },
                    ]
                  ).map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="hBp" className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Resting BP (mm Hg)
                </label>
                <input
                  id="hBp"
                  type="number"
                  min={60}
                  max={250}
                  required
                  value={heartForm.trestbps}
                  onChange={(e) => setHeartForm({ ...heartForm, trestbps: e.target.value })}
                  className="font-numeric mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-teal focus:ring-2 focus:ring-brand-teal/20"
                />
              </div>

              <div>
                <label htmlFor="hChol" className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Serum Cholesterol (mg/dL)
                </label>
                <input
                  id="hChol"
                  type="number"
                  min={80}
                  max={650}
                  required
                  value={heartForm.chol}
                  onChange={(e) => setHeartForm({ ...heartForm, chol: e.target.value })}
                  className="font-numeric mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-teal focus:ring-2 focus:ring-brand-teal/20"
                />
              </div>

              <div>
                <label htmlFor="hFbs" className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Fasting Blood Sugar &gt; 120
                </label>
                <select
                  id="hFbs"
                  value={heartForm.fbs}
                  onChange={(e) => setHeartForm({ ...heartForm, fbs: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-teal focus:ring-2 focus:ring-brand-teal/20"
                >
                  <option value={0}>0 - False (&lt;=120 mg/dL)</option>
                  <option value={1}>1 - True (&gt;120 mg/dL)</option>
                </select>
              </div>

              <div>
                <label htmlFor="hEcg" className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Resting ECG
                </label>
                <select
                  id="hEcg"
                  value={heartForm.restecg}
                  onChange={(e) => setHeartForm({ ...heartForm, restecg: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-teal focus:ring-2 focus:ring-brand-teal/20"
                >
                  {(
                    options?.heart?.restecg_choices || [
                      { value: 0, label: "0 - Normal" },
                      { value: 1, label: "1 - ST-T Wave Abnormality" },
                      { value: 2, label: "2 - Left Ventricular Hypertrophy" },
                    ]
                  ).map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="hThalach" className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Max Heart Rate (thalach)
                </label>
                <input
                  id="hThalach"
                  type="number"
                  min={50}
                  max={230}
                  required
                  value={heartForm.thalach}
                  onChange={(e) => setHeartForm({ ...heartForm, thalach: e.target.value })}
                  className="font-numeric mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-teal focus:ring-2 focus:ring-brand-teal/20"
                />
              </div>

              <div>
                <label htmlFor="hExang" className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Exercise Induced Angina
                </label>
                <select
                  id="hExang"
                  value={heartForm.exang}
                  onChange={(e) => setHeartForm({ ...heartForm, exang: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-teal focus:ring-2 focus:ring-brand-teal/20"
                >
                  <option value={0}>0 - No</option>
                  <option value={1}>1 - Yes</option>
                </select>
              </div>

              <div>
                <label htmlFor="hOldpeak" className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                  ST Depression (oldpeak)
                </label>
                <input
                  id="hOldpeak"
                  type="number"
                  step="0.1"
                  min={0}
                  max={8}
                  required
                  value={heartForm.oldpeak}
                  onChange={(e) => setHeartForm({ ...heartForm, oldpeak: e.target.value })}
                  className="font-numeric mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-teal focus:ring-2 focus:ring-brand-teal/20"
                />
              </div>

              <div>
                <label htmlFor="hSlope" className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Exercise ST Slope
                </label>
                <select
                  id="hSlope"
                  value={heartForm.slope}
                  onChange={(e) => setHeartForm({ ...heartForm, slope: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-teal focus:ring-2 focus:ring-brand-teal/20"
                >
                  {(
                    options?.heart?.slope_choices || [
                      { value: 1, label: "1 - Upsloping" },
                      { value: 2, label: "2 - Flat" },
                      { value: 3, label: "3 - Downsloping" },
                    ]
                  ).map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="hCa" className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Major Vessels (0–3, optional)
                </label>
                <select
                  id="hCa"
                  value={heartForm.ca}
                  onChange={(e) => setHeartForm({ ...heartForm, ca: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-teal focus:ring-2 focus:ring-brand-teal/20"
                >
                  <option value="">Unknown (impute in pipeline)</option>
                  <option value={0}>0 vessels</option>
                  <option value={1}>1 vessel</option>
                  <option value={2}>2 vessels</option>
                  <option value={3}>3 vessels</option>
                </select>
              </div>

              <div>
                <label htmlFor="hThal" className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Thallium Scan (optional)
                </label>
                <select
                  id="hThal"
                  value={heartForm.thal}
                  onChange={(e) => setHeartForm({ ...heartForm, thal: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-teal focus:ring-2 focus:ring-brand-teal/20"
                >
                  <option value="">Unknown (impute in pipeline)</option>
                  {(
                    options?.heart?.thal_choices || [
                      { value: 3, label: "3 - Normal" },
                      { value: 6, label: "6 - Fixed Defect" },
                      { value: 7, label: "7 - Reversible Defect" },
                    ]
                  ).map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
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
              Awareness score · not medical advice
            </span>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-control bg-brand-indigo px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-indigo-hover disabled:opacity-60 sm:w-auto"
            >
              <Activity className="h-4 w-4" />
              {loading
                ? "Checking..."
                : activeTab === "diabetes"
                ? "Check Diabetes Risk"
                : "Check Heart Risk"}
            </button>
          </div>
        </form>
      </div>

      {/* Results & Calibration Reliability Panels */}
      <div className="grid gap-6 lg:grid-cols-5">
        {/* Left: Risk Verdict or Waiting Prompt */}
        <div className="space-y-5 rounded-card border border-slate-200 bg-white p-5 shadow-soft dark:border-slate-800 dark:bg-brand-surface sm:p-6 lg:col-span-2">
          {result && tier ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-bold ${tier.badge}`}
                >
                  <TierIcon className="h-4 w-4" />
                  {tier.title}
                </span>
                <span className="font-numeric text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  {result.model_name}
                </span>
              </div>

              <div className="rounded-xl border border-slate-100 bg-brand-offwhite py-4 dark:border-slate-800 dark:bg-brand-navy/60">
                <SemicircleRiskGauge
                  percentage={result.calibrated_probability * 100}
                  label="Calibrated Probability"
                  verdictText={tier.title}
                  tone={tier.gaugeTone}
                  lowCut={Math.round(result.threshold_moderate * 100)}
                  highCut={Math.round(result.threshold_elevated * 100)}
                />
              </div>

              <div className="rounded-xl border border-teal-200 bg-teal-50/70 p-3 text-xs font-medium text-brand-teal-ink dark:border-teal-800/60 dark:bg-teal-950/40 dark:text-teal-200">
                {result.disclaimer}
              </div>

              <p className="rounded-xl bg-brand-offwhite p-3.5 text-sm leading-relaxed text-slate-700 dark:bg-brand-navy/60 dark:text-slate-300">
                {result.explanation_summary}
              </p>

              <FeedbackWidget
                key={result.prediction_id}
                predictionId={result.prediction_id}
                labelOptions={["accurate_screening", "false_alarm", "missed_risk"]}
                placeholderNote="e.g., confirmed normal HbA1c test"
              />
            </>
          ) : (
            <div className="flex h-full flex-col justify-center space-y-2 py-8 text-center">
              <HeartPulse className="mx-auto h-9 w-9 text-module-health" />
              <h2 className="font-display text-base font-semibold text-brand-navy dark:text-white">
                {activeTab === "diabetes" ? "Diabetes" : "Heart"} Screening
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Enter values or select a sample above to screen.
              </p>
            </div>
          )}
        </div>

        {/* Right: Feature Drivers + Calibration Reliability Curve */}
        <div className="space-y-6 rounded-card border border-slate-200 bg-white p-5 shadow-soft dark:border-slate-800 dark:bg-brand-surface sm:p-6 lg:col-span-3">
          {driverPlotData.length > 0 && (
            <div>
              <h2 className="font-display text-base font-bold text-brand-navy dark:text-white">
                Clinical Drivers
              </h2>
              <PlotlyChart
                data={driverPlotData}
                layout={{
                  margin: { l: 16, r: 20, t: 12, b: 36 },
                  xaxis: {
                    title: "Model Log-Odds / SHAP Contribution",
                    zeroline: true,
                    zerolinecolor: "#94a3b8",
                  },
                  yaxis: { automargin: true },
                }}
                className="mt-3 h-72 w-full"
              />
            </div>
          )}

          {calPlotData.length > 0 && (
            <div
              className={
                driverPlotData.length > 0 ? "border-t border-slate-100 pt-5 dark:border-slate-800" : ""
              }
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-display text-base font-bold text-brand-navy dark:text-white">
                    Calibration Curve
                  </h2>
                </div>
                <div className="flex gap-2 text-xs">
                  <span className="font-numeric rounded-lg bg-slate-100 px-2.5 py-1 font-semibold text-slate-700 dark:bg-brand-navy dark:text-slate-200">
                    Test Brier: {trackCal.brier_score?.toFixed(4)}
                  </span>
                  <span className="font-numeric rounded-lg bg-teal-50 px-2.5 py-1 font-semibold text-brand-teal-ink dark:bg-teal-950/50 dark:text-teal-300">
                    Test ROC-AUC: {trackCal.roc_auc?.toFixed(4)}
                  </span>
                </div>
              </div>
              <PlotlyChart
                data={calPlotData}
                layout={{
                  margin: { l: 45, r: 16, t: 16, b: 54 },
                  xaxis: { title: "Mean Predicted Probability", range: [0, 1] },
                  yaxis: { title: "Fraction of Positives", range: [0, 1] },
                  legend: { orientation: "h", y: -0.3, x: 0 },
                }}
                className="mt-2 h-72 w-full"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
