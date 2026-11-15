import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Calendar,
  CloudRain,
  Globe,
  MapPin,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Thermometer,
  Wind,
} from "lucide-react";
import { aqiApi } from "../api/client";
import FeedbackWidget from "../components/FeedbackWidget";
import PlotlyChart from "../components/PlotlyChart";
import { useTheme } from "../context/ThemeContext";

const FALLBACK_PRESETS = [
  {
    label: "Clean Coastal (Kochi / Kerala)",
    form: {
      state: "Kerala",
      station: "Vyttila Kochi Kerala PCB",
      date: "2026-11-11",
      AQI: 46,
      "PM2.5": 22,
      PM10: 44,
      SO2: 5,
      NO2: 18,
      CO_mg: 0.4,
      O3: 58,
      TEMP: 28.4,
      PRES: 1011,
      DEWP: 23.1,
      RAIN: 2.4,
      WSPM: 3.1,
      aqi_lag1: 48,
      aqi_roll3_mean: 47,
      aqi_roll7_mean: 49,
      wspm_roll3_mean: 2.9,
    },
  },
  {
    label: "Moderate Metro (Mumbai)",
    form: {
      state: "Maharashtra",
      station: "Bandra Kurla Complex Mumbai MPCB",
      date: "2026-11-11",
      AQI: 138,
      "PM2.5": 68,
      PM10: 118,
      SO2: 14,
      NO2: 46,
      CO_mg: 1.1,
      O3: 68,
      TEMP: 29.2,
      PRES: 1012,
      DEWP: 19.5,
      RAIN: 0,
      WSPM: 2.2,
      aqi_lag1: 130,
      aqi_roll3_mean: 132,
      aqi_roll7_mean: 126,
      wspm_roll3_mean: 2.4,
    },
  },
  {
    label: "Winter Haze (Delhi)",
    form: {
      state: "Delhi",
      station: "ITO Delhi CPCB",
      date: "2026-11-11",
      AQI: 326,
      "PM2.5": 174,
      PM10: 248,
      SO2: 24,
      NO2: 78,
      CO_mg: 2.4,
      O3: 52,
      TEMP: 19.5,
      PRES: 1016,
      DEWP: 11.2,
      RAIN: 0,
      WSPM: 1.1,
      aqi_lag1: 308,
      aqi_roll3_mean: 296,
      aqi_roll7_mean: 274,
      wspm_roll3_mean: 1.3,
    },
  },
];

const CATEGORY_STYLES = {
  Good: "bg-green-100 text-verdict-safe-ink border-green-200 dark:bg-green-950/50 dark:text-green-300 dark:border-green-800/60",
  Satisfactory:
    "bg-teal-50 text-brand-teal-ink border-teal-200 dark:bg-teal-950/50 dark:text-teal-300 dark:border-teal-800/60",
  Moderate:
    "bg-amber-100 text-verdict-warn-ink border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800/60",
  Poor: "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-950/50 dark:text-orange-300 dark:border-orange-800/60",
  "Very Poor":
    "bg-red-100 text-verdict-danger-ink border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-800/60",
  Severe:
    "bg-red-100 text-verdict-danger-ink border-red-300 dark:bg-red-950/60 dark:text-red-200 dark:border-red-700",
};

const CATEGORY_COLORS = ["#22C55E", "#14B8A6", "#F59E0B", "#F97316", "#EF4444", "#B91C1C"];

function aqiBarColor(aqi) {
  if (aqi <= 50) return "#22C55E";
  if (aqi <= 100) return "#14B8A6";
  if (aqi <= 200) return "#F59E0B";
  if (aqi <= 300) return "#F97316";
  if (aqi <= 400) return "#EF4444";
  return "#B91C1C";
}

function normalizeFormSnapshot(snapshot, fallbackStation = "", fallbackState = "") {
  return {
    state: snapshot?.state ?? fallbackState,
    station: snapshot?.station ?? fallbackStation,
    date: snapshot?.date ?? "2026-11-11",
    AQI: snapshot?.AQI ?? 120,
    "PM2.5": snapshot?.["PM2.5"] ?? "",
    PM10: snapshot?.PM10 ?? 95,
    SO2: snapshot?.SO2 ?? "",
    NO2: snapshot?.NO2 ?? "",
    CO_mg: snapshot?.CO_mg ?? "",
    O3: snapshot?.O3 ?? "",
    TEMP: snapshot?.TEMP ?? 24,
    PRES: snapshot?.PRES ?? 1013,
    DEWP: snapshot?.DEWP ?? 14,
    RAIN: snapshot?.RAIN ?? 0,
    WSPM: snapshot?.WSPM ?? 2.0,
    aqi_lag1: snapshot?.aqi_lag1 ?? "",
    aqi_roll3_mean: snapshot?.aqi_roll3_mean ?? "",
    aqi_roll7_mean: snapshot?.aqi_roll7_mean ?? "",
    wspm_roll3_mean: snapshot?.wspm_roll3_mean ?? "",
  };
}

export default function AirAwarePage() {
  const { isDark } = useTheme();
  const [viewMode, setViewMode] = useState("station"); // "station" | "india"
  const [options, setOptions] = useState(null);
  const [overview, setOverview] = useState(null);
  const [overviewLoading, setOverviewLoading] = useState(false);

  const [selectedState, setSelectedState] = useState("Delhi");
  const [form, setForm] = useState(FALLBACK_PRESETS[2].form);
  const [loading, setLoading] = useState(false);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveBadge, setLiveBadge] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  // All-India Outlook filters
  const [indiaStateFilter, setIndiaStateFilter] = useState("ALL");
  const [indiaSearch, setIndiaSearch] = useState("");
  const [showAllRows, setShowAllRows] = useState(false);

  useEffect(() => {
    aqiApi
      .getOptions()
      .then((data) => {
        setOptions(data);
        const dir = data?.stations_directory || [];
        if (dir.length > 0) {
          const defaultRec =
            dir.find((r) => r.state === "Delhi" && r.station.includes("ITO")) ||
            dir.find((r) => r.state === "Delhi") ||
            dir[0];
          setSelectedState(defaultRec.state);
          if (defaultRec.sample_snapshot) {
            setForm(
              normalizeFormSnapshot(
                defaultRec.sample_snapshot,
                defaultRec.station,
                defaultRec.state
              )
            );
          }
        }
      })
      .catch(() => {
        // Fallback presets remain usable cleanly
      });

    setOverviewLoading(true);
    aqiApi
      .getIndiaOverview()
      .then((data) => setOverview(data))
      .catch(() => {
        // Non-blocking; can retry on tab switch
      })
      .finally(() => setOverviewLoading(false));
  }, []);

  const stationsDirectory = options?.stations_directory || [];

  const statesList = useMemo(() => {
    if (options?.states?.length) {
      return options.states.map((s) => s.state);
    }
    const unique = Array.from(new Set(stationsDirectory.map((r) => r.state)));
    return unique.length ? unique.sort() : ["Delhi", "Maharashtra", "Karnataka", "Kerala"];
  }, [options, stationsDirectory]);

  const stationsInSelectedState = useMemo(() => {
    const filtered = stationsDirectory.filter((r) => r.state === selectedState);
    if (filtered.length > 0) {
      return filtered;
    }
    if (options?.stations?.length) {
      return options.stations.map((name) => ({ station: name, state: selectedState, city: "" }));
    }
    return [
      { station: "ITO Delhi CPCB", state: "Delhi", city: "Delhi" },
      { station: "Bandra Kurla Complex Mumbai MPCB", state: "Maharashtra", city: "Mumbai" },
      { station: "Vyttila Kochi KSPCB", state: "Kerala", city: "Kochi" },
    ];
  }, [stationsDirectory, selectedState, options]);

  function applyStationRecord(rec) {
    if (!rec) return;
    setSelectedState(rec.state || selectedState);
    setLiveBadge("");
    if (rec.sample_snapshot) {
      setForm(normalizeFormSnapshot(rec.sample_snapshot, rec.station, rec.state));
    } else {
      setForm((prev) => ({
        ...prev,
        state: rec.state || prev.state,
        station: rec.station,
      }));
    }
  }

  function handleStateChange(newState) {
    setSelectedState(newState);
    const matching = stationsDirectory.filter((r) => r.state === newState);
    if (matching.length > 0) {
      applyStationRecord(matching[0]);
    } else {
      setForm((prev) => ({ ...prev, state: newState }));
    }
  }

  function handleStationChange(newStationName) {
    const rec = stationsDirectory.find((r) => r.station === newStationName);
    if (rec) {
      applyStationRecord(rec);
    } else {
      setLiveBadge("");
      setForm((prev) => ({ ...prev, station: newStationName }));
    }
  }

  async function handleFetchLive() {
    if (!form.station) return;
    setError("");
    setLiveLoading(true);
    try {
      const res = await aqiApi.getStationLive(form.station, selectedState);
      if (res?.snapshot) {
        setForm(normalizeFormSnapshot(res.snapshot, res.station, res.state));
        setLiveBadge(
          res.source === "open-meteo-live"
            ? `Live Copernicus CAMS (${res.snapshot.date})`
            : `Cached CPCB/CAMS Snapshot (${res.snapshot.date})`
        );
      }
    } catch (err) {
      setError(err.message || "Could not fetch live station data.");
    } finally {
      setLiveLoading(false);
    }
  }

  async function submitForecastPayload(targetForm, targetState) {
    setError("");
    setLoading(true);
    try {
      const optNum = (v) => (v === "" || v === null || v === undefined ? null : Number(v));
      const response = await aqiApi.forecast({
        station: targetForm.station,
        state: targetForm.state || targetState,
        date: targetForm.date,
        AQI: Number(targetForm.AQI),
        "PM2.5": optNum(targetForm["PM2.5"]),
        PM10: Number(targetForm.PM10),
        SO2: optNum(targetForm.SO2),
        NO2: optNum(targetForm.NO2),
        CO_mg: optNum(targetForm.CO_mg),
        O3: optNum(targetForm.O3),
        TEMP: Number(targetForm.TEMP),
        PRES: Number(targetForm.PRES),
        DEWP: Number(targetForm.DEWP),
        RAIN: Number(targetForm.RAIN || 0),
        WSPM: Number(targetForm.WSPM),
        aqi_lag1: optNum(targetForm.aqi_lag1),
        aqi_roll3_mean: optNum(targetForm.aqi_roll3_mean),
        aqi_roll7_mean: optNum(targetForm.aqi_roll7_mean),
        wspm_roll3_mean: optNum(targetForm.wspm_roll3_mean),
      });
      setResult(response);
    } catch (err) {
      setError(err.message || "Next-day AQI forecast failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleForecast(event) {
    event.preventDefault();
    await submitForecastPayload(form, selectedState);
  }

  async function handleInspectFromIndiaTable(stationEntry) {
    const nextForm = normalizeFormSnapshot(
      stationEntry.sample_snapshot,
      stationEntry.station,
      stationEntry.state
    );
    setSelectedState(stationEntry.state);
    setForm(nextForm);
    setLiveBadge("");
    setViewMode("station");
    await submitForecastPayload(nextForm, stationEntry.state);
  }

  const categories = options?.categories || [
    "Good",
    "Satisfactory",
    "Moderate",
    "Poor",
    "Very Poor",
    "Severe",
  ];

  const contributorsReversed = result?.top_contributors
    ? [...result.top_contributors].reverse()
    : [];
  const shapPlotData = contributorsReversed.length
    ? [
        {
          type: "bar",
          orientation: "h",
          x: contributorsReversed.map((c) => c.contribution),
          y: contributorsReversed.map((c) => `${c.feature}`),
          marker: {
            color: contributorsReversed.map((c) =>
              c.direction === "increases_aqi" ? "#EF4444" : "#22C55E"
            ),
          },
          hovertemplate: "%{y}: %{x:+.2f} AQI points<extra></extra>",
        },
      ]
    : [];

  const probPlotData = result?.category_probabilities
    ? [
        {
          type: "bar",
          x: categories,
          y: categories.map((cat) => (result.category_probabilities[cat] || 0) * 100),
          marker: { color: CATEGORY_COLORS },
          hovertemplate: "%{x}: %{y:.1f}%<extra></extra>",
        },
      ]
    : [];

  const timeline =
    (options?.state_timelines && options.state_timelines[selectedState]) ||
    options?.timeline_sample;

  const timelineData = timeline
    ? [
        {
          type: "scatter",
          mode: "lines+markers",
          name: "Actual Next-Day AQI",
          x: timeline.dates,
          y: timeline.actual_next_day_aqi,
          line: { color: isDark ? "#F8FAFC" : "#0F172A", width: 2 },
          marker: { size: 5 },
        },
        {
          type: "scatter",
          mode: "lines+markers",
          name: "Chronological Forecast",
          x: timeline.dates,
          y: timeline.predicted_next_day_aqi,
          line: { color: "#0EA5E9", width: 2, dash: "dot" },
          marker: { size: 5 },
        },
      ]
    : [];

  const presetEntries = [
    ...FALLBACK_PRESETS,
    ...(options?.presets
      ? Object.entries(options.presets).map(([label, snap]) => ({
          label,
          form: snap,
        }))
      : []),
  ];

  // All-India Outlook derived metrics & filters
  const sortedStates = useMemo(() => {
    if (!overview?.states) return [];
    return [...overview.states].sort((a, b) => b.mean_predicted_aqi - a.mean_predicted_aqi);
  }, [overview]);

  const indiaStateChartData = useMemo(() => {
    if (!sortedStates.length) return [];
    const asc = [...sortedStates].reverse();
    const shortState = (st) =>
      st
        .replace("Dadra and Nagar Haveli and Daman and Diu", "DNH & DD")
        .replace("Andaman and Nicobar Islands", "A&N Islands");
    return [
      {
        type: "bar",
        orientation: "h",
        x: asc.map((s) => s.mean_predicted_aqi),
        y: asc.map((s) => `${shortState(s.state)} (${s.station_count})`),
        marker: {
          color: asc.map((s) => aqiBarColor(s.mean_predicted_aqi)),
        },
        customdata: asc.map((s) => [s.state, s.dominant_category, s.max_predicted_aqi, s.city_count]),
        hovertemplate:
          "<b>%{customdata[0]}</b><br>Avg Next-Day AQI: %{x:.1f} (%{customdata[1]})<br>Max Station: %{customdata[2]:.1f} across %{customdata[3]} cities<extra></extra>",
      },
    ];
  }, [sortedStates]);

  const filteredIndiaStations = useMemo(() => {
    const list = overview?.stations || [];
    const q = indiaSearch.trim().toLowerCase();
    return list
      .filter((item) => {
        if (indiaStateFilter !== "ALL" && item.state !== indiaStateFilter) return false;
        if (!q) return true;
        return (
          item.station.toLowerCase().includes(q) ||
          item.city.toLowerCase().includes(q) ||
          item.state.toLowerCase().includes(q) ||
          item.predicted_category.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.predicted_next_day_aqi - a.predicted_next_day_aqi);
  }, [overview, indiaStateFilter, indiaSearch]);

  const displayedStations = showAllRows
    ? filteredIndiaStations
    : filteredIndiaStations.slice(0, 60);

  const nationalAvgAqi = useMemo(() => {
    const list = overview?.stations || [];
    if (!list.length) return null;
    const sum = list.reduce((acc, item) => acc + item.predicted_next_day_aqi, 0);
    return (sum / list.length).toFixed(0);
  }, [overview]);

  const unhealthyStationsTotal = useMemo(() => {
    const list = overview?.stations || [];
    return list.filter((item) => item.unhealthy_alert).length;
  }, [overview]);

  const inputClass =
    "font-numeric mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-brand-navy outline-none focus:border-module-aqi focus:ring-2 focus:ring-module-aqi/20 dark:border-slate-700 dark:bg-brand-navy dark:text-slate-100";

  return (
    <div className="space-y-5">
      {/* Header + Mode Switcher */}
      <div className="rounded-card border border-slate-200 bg-white p-5 shadow-soft dark:border-slate-800 dark:bg-brand-surface sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-module-aqi-ink dark:bg-sky-950/50 dark:text-sky-300">
              Air Aware · India ({overview?.total_states || 36} States &amp; UTs ·{" "}
              {overview?.total_stations || stationsDirectory.length || 546} Stations)
            </span>
            <h1 className="mt-2 font-display text-2xl font-bold text-brand-navy dark:text-white">
              All-India Next-Day AQI Forecast
            </h1>
            <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">
              CPCB/SPCB station &amp; statewide air quality predictions across India.
            </p>
          </div>

          <div className="inline-flex self-start rounded-xl border border-slate-200 bg-brand-offwhite p-1 dark:border-slate-700 dark:bg-brand-navy">
            <button
              type="button"
              onClick={() => setViewMode("station")}
              className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
                viewMode === "station"
                  ? "bg-brand-indigo text-white shadow-sm"
                  : "text-slate-600 hover:text-brand-navy dark:text-slate-300 dark:hover:text-white"
              }`}
            >
              <MapPin className="h-3.5 w-3.5" />
              Station Forecast
            </button>
            <button
              type="button"
              onClick={() => setViewMode("india")}
              className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
                viewMode === "india"
                  ? "bg-brand-indigo text-white shadow-sm"
                  : "text-slate-600 hover:text-brand-navy dark:text-slate-300 dark:hover:text-white"
              }`}
            >
              <Globe className="h-3.5 w-3.5" />
              All-India Outlook
            </button>
          </div>
        </div>

        {viewMode === "station" && (
          <>
            {/* Presets */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                <Sparkles className="h-3.5 w-3.5 text-module-aqi" />
                Presets:
              </span>
              {presetEntries.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    const st = preset.form.state || selectedState;
                    setSelectedState(st);
                    setLiveBadge("");
                    setForm(normalizeFormSnapshot(preset.form, preset.form.station, st));
                  }}
                  className="rounded-lg border border-slate-200 bg-brand-offwhite px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-brand-navy dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <form onSubmit={handleForecast} className="mt-4 space-y-4">
              {/* State, Station, Date, Today's AQI & Pollutants */}
              <div>
                <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    <Calendar className="h-3.5 w-3.5 text-module-aqi" />
                    Indian Monitoring Station &amp; Pollutants
                  </h2>
                  <div className="flex items-center gap-2">
                    {liveBadge && (
                      <span className="rounded-full bg-teal-50 px-2.5 py-0.5 text-[11px] font-medium text-brand-teal-ink dark:bg-teal-950/50 dark:text-teal-300">
                        {liveBadge}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={handleFetchLive}
                      disabled={liveLoading}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-module-aqi-ink transition hover:bg-sky-100 disabled:opacity-60 dark:border-sky-800/60 dark:bg-sky-950/40 dark:text-sky-300"
                    >
                      <RefreshCw className={`h-3 w-3 ${liveLoading ? "animate-spin" : ""}`} />
                      {liveLoading ? "Fetching..." : "Live Data"}
                    </button>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                      State / Union Territory ({statesList.length})
                    </label>
                    <select
                      aria-label="State / Union Territory"
                      value={selectedState}
                      onChange={(e) => handleStateChange(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-brand-navy outline-none focus:border-module-aqi focus:ring-2 focus:ring-module-aqi/20 dark:border-slate-700 dark:bg-brand-navy dark:text-slate-100"
                    >
                      {statesList.map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-2 lg:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                      Monitoring Station ({stationsInSelectedState.length} in {selectedState})
                    </label>
                    <select
                      aria-label="Monitoring Station"
                      value={form.station}
                      onChange={(e) => handleStationChange(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-brand-navy outline-none focus:border-module-aqi focus:ring-2 focus:ring-module-aqi/20 dark:border-slate-700 dark:bg-brand-navy dark:text-slate-100"
                    >
                      {stationsInSelectedState.map((s) => (
                        <option key={s.station} value={s.station}>
                          {s.city ? `${s.station} (${s.city})` : s.station}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                      Date (Today)
                    </label>
                    <input
                      type="date"
                      required
                      value={form.date}
                      onChange={(e) => setForm({ ...form, date: e.target.value })}
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                      Today&apos;s AQI
                    </label>
                    <input
                      type="number"
                      step="any"
                      min={0}
                      max={500}
                      required
                      value={form.AQI}
                      onChange={(e) => setForm({ ...form, AQI: e.target.value })}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                      PM2.5 (µg/m³)
                    </label>
                    <input
                      type="number"
                      step="any"
                      min={0}
                      max={1000}
                      value={form["PM2.5"]}
                      onChange={(e) => setForm({ ...form, "PM2.5": e.target.value })}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                      PM10 (µg/m³)
                    </label>
                    <input
                      type="number"
                      step="any"
                      min={0}
                      max={1500}
                      required
                      value={form.PM10}
                      onChange={(e) => setForm({ ...form, PM10: e.target.value })}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                      NO2 / SO2 (µg/m³)
                    </label>
                    <div className="mt-1 grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        step="any"
                        min={0}
                        max={500}
                        value={form.NO2}
                        onChange={(e) => setForm({ ...form, NO2: e.target.value })}
                        placeholder="NO2"
                        className="font-numeric w-full rounded-xl border border-slate-300 bg-white px-2.5 py-2 text-sm text-brand-navy outline-none focus:border-module-aqi focus:ring-2 focus:ring-module-aqi/20 dark:border-slate-700 dark:bg-brand-navy dark:text-slate-100"
                      />
                      <input
                        type="number"
                        step="any"
                        min={0}
                        max={1000}
                        value={form.SO2}
                        onChange={(e) => setForm({ ...form, SO2: e.target.value })}
                        placeholder="SO2"
                        className="font-numeric w-full rounded-xl border border-slate-300 bg-white px-2.5 py-2 text-sm text-brand-navy outline-none focus:border-module-aqi focus:ring-2 focus:ring-module-aqi/20 dark:border-slate-700 dark:bg-brand-navy dark:text-slate-100"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                      CO (mg/m³) / Peak O3 (µg/m³)
                    </label>
                    <div className="mt-1 grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        step="0.1"
                        min={0}
                        max={50}
                        value={form.CO_mg}
                        onChange={(e) => setForm({ ...form, CO_mg: e.target.value })}
                        placeholder="CO"
                        className="font-numeric w-full rounded-xl border border-slate-300 bg-white px-2.5 py-2 text-sm text-brand-navy outline-none focus:border-module-aqi focus:ring-2 focus:ring-module-aqi/20 dark:border-slate-700 dark:bg-brand-navy dark:text-slate-100"
                      />
                      <input
                        type="number"
                        step="any"
                        min={0}
                        max={600}
                        value={form.O3}
                        onChange={(e) => setForm({ ...form, O3: e.target.value })}
                        placeholder="O3"
                        className="font-numeric w-full rounded-xl border border-slate-300 bg-white px-2.5 py-2 text-sm text-brand-navy outline-none focus:border-module-aqi focus:ring-2 focus:ring-module-aqi/20 dark:border-slate-700 dark:bg-brand-navy dark:text-slate-100"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Weather + Causal History */}
              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <h2 className="mb-2.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    <Thermometer className="h-3.5 w-3.5 text-module-aqi" />
                    Today&apos;s Meteorology
                  </h2>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                        Temp (°C)
                      </label>
                      <input
                        type="number"
                        step="any"
                        required
                        value={form.TEMP}
                        onChange={(e) => setForm({ ...form, TEMP: e.target.value })}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                        Dew Point (°C)
                      </label>
                      <input
                        type="number"
                        step="any"
                        required
                        value={form.DEWP}
                        onChange={(e) => setForm({ ...form, DEWP: e.target.value })}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                        Wind (m/s)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        min={0}
                        required
                        value={form.WSPM}
                        onChange={(e) => setForm({ ...form, WSPM: e.target.value })}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                        Pressure (hPa)
                      </label>
                      <input
                        type="number"
                        step="any"
                        required
                        value={form.PRES}
                        onChange={(e) => setForm({ ...form, PRES: e.target.value })}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                        Rain (mm)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        min={0}
                        value={form.RAIN}
                        onChange={(e) => setForm({ ...form, RAIN: e.target.value })}
                        className={inputClass}
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <h2 className="mb-2.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    <CloudRain className="h-3.5 w-3.5 text-module-aqi" />
                    Causal Past Context (Optional — imputed if omitted)
                  </h2>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                        Yesterday AQI (Lag 1)
                      </label>
                      <input
                        type="number"
                        step="any"
                        min={0}
                        max={500}
                        value={form.aqi_lag1}
                        onChange={(e) => setForm({ ...form, aqi_lag1: e.target.value })}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                        3-Day Avg AQI
                      </label>
                      <input
                        type="number"
                        step="any"
                        min={0}
                        max={500}
                        value={form.aqi_roll3_mean}
                        onChange={(e) => setForm({ ...form, aqi_roll3_mean: e.target.value })}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                        7-Day Avg AQI
                      </label>
                      <input
                        type="number"
                        step="any"
                        min={0}
                        max={500}
                        value={form.aqi_roll7_mean}
                        onChange={(e) => setForm({ ...form, aqi_roll7_mean: e.target.value })}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                        3-Day Avg Wind (m/s)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        min={0}
                        value={form.wspm_roll3_mean}
                        onChange={(e) => setForm({ ...form, wspm_roll3_mean: e.target.value })}
                        className={inputClass}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-verdict-danger-ink dark:border-red-800/60 dark:bg-red-950/40 dark:text-red-300">
                  {error}
                </div>
              )}

              <div className="sticky bottom-3 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/95 p-2.5 shadow-md backdrop-blur dark:border-slate-700 dark:bg-brand-surface/95 sm:px-4 sm:py-3 sm:shadow-soft">
                <span className="hidden text-xs text-slate-500 dark:text-slate-400 sm:inline">
                  {selectedState} · {form.station}
                </span>
                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-control bg-brand-indigo px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-indigo-hover disabled:opacity-60 sm:w-auto"
                >
                  <Wind className="h-4 w-4" />
                  {loading ? "Checking..." : "Check Next-Day AQI"}
                </button>
              </div>
            </form>
          </>
        )}
      </div>

      {/* View Mode: Station Forecast Results & Charts */}
      {viewMode === "station" ? (
        <div className="grid gap-6 lg:grid-cols-5">
          <div className="space-y-5 rounded-card border border-slate-200 bg-white p-6 shadow-soft dark:border-slate-800 dark:bg-brand-surface lg:col-span-2">
            {result ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${
                      CATEGORY_STYLES[result.predicted_category] ||
                      "bg-slate-100 text-slate-800 border-slate-200"
                    }`}
                  >
                    {result.unhealthy_alert ? (
                      <AlertTriangle className="h-3.5 w-3.5" />
                    ) : (
                      <ShieldCheck className="h-3.5 w-3.5" />
                    )}
                    Tomorrow: {result.predicted_category}
                  </span>
                  <span className="font-numeric text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    v{result.model_version}
                  </span>
                </div>

                <div className="rounded-xl border border-slate-100 bg-brand-offwhite p-4 dark:border-slate-800 dark:bg-brand-navy/60">
                  <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Predicted Next-Day Numeric AQI
                  </span>
                  <div className="mt-1 flex items-baseline gap-3">
                    <span className="font-numeric text-4xl font-extrabold text-brand-navy dark:text-white">
                      {result.predicted_next_day_aqi.toFixed(0)}
                    </span>
                    <span className="font-numeric text-xs text-slate-600 dark:text-slate-300">
                      Range: {result.aqi_range_low.toFixed(0)}–{result.aqi_range_high.toFixed(0)}{" "}
                      (±{result.uncertainty_mae.toFixed(0)} MAE)
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-300">
                    Poor/Very-Poor/Severe risk probability:{" "}
                    <strong className="font-numeric">
                      {(result.unhealthy_probability * 100).toFixed(1)}%
                    </strong>{" "}
                    {result.unhealthy_alert ? "(Unhealthy Alert Triggered)" : "(Below Alert Cutoff)"}
                  </p>
                </div>

                {/* Actionable Health Advisory */}
                <div className="space-y-2 rounded-xl border border-sky-200 bg-sky-50/60 p-4 text-xs dark:border-sky-800/50 dark:bg-sky-950/30">
                  <h3 className="font-display font-bold uppercase tracking-wide text-module-aqi-ink dark:text-sky-300">
                    Health Advisory — {result.health_advice.risk_level}
                  </h3>
                  <p className="text-slate-700 dark:text-slate-200">
                    <strong>General Public:</strong> {result.health_advice.general_public}
                  </p>
                  <p className="text-slate-700 dark:text-slate-200">
                    <strong>Sensitive Groups:</strong> {result.health_advice.sensitive_groups}
                  </p>
                  <p className="text-slate-700 dark:text-slate-200">
                    <strong>Outdoor Activity:</strong> {result.health_advice.outdoor_activity}
                  </p>
                  <p className="text-slate-700 dark:text-slate-200">
                    <strong>Mask Guidance:</strong> {result.health_advice.mask_guidance}
                  </p>
                  {result.health_advice.alert_note && (
                    <p className="font-semibold text-verdict-warn-ink dark:text-amber-300">
                      {result.health_advice.alert_note}
                    </p>
                  )}
                </div>

                <p className="rounded-xl bg-brand-offwhite p-3 text-xs leading-relaxed text-slate-700 dark:bg-brand-navy/60 dark:text-slate-300">
                  {result.explanation_summary}
                </p>

                <FeedbackWidget
                  key={result.prediction_id}
                  predictionId={result.prediction_id}
                  labelOptions={["accurate_forecast", "overestimated_aqi", "underestimated_aqi"]}
                  placeholderNote="e.g., actual next-day AQI was 140"
                />
              </>
            ) : (
              <div className="flex h-full flex-col justify-center space-y-2 py-8 text-center">
                <Wind className="mx-auto h-9 w-9 text-module-aqi" />
                <h2 className="font-display text-base font-semibold text-brand-navy dark:text-white">
                  Ready to Forecast {selectedState}
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Pick any State / UT and CPCB station, or inspect all{" "}
                  {overview?.total_stations || 546} Indian stations at once in{" "}
                  <strong>All-India Outlook</strong>.
                </p>
              </div>
            )}
          </div>

          {/* Right Charts */}
          <div className="space-y-6 rounded-card border border-slate-200 bg-white p-6 shadow-soft dark:border-slate-800 dark:bg-brand-surface lg:col-span-3">
            {probPlotData.length > 0 && (
              <div>
                <h2 className="font-display text-base font-bold text-brand-navy dark:text-white">
                  Next-Day CPCB Category Probabilities ({result.classifier_model_name})
                </h2>
                <PlotlyChart
                  data={probPlotData}
                  layout={{
                    margin: { l: 45, r: 16, t: 12, b: 40 },
                    yaxis: { title: "Probability (%)", range: [0, 100] },
                  }}
                  className="mt-2 h-56 w-full"
                />
              </div>
            )}

            {shapPlotData.length > 0 && (
              <div className="border-t border-slate-100 pt-4 dark:border-slate-800">
                <h2 className="font-display text-base font-bold text-brand-navy dark:text-white">
                  Top SHAP Atmospheric Drivers ({result.regressor_model_name})
                </h2>
                <PlotlyChart
                  data={shapPlotData}
                  layout={{
                    margin: { l: 16, r: 20, t: 12, b: 36 },
                    xaxis: {
                      title: "SHAP Impact on Next-Day AQI",
                      zeroline: true,
                      zerolinecolor: "#94a3b8",
                    },
                    yaxis: { automargin: true },
                  }}
                  className="mt-2 h-64 w-full"
                />
              </div>
            )}

            {timelineData.length > 0 && (
              <div className={result ? "border-t border-slate-100 pt-4 dark:border-slate-800" : ""}>
                <h2 className="font-display text-base font-bold text-brand-navy dark:text-white">
                  Untouched Future Test Series ({timeline.station}
                  {timeline.state ? `, ${timeline.state}` : ""}, Latest 45 Days)
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Chronological evaluation against observed next-day AQI in the held-out India window.
                </p>
                <PlotlyChart
                  data={timelineData}
                  layout={{
                    margin: { l: 44, r: 16, t: 12, b: 52 },
                    yaxis: { title: "Next-Day AQI" },
                    legend: { orientation: "h", y: -0.3, x: 0 },
                  }}
                  className="mt-2 h-64 w-full"
                />
              </div>
            )}
          </div>
        </div>
      ) : (
        /* View Mode: All-India Outlook (36 States/UTs + 546 Stations) */
        <div className="space-y-6">
          {/* KPI Summary Strip */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["States & UTs Covered", overview?.total_states ?? 36],
              ["Monitoring Stations", overview?.total_stations ?? 546],
              ["National Avg Next-Day AQI", nationalAvgAqi ?? "—"],
              ["Stations w/ Unhealthy Alert", unhealthyStationsTotal],
            ].map(([label, val]) => (
              <div
                key={label}
                className="rounded-card border border-slate-200 bg-white p-4 shadow-soft dark:border-slate-800 dark:bg-brand-surface"
              >
                <span className="block text-xs font-medium text-slate-500 dark:text-slate-400">
                  {label}
                </span>
                <span className="font-numeric mt-1 block text-2xl font-bold text-brand-navy dark:text-white">
                  {val}
                </span>
              </div>
            ))}
          </div>

          {/* 36-State Next-Day AQI Chart */}
          <div className="rounded-card border border-slate-200 bg-white p-5 shadow-soft dark:border-slate-800 dark:bg-brand-surface sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-base font-bold text-brand-navy dark:text-white">
                  Predicted Next-Day AQI Across All {sortedStates.length || 36} Indian States &amp; UTs
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Latest snapshot date: {overview?.snapshot_date || "—"} · Colored by CPCB AQI tier
                </p>
              </div>
            </div>
            {overviewLoading ? (
              <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
                Running batch forecast across all Indian monitoring stations...
              </div>
            ) : indiaStateChartData.length > 0 ? (
              <PlotlyChart
                data={indiaStateChartData}
                layout={{
                  margin: { l: 16, r: 20, t: 12, b: 40 },
                  xaxis: { title: "Mean Predicted Next-Day AQI" },
                  yaxis: { automargin: true, dtick: 1 },
                }}
                className="mt-3 h-[760px] w-full"
              />
            ) : null}
          </div>

          {/* Searchable All-Station Prediction Table */}
          <div className="overflow-hidden rounded-card border border-slate-200 bg-white shadow-soft dark:border-slate-800 dark:bg-brand-surface">
            <div className="flex flex-col gap-3 border-b border-slate-100 p-5 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-display text-base font-bold text-brand-navy dark:text-white">
                  All-India Station Forecasts ({filteredIndiaStations.length} stations)
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Click any station to open full SHAP drivers, probabilities, and CPCB health advice.
                </p>
              </div>
              <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                <div className="relative w-full sm:w-56">
                  <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={indiaSearch}
                    onChange={(e) => setIndiaSearch(e.target.value)}
                    placeholder="Search station, city, state..."
                    className="w-full rounded-xl border border-slate-300 bg-white py-1.5 pl-8 pr-3 text-xs text-brand-navy outline-none focus:border-module-aqi dark:border-slate-700 dark:bg-brand-navy dark:text-slate-100"
                  />
                </div>
                <select
                  aria-label="Filter by State"
                  value={indiaStateFilter}
                  onChange={(e) => setIndiaStateFilter(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs text-brand-navy outline-none focus:border-module-aqi dark:border-slate-700 dark:bg-brand-navy dark:text-slate-100 sm:w-auto"
                >
                  <option value="ALL">All 36 States &amp; UTs</option>
                  {sortedStates.map((s) => (
                    <option key={s.state} value={s.state}>
                      {s.state} ({s.station_count})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left text-xs dark:divide-slate-800">
                <thead className="bg-brand-offwhite text-slate-600 dark:bg-brand-navy/60 dark:text-slate-300">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Station</th>
                    <th className="px-4 py-3 font-semibold">City</th>
                    <th className="px-4 py-3 font-semibold">State / UT</th>
                    <th className="px-4 py-3 font-semibold">Today AQI</th>
                    <th className="px-4 py-3 font-semibold">Next-Day AQI</th>
                    <th className="px-4 py-3 font-semibold">Predicted Tier</th>
                    <th className="px-4 py-3 font-semibold">Unhealthy Risk</th>
                    <th className="px-4 py-3 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {displayedStations.map((st) => (
                    <tr
                      key={`${st.state}::${st.station}`}
                      className="hover:bg-slate-50/80 dark:hover:bg-brand-navy/40"
                    >
                      <td className="px-4 py-2.5 font-semibold text-brand-navy dark:text-white">
                        {st.station}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{st.city}</td>
                      <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{st.state}</td>
                      <td className="font-numeric px-4 py-2.5 text-slate-700 dark:text-slate-200">
                        {st.today_aqi.toFixed(0)}
                      </td>
                      <td className="font-numeric px-4 py-2.5 font-bold text-brand-navy dark:text-white">
                        {st.predicted_next_day_aqi.toFixed(0)}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                            CATEGORY_STYLES[st.predicted_category] ||
                            "border-slate-200 bg-slate-100 text-slate-700"
                          }`}
                        >
                          {st.predicted_category}
                        </span>
                      </td>
                      <td className="font-numeric px-4 py-2.5 text-slate-600 dark:text-slate-300">
                        {(st.unhealthy_probability * 100).toFixed(0)}%
                      </td>
                      <td className="px-4 py-2.5">
                        <button
                          type="button"
                          onClick={() => handleInspectFromIndiaTable(st)}
                          className="rounded-lg bg-brand-indigo/10 px-2.5 py-1 text-[11px] font-semibold text-brand-indigo transition hover:bg-brand-indigo hover:text-white dark:bg-brand-indigo-light/15 dark:text-brand-indigo-light"
                        >
                          Forecast
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {filteredIndiaStations.length > 60 && (
              <div className="border-t border-slate-100 px-5 py-3 text-center dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAllRows((prev) => !prev)}
                  className="text-xs font-semibold text-brand-indigo hover:underline dark:text-brand-indigo-light"
                >
                  {showAllRows
                    ? "Show Top 60 Stations"
                    : `Show All ${filteredIndiaStations.length} Matching Stations`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
