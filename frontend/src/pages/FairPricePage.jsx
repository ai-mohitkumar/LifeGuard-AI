import { useEffect, useState } from "react";
import { Bike, Car, IndianRupee, Sparkles, TrendingUp } from "lucide-react";
import { priceApi } from "../api/client";
import FeedbackWidget from "../components/FeedbackWidget";
import PlotlyChart from "../components/PlotlyChart";

const CAR_SAMPLES = [
  {
    label: "Budget Sedan",
    form: {
      name: "Maruti Swift Dzire VDI",
      year: 2016,
      km_driven: 55000,
      fuel: "Diesel",
      seller_type: "Individual",
      transmission: "Manual",
      owner: "First Owner",
    },
  },
  {
    label: "Mid-Range SUV",
    form: {
      name: "Hyundai Creta 1.6 CRDi SX",
      year: 2018,
      km_driven: 35000,
      fuel: "Diesel",
      seller_type: "Dealer",
      transmission: "Manual",
      owner: "First Owner",
    },
  },
  {
    label: "Luxury Automatic",
    form: {
      name: "BMW 3 Series 320d Luxury Line",
      year: 2017,
      km_driven: 42000,
      fuel: "Diesel",
      seller_type: "Dealer",
      transmission: "Automatic",
      owner: "First Owner",
    },
  },
];

const BIKE_SAMPLES = [
  {
    label: "Commuter (No Ex-Showroom)",
    form: {
      name: "Hero Honda Splendor Plus",
      year: 2014,
      km_driven: 42000,
      seller_type: "Individual",
      owner: "1st owner",
      ex_showroom_price: "",
    },
  },
  {
    label: "Street 150cc",
    form: {
      name: "Bajaj Pulsar 150",
      year: 2018,
      km_driven: 18000,
      seller_type: "Individual",
      owner: "1st owner",
      ex_showroom_price: "85000",
    },
  },
  {
    label: "Cruiser 350cc",
    form: {
      name: "Royal Enfield Classic 350",
      year: 2019,
      km_driven: 12000,
      seller_type: "Individual",
      owner: "1st owner",
      ex_showroom_price: "165000",
    },
  },
];

const DEFAULT_OPTIONS = {
  car: {
    fuels: ["Petrol", "Diesel", "CNG", "LPG", "Electric"],
    seller_types: ["Individual", "Dealer", "Trustmark Dealer"],
    transmissions: ["Manual", "Automatic"],
    owners: ["First Owner", "Second Owner", "Third Owner", "Fourth & Above Owner", "Test Drive Car"],
    sample_names: [],
  },
  bike: {
    seller_types: ["Individual", "Dealer"],
    owners: ["1st owner", "2nd owner", "3rd owner", "4th owner"],
    sample_names: [],
  },
};

function formatInr(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value));
}

export default function FairPricePage() {
  const [activeTab, setActiveTab] = useState("car"); // "car" | "bike"
  const [options, setOptions] = useState(DEFAULT_OPTIONS);
  const [carForm, setCarForm] = useState(CAR_SAMPLES[0].form);
  const [bikeForm, setBikeForm] = useState(BIKE_SAMPLES[2].form);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  useEffect(() => {
    priceApi
      .getOptions()
      .then((data) => {
        if (data?.car && data?.bike) setOptions(data);
      })
      .catch(() => {
        // Fall back gracefully to DEFAULT_OPTIONS if options fail transiently.
      });
  }, []);

  async function handleEstimate(event) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response =
        activeTab === "car"
          ? await priceApi.predictCar({
              ...carForm,
              year: Number(carForm.year),
              km_driven: Number(carForm.km_driven),
            })
          : await priceApi.predictBike({
              ...bikeForm,
              year: Number(bikeForm.year),
              km_driven: Number(bikeForm.km_driven),
              ex_showroom_price:
                bikeForm.ex_showroom_price === "" || bikeForm.ex_showroom_price === null
                  ? null
                  : Number(bikeForm.ex_showroom_price),
            });
      setResult(response);
    } catch (err) {
      setError(err.message || "Fair price estimation failed.");
    } finally {
      setLoading(false);
    }
  }

  const contributorsReversed = result?.top_contributors
    ? [...result.top_contributors].reverse()
    : [];

  const plotData = contributorsReversed.length
    ? [
        {
          type: "bar",
          orientation: "h",
          x: contributorsReversed.map((c) => c.contribution_inr),
          y: contributorsReversed.map((c) => `${c.feature} (${c.value})`),
          marker: {
            color: contributorsReversed.map((c) =>
              c.direction === "increases_price" ? "#22C55E" : "#EF4444"
            ),
          },
          hovertemplate: "%{y}<br>SHAP impact: ₹%{x:+,.0f}<extra></extra>",
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      {/* Header + Mode Switch + Form */}
      <div className="rounded-card border border-slate-200 bg-white p-5 shadow-soft dark:border-slate-800 dark:bg-brand-surface sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-verdict-warn-ink dark:bg-amber-950/50 dark:text-amber-300">
              Fair Price
            </span>
            <h1 className="mt-2 font-display text-2xl font-bold text-brand-navy dark:text-white">
              Used Car &amp; Bike Value
            </h1>
            <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">
              Estimate fair resale value in INR.
            </p>
          </div>

          <div className="inline-flex rounded-xl bg-slate-100 p-1 dark:bg-brand-navy">
            <button
              type="button"
              onClick={() => {
                setActiveTab("car");
                setError("");
                setResult(null);
              }}
              className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition ${
                activeTab === "car"
                  ? "bg-white text-brand-navy shadow-sm dark:bg-brand-surface dark:text-white"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              }`}
            >
              <Car className="h-4 w-4 text-module-price" />
              Used Car
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab("bike");
                setError("");
                setResult(null);
              }}
              className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition ${
                activeTab === "bike"
                  ? "bg-white text-brand-navy shadow-sm dark:bg-brand-surface dark:text-white"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              }`}
            >
              <Bike className="h-4 w-4 text-module-price" />
              Used Bike
            </button>
          </div>
        </div>

        {/* Presets */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
            <Sparkles className="h-3.5 w-3.5 text-module-price" />
            Presets:
          </span>
          {(activeTab === "car" ? CAR_SAMPLES : BIKE_SAMPLES).map((sample) => (
            <button
              key={sample.label}
              type="button"
              onClick={() =>
                activeTab === "car" ? setCarForm(sample.form) : setBikeForm(sample.form)
              }
              className="rounded-lg border border-slate-200 bg-brand-offwhite px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-brand-navy dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {sample.label}
            </button>
          ))}
        </div>

        {/* Form */}
        <form onSubmit={handleEstimate} className="mt-4 space-y-4">
          {activeTab === "car" ? (
            <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
              <div className="sm:col-span-2 lg:col-span-2">
                <label htmlFor="carName" className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Car Make, Model &amp; Variant
                </label>
                <input
                  id="carName"
                  list="carNamesList"
                  type="text"
                  required
                  value={carForm.name}
                  onChange={(e) => setCarForm({ ...carForm, name: e.target.value })}
                  placeholder="e.g., Maruti Swift Dzire VDI"
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm outline-none focus:border-brand-indigo focus:ring-2 focus:ring-brand-indigo/20"
                />
                <datalist id="carNamesList">
                  {(options.car?.sample_names || []).map((n) => (
                    <option key={n} value={n} />
                  ))}
                </datalist>
              </div>

              <div>
                <label htmlFor="carYear" className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Manufacture Year
                </label>
                <input
                  id="carYear"
                  type="number"
                  min={1985}
                  max={2030}
                  required
                  value={carForm.year}
                  onChange={(e) => setCarForm({ ...carForm, year: e.target.value })}
                  className="font-numeric mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm outline-none focus:border-brand-indigo focus:ring-2 focus:ring-brand-indigo/20"
                />
              </div>

              <div>
                <label htmlFor="carKm" className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Kilometers Driven
                </label>
                <input
                  id="carKm"
                  type="number"
                  min={0}
                  max={1000000}
                  required
                  value={carForm.km_driven}
                  onChange={(e) => setCarForm({ ...carForm, km_driven: e.target.value })}
                  className="font-numeric mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm outline-none focus:border-brand-indigo focus:ring-2 focus:ring-brand-indigo/20"
                />
              </div>

              <div>
                <label htmlFor="carFuel" className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Fuel Type
                </label>
                <select
                  id="carFuel"
                  value={carForm.fuel}
                  onChange={(e) => setCarForm({ ...carForm, fuel: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-indigo focus:ring-2 focus:ring-brand-indigo/20"
                >
                  {(options.car?.fuels || DEFAULT_OPTIONS.car.fuels).map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="carTrans" className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Transmission
                </label>
                <select
                  id="carTrans"
                  value={carForm.transmission}
                  onChange={(e) => setCarForm({ ...carForm, transmission: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-indigo focus:ring-2 focus:ring-brand-indigo/20"
                >
                  {(options.car?.transmissions || DEFAULT_OPTIONS.car.transmissions).map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="carSeller" className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Seller Type
                </label>
                <select
                  id="carSeller"
                  value={carForm.seller_type}
                  onChange={(e) => setCarForm({ ...carForm, seller_type: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-indigo focus:ring-2 focus:ring-brand-indigo/20"
                >
                  {(options.car?.seller_types || DEFAULT_OPTIONS.car.seller_types).map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="carOwner" className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Ownership History
                </label>
                <select
                  id="carOwner"
                  value={carForm.owner}
                  onChange={(e) => setCarForm({ ...carForm, owner: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-indigo focus:ring-2 focus:ring-brand-indigo/20"
                >
                  {(options.car?.owners || DEFAULT_OPTIONS.car.owners).map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="sm:col-span-2 lg:col-span-2">
                <label htmlFor="bikeName" className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Bike / Scooter Make &amp; Model
                </label>
                <input
                  id="bikeName"
                  list="bikeNamesList"
                  type="text"
                  required
                  value={bikeForm.name}
                  onChange={(e) => setBikeForm({ ...bikeForm, name: e.target.value })}
                  placeholder="e.g., Royal Enfield Classic 350"
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm outline-none focus:border-brand-indigo focus:ring-2 focus:ring-brand-indigo/20"
                />
                <datalist id="bikeNamesList">
                  {(options.bike?.sample_names || []).map((n) => (
                    <option key={n} value={n} />
                  ))}
                </datalist>
              </div>

              <div>
                <label htmlFor="bikeYear" className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Manufacture Year
                </label>
                <input
                  id="bikeYear"
                  type="number"
                  min={1985}
                  max={2030}
                  required
                  value={bikeForm.year}
                  onChange={(e) => setBikeForm({ ...bikeForm, year: e.target.value })}
                  className="font-numeric mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm outline-none focus:border-brand-indigo focus:ring-2 focus:ring-brand-indigo/20"
                />
              </div>

              <div>
                <label htmlFor="bikeKm" className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Kilometers Driven
                </label>
                <input
                  id="bikeKm"
                  type="number"
                  min={0}
                  max={500000}
                  required
                  value={bikeForm.km_driven}
                  onChange={(e) => setBikeForm({ ...bikeForm, km_driven: e.target.value })}
                  className="font-numeric mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm outline-none focus:border-brand-indigo focus:ring-2 focus:ring-brand-indigo/20"
                />
              </div>

              <div>
                <label htmlFor="bikeExShowroom" className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Original Ex-Showroom Price (₹, optional)
                </label>
                <input
                  id="bikeExShowroom"
                  type="number"
                  min={10000}
                  max={5000000}
                  value={bikeForm.ex_showroom_price}
                  onChange={(e) =>
                    setBikeForm({ ...bikeForm, ex_showroom_price: e.target.value })
                  }
                  placeholder="Leave blank to impute in pipeline"
                  className="font-numeric mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm outline-none focus:border-brand-indigo focus:ring-2 focus:ring-brand-indigo/20"
                />
              </div>

              <div>
                <label htmlFor="bikeSeller" className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Seller Type
                </label>
                <select
                  id="bikeSeller"
                  value={bikeForm.seller_type}
                  onChange={(e) => setBikeForm({ ...bikeForm, seller_type: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-indigo focus:ring-2 focus:ring-brand-indigo/20"
                >
                  {(options.bike?.seller_types || DEFAULT_OPTIONS.bike.seller_types).map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="bikeOwner" className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Ownership History
                </label>
                <select
                  id="bikeOwner"
                  value={bikeForm.owner}
                  onChange={(e) => setBikeForm({ ...bikeForm, owner: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-indigo focus:ring-2 focus:ring-brand-indigo/20"
                >
                  {(options.bike?.owners || DEFAULT_OPTIONS.bike.owners).map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
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
              INR market estimate &amp; range
            </span>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-control bg-brand-indigo px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-indigo-hover disabled:opacity-60 sm:w-auto"
            >
              <IndianRupee className="h-4 w-4" />
              {loading
                ? "Checking..."
                : activeTab === "car"
                ? "Check Car Price"
                : "Check Bike Price"}
            </button>
          </div>
        </form>
      </div>

      {/* Valuation Output + SHAP Drivers */}
      {result && (
        <div className="grid gap-6 lg:grid-cols-5">
          {/* Left: Estimate & Features & Feedback */}
          <div className="space-y-5 rounded-card border border-slate-200 bg-white p-5 shadow-soft dark:border-slate-800 dark:bg-brand-surface sm:p-6 lg:col-span-2">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-green-200 bg-green-100 px-3 py-1 text-xs font-bold uppercase text-verdict-safe-ink dark:border-green-800/60 dark:bg-green-950/50 dark:text-green-300">
                <TrendingUp className="h-3.5 w-3.5" />
                {result.sub_model} Valuation
              </span>
              <span className="font-numeric text-xs font-medium text-slate-500 dark:text-slate-400">
                {result.model_name} (v{result.model_version})
              </span>
            </div>

            <div className="rounded-xl border border-slate-100 bg-brand-offwhite p-4 dark:border-slate-800 dark:bg-brand-navy/60">
              <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Estimated Fair Market Resale Price
              </span>
              <div className="mt-1 font-numeric text-3xl font-extrabold tracking-tight text-brand-navy dark:text-white">
                {formatInr(result.predicted_price_inr)}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                <span className="font-numeric rounded-md bg-white px-2 py-1 font-medium text-slate-800 shadow-sm dark:bg-brand-surface dark:text-slate-100">
                  Expected Range: {formatInr(result.price_range_low_inr)} –{" "}
                  {formatInr(result.price_range_high_inr)}
                </span>
                <span className="font-numeric text-slate-500 dark:text-slate-400">
                  (± {formatInr(result.uncertainty_mae_inr)} test MAE)
                </span>
              </div>
              <p className="font-numeric mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                Dataset SHAP baseline before vehicle traits: {formatInr(result.baseline_price_inr)}
              </p>
            </div>

            <p className="rounded-xl bg-brand-offwhite p-3.5 text-sm leading-relaxed text-slate-700 dark:bg-brand-navy/60 dark:text-slate-300">
              {result.explanation_summary}
            </p>

            {result.extracted_features && (
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Pipeline-Engineered Features
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {Object.entries(result.extracted_features).map(([k, v]) => (
                    <div
                      key={k}
                      className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 bg-brand-offwhite px-2.5 py-1.5 dark:border-slate-800 dark:bg-brand-navy/60"
                    >
                      <span className="truncate text-slate-600 dark:text-slate-300">{k}</span>
                      <span className="font-numeric font-semibold text-brand-navy dark:text-white">
                        {v === null ? "Imputed" : v}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <FeedbackWidget
              key={result.prediction_id}
              predictionId={result.prediction_id}
              labelOptions={["fair_estimate", "overestimated", "underestimated"]}
              placeholderNote="e.g., dealer offered ₹4,95,000"
            />
          </div>

          {/* Right: SHAP Valuation Breakdown */}
          <div className="rounded-card border border-slate-200 bg-white p-5 shadow-soft dark:border-slate-800 dark:bg-brand-surface sm:p-6 lg:col-span-3">
            <h2 className="font-display text-base font-bold text-brand-navy dark:text-white">
              Top SHAP Feature Contributions (INR Impact)
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Green bars increase estimated value above the dataset baseline; coral bars represent
              depreciation or lower-tier downward adjustments.
            </p>

            {plotData.length > 0 ? (
              <PlotlyChart
                data={plotData}
                layout={{
                  margin: { l: 16, r: 20, t: 16, b: 44 },
                  xaxis: {
                    title: "SHAP Valuation Shift (INR)",
                    zeroline: true,
                    zerolinecolor: "#94a3b8",
                  },
                  yaxis: { automargin: true },
                }}
                className="mt-4 h-80 w-full"
              />
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
