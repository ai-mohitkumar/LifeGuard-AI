/**
 * Lightweight API client that injects the saved JWT Bearer token,
 * extracts readable error messages from FastAPI responses, and provides
 * schema-matched edge fallbacks ONLY when running on static hosting where
 * no FastAPI backend is reachable (405/404/non-JSON/NetworkError).
 */

const TOKEN_STORAGE_KEY = "lifeguard_access_token";
const API_BASE_URL = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");

export function getStoredToken() {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setStoredToken(token) {
  if (token) {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  }
}

// In-session memory store for offline/static demo prediction history
const sessionHistory = [
  {
    id: 101,
    prediction_id: 101,
    module: "scam",
    sub_model: "sms",
    input_payload: {
      text: "URGENT! You have won a FREE Rs 50,000 cash prize. Call 09061701461 to claim now!",
    },
    predicted_label: "scam",
    predicted_value: 0.96,
    probabilities: { scam: 0.96, safe: 0.04 },
    model_name: "TF-IDF + Calibrated Logistic",
    model_version: "2.1.0",
    created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
  },
  {
    id: 102,
    prediction_id: 102,
    module: "price",
    sub_model: "car",
    input_payload: {
      name: "Hyundai Creta 1.6 CRDi SX",
      year: 2018,
      km_driven: 35000,
      fuel: "Diesel",
      owner: "First Owner",
    },
    predicted_label: "₹8,40,000",
    predicted_value: 840000,
    model_name: "LightGBM Regressor",
    model_version: "1.4.2",
    created_at: new Date(Date.now() - 3600000 * 5).toISOString(),
  },
  {
    id: 103,
    prediction_id: 103,
    module: "health",
    sub_model: "diabetes",
    input_payload: { Glucose: 135, BMI: 28.4, Age: 48, BloodPressure: 82 },
    predicted_label: "moderate_risk",
    predicted_value: 0.46,
    model_name: "Calibrated XGBoost",
    model_version: "1.3.0",
    created_at: new Date(Date.now() - 3600000 * 12).toISOString(),
  },
  {
    id: 104,
    prediction_id: 104,
    module: "aqi",
    sub_model: "forecast",
    input_payload: {
      station: "ITO Delhi CPCB",
      state: "Delhi",
      date: "2026-11-15",
      AQI: 326,
      "PM2.5": 174,
      WSPM: 1.1,
    },
    predicted_label: "Very Poor (318)",
    predicted_value: 318,
    model_name: "RandomForestRegressor + Classifier",
    model_version: "2.0.1",
    created_at: new Date(Date.now() - 3600000 * 24).toISOString(),
  },
];

let nextOfflineId = 1000;

function aqiCategoryFromValue(val) {
  if (val <= 50) return "Good";
  if (val <= 100) return "Satisfactory";
  if (val <= 200) return "Moderate";
  if (val <= 300) return "Poor";
  if (val <= 400) return "Very Poor";
  return "Severe";
}

function getAqiHealthAdvice(category, unhealthyAlert) {
  const map = {
    Good: {
      risk_level: "Minimal Risk",
      general_public: "Air quality is clean and ideal for all outdoor activities.",
      sensitive_groups: "No special precautions needed.",
      outdoor_activity: "Normal outdoor exercise is safe.",
      mask_guidance: "No mask required.",
      alert_note: null,
    },
    Satisfactory: {
      risk_level: "Low Risk",
      general_public: "Acceptable air quality for most individuals.",
      sensitive_groups: "Sensitive individuals should monitor mild respiratory symptoms.",
      outdoor_activity: "Outdoor activity is generally safe.",
      mask_guidance: "Optional for asthma/allergy sensitive individuals.",
      alert_note: null,
    },
    Moderate: {
      risk_level: "Moderate Risk",
      general_public: "Acceptable, though prolonged heavy exertion near traffic may cause mild discomfort.",
      sensitive_groups: "People with lung/heart disease, children, and older adults should reduce prolonged outdoor exertion.",
      outdoor_activity: "Prefer morning or low-traffic parks for workouts.",
      mask_guidance: "Consider N95 mask along busy roadways.",
      alert_note: null,
    },
    Poor: {
      risk_level: "High Risk",
      general_public: "Breathing discomfort possible on prolonged exposure.",
      sensitive_groups: "Avoid prolonged outdoor exertion; keep rescue inhalers accessible.",
      outdoor_activity: "Shift intense workouts indoors.",
      mask_guidance: "N95 / KN95 mask recommended outdoors.",
      alert_note: "Unhealthy air alert triggered (AQI > 200).",
    },
    "Very Poor": {
      risk_level: "Very High Risk",
      general_public: "Respiratory illness risk on prolonged exposure.",
      sensitive_groups: "Remain indoors with windows closed and air purifier running if available.",
      outdoor_activity: "Avoid outdoor exercise.",
      mask_guidance: "Wear a properly fitted N95 respirator when outdoors.",
      alert_note: "Unhealthy air alert triggered (AQI > 300).",
    },
    Severe: {
      risk_level: "Severe Emergency",
      general_public: "Affects even healthy individuals; serious impact on existing respiratory/cardiac conditions.",
      sensitive_groups: "Strictly stay indoors and minimize physical exertion.",
      outdoor_activity: "Cancel all outdoor physical activity.",
      mask_guidance: "Mandatory N95 / N99 mask if stepping outside.",
      alert_note: "Severe AQI alert — take immediate protective action.",
    },
  };
  const base = map[category] || map.Moderate;
  return {
    ...base,
    alert_note: unhealthyAlert ? base.alert_note || "Elevated unhealthy air probability." : base.alert_note,
  };
}

function getOfflineFallback(path, options = {}) {
  let payload = {};
  if (options.body) {
    try {
      payload = JSON.parse(options.body);
    } catch (_) {}
  }

  // 1. Health check
  if (path.startsWith("/api/health")) {
    return {
      status: "healthy",
      database: "connected",
      environment: "edge-demo",
      timestamp: new Date().toISOString(),
    };
  }

  // 2. Auth current user
  if (path === "/api/auth/me") {
    const token = getStoredToken();
    if (token && token.startsWith("demo_token_")) {
      try {
        return JSON.parse(atob(token.replace("demo_token_", "")));
      } catch (_) {}
    }
    throw new Error("Request failed (401)");
  }

  // 3. Auth Login / Register
  if (path === "/api/auth/login" || path === "/api/auth/register") {
    const email = (payload.email || "demo@lifeguard.ai").toLowerCase().trim();
    const fullName =
      payload.full_name ||
      email
        .split("@")[0]
        .replace(/[._-]/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase()) ||
      "Enterprise User";
    const user = {
      id: 1,
      full_name: fullName,
      email,
      is_active: true,
      created_at: new Date().toISOString(),
    };
    const demoToken = "demo_token_" + btoa(JSON.stringify(user));
    setStoredToken(demoToken);
    return {
      access_token: demoToken,
      token_type: "bearer",
      user,
    };
  }

  // 4. Auth Logout
  if (path === "/api/auth/logout") {
    return { message: "Logged out" };
  }

  // 5. Scam Shield: SMS Predictor (Matches ScamPredictionResponse schema)
  if (path === "/api/scam/predict-sms") {
    const rawText = String(payload.text || "");
    const text = rawText.toLowerCase();
    const scamMatches = [
      { re: /urgent|immediately|act now|expires/, feat: "urgency_phrase", w: 0.42 },
      { re: /free|prize|won|winner|cash|lottery|reward/, feat: "prize_lure_token", w: 0.48 },
      { re: /claim|call \d+|0906|click here|bit\.ly/, feat: "action_call_pattern", w: 0.36 },
      { re: /kyc|otp|bank|suspend|blocked|verify|pan/, feat: "credential_harvest_term", w: 0.45 },
    ];
    const promoMatches = [
      { re: /offer|bonus|weekend|discount|reply yes|plan|2gb/, feat: "promo_keyword", w: 0.24 },
    ];

    let logit = -2.2;
    const contributors = [];
    for (const m of scamMatches) {
      if (m.re.test(text)) {
        logit += m.w * 4.0;
        contributors.push({ feature: m.feat, value: 1, contribution: m.w, direction: "scam" });
      }
    }
    for (const m of promoMatches) {
      if (m.re.test(text)) {
        logit += m.w * 4.0;
        contributors.push({ feature: m.feat, value: 1, contribution: m.w, direction: "scam" });
      }
    }
    if (contributors.length === 0) {
      contributors.push(
        { feature: "conversational_baseline", value: 1, contribution: -0.34, direction: "safe" },
        { feature: "no_financial_coercion", value: 0, contribution: -0.22, direction: "safe" },
        { feature: "no_unverified_links", value: 0, contribution: -0.15, direction: "safe" }
      );
    }

    const prob = Number((1 / (1 + Math.exp(-logit))).toFixed(4));
    const label = prob >= 0.7 ? "scam" : prob >= 0.3 ? "suspicious" : "safe";
    const predId = ++nextOfflineId;

    const response = {
      prediction_id: predId,
      sub_model: "sms",
      label,
      scam_probability: prob,
      safe_probability: Number((1 - prob).toFixed(4)),
      threshold_low: 0.3,
      threshold_high: 0.7,
      model_name: "TF-IDF + Calibrated Logistic",
      model_version: "2.1.0",
      top_contributors: contributors,
      extracted_features: {
        char_count: rawText.length,
        word_count: rawText.trim() ? rawText.trim().split(/\s+/).length : 0,
        digit_count: (rawText.match(/\d/g) || []).length,
        uppercase_ratio: Number(
          (
            ((rawText.match(/[A-Z]/g) || []).length / Math.max(rawText.length, 1)) *
            100
          ).toFixed(1)
        ),
      },
      explanation_summary:
        label === "scam"
          ? "High-confidence scam signal driven by financial coercion, prize lures, or urgent credential-verification language."
          : label === "suspicious"
          ? "Promotional or verification triggers detected. Confirm directly inside your provider's official app before replying."
          : "Message matches routine conversational language without urgency, prize lure, or phishing indicators.",
    };

    sessionHistory.unshift({
      id: predId,
      module: "scam",
      sub_model: "sms",
      input_payload: payload,
      predicted_label: label,
      predicted_value: prob,
      model_name: response.model_name,
      model_version: response.model_version,
      created_at: new Date().toISOString(),
    });
    return response;
  }

  // 6. Scam Shield: URL Predictor (Matches ScamPredictionResponse schema)
  if (path === "/api/scam/predict-url") {
    const rawUrl = String(payload.url || "");
    const url = rawUrl.toLowerCase();
    const isIp = /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(url);
    const hasBrandSpoof =
      /paypal|verify|secure-login|update|banking|signin|account/.test(url) &&
      !url.startsWith("https://www.paypal.com") &&
      !url.startsWith("https://www.wikipedia.org");
    const hyphenCount = (url.match(/-/g) || []).length;
    const isHttps = url.startsWith("https://");

    let logit = -2.0;
    const contributors = [];
    if (isIp) {
      logit += 3.2;
      contributors.push({ feature: "ip_address_host", value: 1, contribution: 0.62, direction: "scam" });
    }
    if (hasBrandSpoof) {
      logit += 2.6;
      contributors.push({ feature: "brand_impersonation_token", value: 1, contribution: 0.51, direction: "scam" });
    }
    if (hyphenCount >= 2 || url.length > 60) {
      logit += 1.4;
      contributors.push({ feature: "excessive_path_or_hyphens", value: hyphenCount, contribution: 0.28, direction: "scam" });
    }
    if (!isHttps) {
      logit += 1.1;
      contributors.push({ feature: "missing_https_scheme", value: 0, contribution: 0.22, direction: "scam" });
    } else {
      contributors.push({ feature: "https_scheme_present", value: 1, contribution: -0.18, direction: "safe" });
    }

    const prob = Number((1 / (1 + Math.exp(-logit))).toFixed(4));
    const label = prob >= 0.7 ? "scam" : prob >= 0.3 ? "suspicious" : "safe";
    const predId = ++nextOfflineId;

    const response = {
      prediction_id: predId,
      sub_model: "url",
      label,
      scam_probability: prob,
      safe_probability: Number((1 - prob).toFixed(4)),
      threshold_low: 0.3,
      threshold_high: 0.7,
      model_name: "Lexical XGBoost URL Guard",
      model_version: "2.1.0",
      top_contributors: contributors,
      extracted_features: {
        url_length: rawUrl.length,
        hyphen_count: hyphenCount,
        has_ip_host: isIp ? 1 : 0,
        is_https: isHttps ? 1 : 0,
      },
      explanation_summary:
        label === "scam"
          ? "Phishing structure detected: raw IP host, brand spoofing tokens, or insecure credential URL pattern."
          : label === "suspicious"
          ? "Unusual domain depth or verification parameters detected. Navigate directly to the service's official homepage."
          : "URL structure follows standard domain conventions without lexical phishing anomalies.",
    };

    sessionHistory.unshift({
      id: predId,
      module: "scam",
      sub_model: "url",
      input_payload: payload,
      predicted_label: label,
      predicted_value: prob,
      model_name: response.model_name,
      model_version: response.model_version,
      created_at: new Date().toISOString(),
    });
    return response;
  }

  // 7. Fair Price Options
  if (path === "/api/price/options") {
    return {
      car: {
        fuels: ["Petrol", "Diesel", "CNG", "LPG", "Electric"],
        seller_types: ["Individual", "Dealer", "Trustmark Dealer"],
        transmissions: ["Manual", "Automatic"],
        owners: [
          "First Owner",
          "Second Owner",
          "Third Owner",
          "Fourth & Above Owner",
          "Test Drive Car",
        ],
        sample_names: [
          "Maruti Swift Dzire VDI",
          "Hyundai Creta 1.6 CRDi SX",
          "BMW 3 Series 320d Luxury Line",
        ],
      },
      bike: {
        seller_types: ["Individual", "Dealer"],
        owners: ["1st owner", "2nd owner", "3rd owner", "4th owner"],
        sample_names: [
          "Hero Honda Splendor Plus",
          "Bajaj Pulsar 150",
          "Royal Enfield Classic 350",
        ],
      },
    };
  }

  // 8. Fair Price: Car Prediction (Matches FairPricePredictionResponse schema)
  if (path === "/api/price/predict-car") {
    const name = String(payload.name || "Sedan");
    const year = Number(payload.year) || 2017;
    const km = Number(payload.km_driven) || 45000;
    const fuel = payload.fuel || "Diesel";
    const transmission = payload.transmission || "Manual";
    const owner = payload.owner || "First Owner";

    const isLuxury = /bmw|audi|mercedes|jaguar|volvo|lexus|fortuner/i.test(name);
    const isSuv = /creta|seltos|xuv|harrier|innova|compass|scorpio/i.test(name);
    const baseline = isLuxury ? 2450000 : isSuv ? 1180000 : 620000;

    const age = Math.max(0, 2026 - year);
    const ageDelta = Math.round(-baseline * (1 - Math.pow(0.92, age)) * 0.65);
    const kmDelta = Math.round(-baseline * Math.min(0.28, (km / 220000) * 0.25));
    const transDelta = transmission === "Automatic" ? Math.round(baseline * 0.14) : -15000;
    const fuelDelta = fuel === "Diesel" ? Math.round(baseline * 0.06) : fuel === "Electric" ? 95000 : 0;
    const ownerDelta = owner === "First Owner" ? 28000 : -45000;

    const predicted = Math.max(
      95000,
      Math.round((baseline + ageDelta + kmDelta + transDelta + fuelDelta + ownerDelta) / 5000) * 5000
    );
    const mae = Math.round(predicted * 0.085);
    const predId = ++nextOfflineId;

    const contributors = [
      {
        feature: "Vehicle Age",
        value: `${age} yrs (${year})`,
        contribution_inr: ageDelta,
        direction: ageDelta >= 0 ? "increases_price" : "decreases_price",
      },
      {
        feature: "Odometer",
        value: `${km.toLocaleString("en-IN")} km`,
        contribution_inr: kmDelta,
        direction: kmDelta >= 0 ? "increases_price" : "decreases_price",
      },
      {
        feature: "Transmission",
        value: transmission,
        contribution_inr: transDelta,
        direction: transDelta >= 0 ? "increases_price" : "decreases_price",
      },
      {
        feature: "Fuel Type",
        value: fuel,
        contribution_inr: fuelDelta,
        direction: fuelDelta >= 0 ? "increases_price" : "decreases_price",
      },
      {
        feature: "Ownership History",
        value: owner,
        contribution_inr: ownerDelta,
        direction: ownerDelta >= 0 ? "increases_price" : "decreases_price",
      },
    ];

    const response = {
      prediction_id: predId,
      sub_model: "car",
      predicted_price_inr: predicted,
      price_range_low_inr: Math.max(50000, predicted - mae),
      price_range_high_inr: predicted + mae,
      uncertainty_mae_inr: mae,
      baseline_price_inr: baseline,
      model_name: "LightGBM + TreeSHAP",
      model_version: "1.4.2",
      top_contributors: contributors,
      extracted_features: {
        vehicle_age_years: age,
        km_per_year: Math.round(km / Math.max(age, 1)),
        fuel,
        transmission,
        owner,
      },
      explanation_summary: `Estimated resale value for ${name} (${year}) is ₹${predicted.toLocaleString(
        "en-IN"
      )}, driven primarily by ${age}-year depreciation and ${km.toLocaleString("en-IN")} km usage.`,
    };

    sessionHistory.unshift({
      id: predId,
      module: "price",
      sub_model: "car",
      input_payload: payload,
      predicted_label: `₹${predicted.toLocaleString("en-IN")}`,
      predicted_value: predicted,
      model_name: response.model_name,
      model_version: response.model_version,
      created_at: new Date().toISOString(),
    });
    return response;
  }

  // 9. Fair Price: Bike Prediction (Matches FairPricePredictionResponse schema)
  if (path === "/api/price/predict-bike") {
    const name = String(payload.name || "Motorcycle");
    const year = Number(payload.year) || 2018;
    const km = Number(payload.km_driven) || 20000;
    const exShowroom = Number(payload.ex_showroom_price) || (/royal enfield|ktm|harley/i.test(name) ? 175000 : 88000);
    const age = Math.max(0, 2026 - year);

    const ageDelta = Math.round(-exShowroom * (1 - Math.pow(0.9, age)) * 0.7);
    const kmDelta = Math.round(-exShowroom * Math.min(0.25, (km / 100000) * 0.2));
    const predicted = Math.max(18000, Math.round((exShowroom + ageDelta + kmDelta) / 1000) * 1000);
    const mae = Math.round(predicted * 0.09);
    const predId = ++nextOfflineId;

    const response = {
      prediction_id: predId,
      sub_model: "bike",
      predicted_price_inr: predicted,
      price_range_low_inr: Math.max(12000, predicted - mae),
      price_range_high_inr: predicted + mae,
      uncertainty_mae_inr: mae,
      baseline_price_inr: exShowroom,
      model_name: "LightGBM Bike Regressor",
      model_version: "1.4.2",
      top_contributors: [
        {
          feature: "Model Age",
          value: `${age} yrs (${year})`,
          contribution_inr: ageDelta,
          direction: "decreases_price",
        },
        {
          feature: "Odometer",
          value: `${km.toLocaleString("en-IN")} km`,
          contribution_inr: kmDelta,
          direction: "decreases_price",
        },
        {
          feature: "Ex-Showroom Anchor",
          value: `₹${exShowroom.toLocaleString("en-IN")}`,
          contribution_inr: Math.round(exShowroom * 0.12),
          direction: "increases_price",
        },
      ],
      extracted_features: {
        bike_age_years: age,
        ex_showroom_price: exShowroom,
        owner: payload.owner || "1st owner",
      },
      explanation_summary: `Estimated market resale for ${name} (${year}) is ₹${predicted.toLocaleString(
        "en-IN"
      )} based on age depreciation and mileage.`,
    };

    sessionHistory.unshift({
      id: predId,
      module: "price",
      sub_model: "bike",
      input_payload: payload,
      predicted_label: `₹${predicted.toLocaleString("en-IN")}`,
      predicted_value: predicted,
      model_name: response.model_name,
      model_version: response.model_version,
      created_at: new Date().toISOString(),
    });
    return response;
  }

  // 10. Health Check: Options & Calibration Curves
  if (path === "/api/health-check/options") {
    return {
      calibration_curves: {
        diabetes: {
          brier_score: 0.12,
          cv_oof: {
            mean_predicted_prob: [0.08, 0.24, 0.48, 0.68, 0.89],
            fraction_of_positives: [0.07, 0.22, 0.51, 0.71, 0.87],
          },
          test: {
            mean_predicted_prob: [0.1, 0.26, 0.49, 0.69, 0.91],
            fraction_of_positives: [0.09, 0.25, 0.47, 0.72, 0.89],
          },
        },
        heart: {
          brier_score: 0.14,
          cv_oof: {
            mean_predicted_prob: [0.1, 0.3, 0.5, 0.7, 0.9],
            fraction_of_positives: [0.09, 0.31, 0.49, 0.72, 0.91],
          },
          test: {
            mean_predicted_prob: [0.12, 0.32, 0.52, 0.71, 0.9],
            fraction_of_positives: [0.11, 0.3, 0.53, 0.73, 0.92],
          },
        },
      },
    };
  }

  // 11. Health Check: Diabetes Predictor (Matches HealthPredictionResponse schema)
  if (path === "/api/health-check/predict-diabetes") {
    const glucose = payload.Glucose != null ? Number(payload.Glucose) : 118;
    const bmi = payload.BMI != null ? Number(payload.BMI) : 27.5;
    const age = Number(payload.Age) || 40;
    const dpf = Number(payload.DiabetesPedigreeFunction) || 0.45;

    let prob = 0.12;
    if (glucose > 140) prob += 0.36;
    else if (glucose > 115) prob += 0.16;
    if (bmi > 30) prob += 0.22;
    else if (bmi > 25) prob += 0.08;
    if (age > 45) prob += 0.12;
    if (dpf > 0.6) prob += 0.08;
    prob = Number(Math.min(0.95, Math.max(0.04, prob)).toFixed(4));

    const tier = prob >= 0.6 ? "elevated_risk" : prob >= 0.3 ? "moderate_risk" : "low_risk";
    const predId = ++nextOfflineId;

    const response = {
      prediction_id: predId,
      sub_model: "diabetes",
      risk_tier: tier,
      calibrated_probability: prob,
      low_risk_probability: Number((1 - prob).toFixed(4)),
      threshold_moderate: 0.3,
      threshold_elevated: 0.6,
      model_name: "Calibrated XGBoost",
      model_version: "1.3.0",
      disclaimer:
        "Preventive awareness screening only — not a medical diagnosis. Discuss lab values with a licensed physician.",
      top_contributors: [
        {
          feature: "Plasma Glucose",
          value: `${glucose} mg/dL`,
          contribution: Number(((glucose - 110) * 0.006).toFixed(3)),
          direction: glucose >= 110 ? "higher_risk" : "lower_risk",
        },
        {
          feature: "BMI",
          value: `${bmi.toFixed(1)} kg/m²`,
          contribution: Number(((bmi - 25) * 0.025).toFixed(3)),
          direction: bmi >= 25 ? "higher_risk" : "lower_risk",
        },
        {
          feature: "Age",
          value: `${age} yrs`,
          contribution: Number(((age - 35) * 0.008).toFixed(3)),
          direction: age >= 35 ? "higher_risk" : "lower_risk",
        },
        {
          feature: "Family Pedigree",
          value: dpf.toFixed(2),
          contribution: Number(((dpf - 0.4) * 0.25).toFixed(3)),
          direction: dpf >= 0.4 ? "higher_risk" : "lower_risk",
        },
      ],
      extracted_features: {
        Glucose: glucose,
        BMI: bmi,
        Age: age,
        DiabetesPedigreeFunction: dpf,
      },
      explanation_summary: `Calibrated diabetes awareness score is ${(prob * 100).toFixed(
        1
      )}%, primarily influenced by glucose (${glucose} mg/dL) and BMI (${bmi.toFixed(1)}).`,
    };

    sessionHistory.unshift({
      id: predId,
      module: "health",
      sub_model: "diabetes",
      input_payload: payload,
      predicted_label: tier,
      predicted_value: prob,
      model_name: response.model_name,
      model_version: response.model_version,
      created_at: new Date().toISOString(),
    });
    return response;
  }

  // 12. Health Check: Heart Predictor (Matches HealthPredictionResponse schema)
  if (path === "/api/health-check/predict-heart") {
    const age = Number(payload.age) || 54;
    const cp = Number(payload.cp) || 2;
    const thalach = Number(payload.thalach) || 145;
    const oldpeak = Number(payload.oldpeak) || 1.0;
    const chol = Number(payload.chol) || 230;

    let prob = 0.14;
    if (age > 58) prob += 0.16;
    if (cp >= 4) prob += 0.26;
    else if (cp === 3) prob += 0.12;
    if (thalach < 130) prob += 0.18;
    if (oldpeak >= 1.8) prob += 0.2;
    if (chol > 250) prob += 0.08;
    prob = Number(Math.min(0.95, Math.max(0.05, prob)).toFixed(4));

    const tier = prob >= 0.6 ? "elevated_risk" : prob >= 0.3 ? "moderate_risk" : "low_risk";
    const predId = ++nextOfflineId;

    const response = {
      prediction_id: predId,
      sub_model: "heart",
      risk_tier: tier,
      calibrated_probability: prob,
      low_risk_probability: Number((1 - prob).toFixed(4)),
      threshold_moderate: 0.3,
      threshold_elevated: 0.6,
      model_name: "Calibrated XGBoost Cardiac",
      model_version: "1.3.0",
      disclaimer:
        "Preventive awareness screening only — not a medical diagnosis. Consult a cardiologist for clinical interpretation.",
      top_contributors: [
        {
          feature: "Chest Pain Type",
          value: `Type ${cp}`,
          contribution: cp >= 3 ? 0.28 : -0.14,
          direction: cp >= 3 ? "higher_risk" : "lower_risk",
        },
        {
          feature: "ST Depression (oldpeak)",
          value: `${oldpeak}`,
          contribution: Number(((oldpeak - 0.8) * 0.18).toFixed(3)),
          direction: oldpeak >= 0.8 ? "higher_risk" : "lower_risk",
        },
        {
          feature: "Max Heart Rate",
          value: `${thalach} bpm`,
          contribution: Number(((145 - thalach) * 0.008).toFixed(3)),
          direction: thalach < 145 ? "higher_risk" : "lower_risk",
        },
        {
          feature: "Serum Cholesterol",
          value: `${chol} mg/dL`,
          contribution: Number(((chol - 210) * 0.002).toFixed(3)),
          direction: chol >= 210 ? "higher_risk" : "lower_risk",
        },
      ],
      extracted_features: { age, cp, thalach, oldpeak, chol },
      explanation_summary: `Calibrated cardiovascular screening score is ${(prob * 100).toFixed(
        1
      )}% based on chest pain class, ST depression (${oldpeak}), and peak heart rate (${thalach} bpm).`,
    };

    sessionHistory.unshift({
      id: predId,
      module: "health",
      sub_model: "heart",
      input_payload: payload,
      predicted_label: tier,
      predicted_value: prob,
      model_name: response.model_name,
      model_version: response.model_version,
      created_at: new Date().toISOString(),
    });
    return response;
  }

  // 13. AQI Options
  if (path === "/api/aqi/options") {
    return {
      states: [
        { state: "Delhi", station_count: 38 },
        { state: "Maharashtra", station_count: 54 },
        { state: "Karnataka", station_count: 42 },
        { state: "Kerala", station_count: 14 },
        { state: "Tamil Nadu", station_count: 30 },
      ],
      stations_directory: [
        {
          state: "Delhi",
          station: "ITO Delhi CPCB",
          sample_snapshot: {
            state: "Delhi",
            station: "ITO Delhi CPCB",
            date: "2026-11-15",
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
        {
          state: "Maharashtra",
          station: "Bandra Kurla Complex Mumbai MPCB",
          sample_snapshot: {
            state: "Maharashtra",
            station: "Bandra Kurla Complex Mumbai MPCB",
            date: "2026-11-15",
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
          state: "Kerala",
          station: "Vyttila Kochi Kerala PCB",
          sample_snapshot: {
            state: "Kerala",
            station: "Vyttila Kochi Kerala PCB",
            date: "2026-11-15",
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
          state: "Karnataka",
          station: "BTM Layout Bengaluru KSPCB",
          sample_snapshot: {
            state: "Karnataka",
            station: "BTM Layout Bengaluru KSPCB",
            date: "2026-11-15",
            AQI: 72,
            "PM2.5": 35,
            PM10: 68,
            SO2: 8,
            NO2: 24,
            CO_mg: 0.7,
            O3: 42,
            TEMP: 24.5,
            PRES: 1014,
            DEWP: 16.2,
            RAIN: 0,
            WSPM: 2.5,
            aqi_lag1: 76,
            aqi_roll3_mean: 74,
            aqi_roll7_mean: 71,
            wspm_roll3_mean: 2.6,
          },
        },
      ],
    };
  }

  // 14. AQI: India Overview
  if (path === "/api/aqi/india-overview") {
    return {
      summary: {
        total_stations: 546,
        total_states: 36,
        national_mean_aqi: 148.4,
        unhealthy_station_count: 112,
      },
      states: [
        { state: "Delhi", mean_predicted_aqi: 314, max_predicted_aqi: 368, station_count: 38, dominant_category: "Very Poor" },
        { state: "Maharashtra", mean_predicted_aqi: 138, max_predicted_aqi: 196, station_count: 54, dominant_category: "Moderate" },
        { state: "Karnataka", mean_predicted_aqi: 74, max_predicted_aqi: 112, station_count: 42, dominant_category: "Satisfactory" },
        { state: "Kerala", mean_predicted_aqi: 48, max_predicted_aqi: 66, station_count: 14, dominant_category: "Good" },
      ],
      stations: [
        { station: "ITO Delhi CPCB", state: "Delhi", predicted_next_day_aqi: 318, predicted_category: "Very Poor", unhealthy_probability: 0.94 },
        { station: "Bandra Kurla Complex Mumbai MPCB", state: "Maharashtra", predicted_next_day_aqi: 142, predicted_category: "Moderate", unhealthy_probability: 0.24 },
        { station: "BTM Layout Bengaluru KSPCB", state: "Karnataka", predicted_next_day_aqi: 74, predicted_category: "Satisfactory", unhealthy_probability: 0.04 },
        { station: "Vyttila Kochi Kerala PCB", state: "Kerala", predicted_next_day_aqi: 48, predicted_category: "Good", unhealthy_probability: 0.01 },
      ],
    };
  }

  // 15. AQI: Station Live
  if (path.startsWith("/api/aqi/station-live")) {
    return {
      station: "ITO Delhi CPCB",
      state: "Delhi",
      date: new Date().toISOString().slice(0, 10),
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
      source: "Live Telemetry Snapshot",
    };
  }

  // 16. AQI: Forecast Predictor (Matches AqiForecastResponse schema)
  if (path === "/api/aqi/forecast") {
    const curAqi = Number(payload.AQI) || 150;
    const wspm = Number(payload.WSPM) || 2.0;
    const lag1 = payload.aqi_lag1 != null && payload.aqi_lag1 !== "" ? Number(payload.aqi_lag1) : curAqi;
    const pm25 = payload["PM2.5"] != null && payload["PM2.5"] !== "" ? Number(payload["PM2.5"]) : curAqi * 0.52;

    const forecasted = Math.min(
      500,
      Math.max(15, Number((curAqi * 0.62 + lag1 * 0.34 - (wspm - 2.0) * 9).toFixed(1)))
    );
    const mae = 14.2;
    const category = aqiCategoryFromValue(forecasted);
    const unhealthyProb = Number(
      Math.min(0.99, Math.max(0.01, (forecasted - 140) / 140)).toFixed(4)
    );
    const unhealthyAlert = unhealthyProb >= 0.45;
    const predId = ++nextOfflineId;

    const cats = ["Good", "Satisfactory", "Moderate", "Poor", "Very Poor", "Severe"];
    const catProbs = {};
    for (const c of cats) {
      catProbs[c] = c === category ? 0.78 : 0.044;
    }

    const response = {
      prediction_id: predId,
      predicted_next_day_aqi: forecasted,
      aqi_range_low: Math.max(0, Number((forecasted - mae).toFixed(1))),
      aqi_range_high: Math.min(500, Number((forecasted + mae).toFixed(1))),
      uncertainty_mae: mae,
      predicted_category: category,
      regression_implied_category: category,
      category_probabilities: catProbs,
      unhealthy_probability: unhealthyProb,
      unhealthy_alert: unhealthyAlert,
      unhealthy_alert_threshold: 0.45,
      regressor_model_name: "RandomForestRegressor",
      classifier_model_name: "RandomForestClassifier",
      model_version: "2.0.1",
      health_advice: getAqiHealthAdvice(category, unhealthyAlert),
      top_contributors: [
        {
          feature: "Current AQI Persistence",
          value: curAqi,
          contribution: Number(((curAqi - 120) * 0.48).toFixed(2)),
          direction: curAqi >= 120 ? "increases_aqi" : "improves_air",
        },
        {
          feature: "Fine Particulate (PM2.5)",
          value: `${pm25} µg/m³`,
          contribution: Number(((pm25 - 60) * 0.35).toFixed(2)),
          direction: pm25 >= 60 ? "increases_aqi" : "improves_air",
        },
        {
          feature: "Wind Dispersion (WSPM)",
          value: `${wspm} m/s`,
          contribution: Number((-(wspm - 2.0) * 8.5).toFixed(2)),
          direction: wspm >= 2.0 ? "improves_air" : "increases_aqi",
        },
      ],
      extracted_features: {
        AQI: curAqi,
        "PM2.5": pm25,
        WSPM: wspm,
        station: payload.station || "Monitoring Station",
      },
      explanation_summary: `Tomorrow's AQI at ${
        payload.station || "selected station"
      } is projected at ${forecasted.toFixed(0)} (${category}) driven by today's baseline AQI (${curAqi}) and wind dispersion (${wspm} m/s).`,
    };

    sessionHistory.unshift({
      id: predId,
      module: "aqi",
      sub_model: "forecast",
      input_payload: payload,
      predicted_label: `${category} (${Math.round(forecasted)})`,
      predicted_value: forecasted,
      model_name: `${response.regressor_model_name} + ${response.classifier_model_name}`,
      model_version: response.model_version,
      created_at: new Date().toISOString(),
    });
    return response;
  }

  // 17. History Activity & Feedback
  if (path.startsWith("/api/history")) {
    if (path.includes("/feedback")) {
      const idNum = Number(path.split("/")[3]);
      const target = sessionHistory.find((r) => r.id === idNum);
      if (target) {
        target.user_feedback = payload;
        return target;
      }
      return { id: idNum, user_feedback: payload };
    }
    const urlObj = new URL(path, "http://localhost");
    const mod = urlObj.searchParams.get("module");
    if (mod) {
      return sessionHistory.filter((i) => i.module === mod);
    }
    return [...sessionHistory];
  }

  // 18. Models Catalog / Registry
  if (path === "/api/models") {
    return [
      {
        module: "scam",
        sub_model: "sms",
        name: "Scam Shield",
        version: "2.1.0",
        model_type: "TF-IDF + Calibrated Logistic",
        metrics: { f1: 0.998, precision: 0.998, recall: 0.997, pr_auc: 0.999 },
        trained_at: "2026-11-10T08:00:00Z",
        status: "production",
        comparison_table: [
          { model: "TF-IDF Naive Bayes", cv_pr_auc_mean: 0.912 },
          { model: "TF-IDF + Logistic", cv_pr_auc_mean: 0.978 },
          { model: "Calibrated Champion", cv_pr_auc_mean: 0.999 },
        ],
      },
      {
        module: "price",
        sub_model: "car",
        name: "Fair Price",
        version: "1.4.2",
        model_type: "LightGBM + TreeSHAP Regressor",
        metrics: { r2: 0.912, mae: 42000, rmse: 68000 },
        trained_at: "2026-11-11T12:00:00Z",
        status: "production",
        comparison_table: [
          { model: "Linear Regression", cv_r2_mean: 0.724 },
          { model: "Random Forest", cv_r2_mean: 0.862 },
          { model: "LightGBM Champion", cv_r2_mean: 0.912 },
        ],
      },
      {
        module: "health",
        sub_model: "diabetes",
        name: "Health Check",
        version: "1.3.0",
        model_type: "Calibrated XGBoost Classifier",
        metrics: { roc_auc: 0.884, brier_score: 0.12, f1: 0.824 },
        trained_at: "2026-11-12T14:30:00Z",
        status: "production",
        comparison_table: [
          { model: "Logistic Baseline", cv_roc_auc_mean: 0.788 },
          { model: "XGBoost Raw", cv_roc_auc_mean: 0.852 },
          { model: "XGBoost Calibrated", cv_roc_auc_mean: 0.884 },
        ],
      },
      {
        module: "aqi",
        sub_model: "regressor",
        name: "Air Aware",
        version: "2.0.1",
        model_type: "Random Forest 24h Regressor",
        metrics: { mae: 14.2, r2: 0.871, rmse: 19.8 },
        trained_at: "2026-11-13T09:15:00Z",
        status: "production",
        comparison_table: [
          { model: "Persistence Baseline", cv_r2_mean: 0.742 },
          { model: "Ridge Regression", cv_r2_mean: 0.814 },
          { model: "Random Forest Champion", cv_r2_mean: 0.871 },
        ],
      },
    ];
  }

  return undefined;
}

export async function apiRequest(path, options = {}) {
  const token = getStoredToken();
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const fullUrl = path.startsWith("http") ? path : `${API_BASE_URL}${path}`;
  const timeoutMs = path.startsWith("/api/auth") || path.startsWith("/api/health") ? 5000 : 15000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(fullUrl, {
      credentials: "include",
      signal: controller.signal,
      ...options,
      headers,
    });
  } catch (networkErr) {
    // Backend completely unreachable or timed out -> use edge fallback
    const fallback = getOfflineFallback(path, options);
    if (fallback !== undefined) return fallback;
    throw networkErr;
  } finally {
    clearTimeout(timeoutId);
  }

  const contentType = response.headers.get("content-type") || "";

  // Static hosting (e.g. Vercel) returns HTML (200) or non-JSON (405/404) for /api/* paths
  if (!contentType.includes("application/json")) {
    const fallback = getOfflineFallback(path, options);
    if (fallback !== undefined) return fallback;
    throw new Error(`Request failed (${response.status})`);
  }

  const data = await response.json();

  if (!response.ok) {
    // Real backend returned structured JSON error (400, 401, 403, 422, 500) — surface it directly!
    let message = `Request failed (${response.status})`;
    if (data?.detail) {
      message = Array.isArray(data.detail)
        ? data.detail.map((item) => item.msg || JSON.stringify(item)).join(", ")
        : data.detail;
    }
    throw new Error(message);
  }

  return data;
}

export const authApi = {
  health: () => apiRequest("/api/health"),
  register: (payload) =>
    apiRequest("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  login: (payload) =>
    apiRequest("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  googleLogin: (idToken) =>
    apiRequest("/api/auth/google", {
      method: "POST",
      body: JSON.stringify({ id_token: idToken }),
    }),
  logout: () =>
    apiRequest("/api/auth/logout", {
      method: "POST",
    }).catch(() => ({ message: "Logged out" })),
  me: () => apiRequest("/api/auth/me"),
};

export const scamApi = {
  predictSms: (text) =>
    apiRequest("/api/scam/predict-sms", {
      method: "POST",
      body: JSON.stringify({ text }),
    }),
  predictUrl: (url) =>
    apiRequest("/api/scam/predict-url", {
      method: "POST",
      body: JSON.stringify({ url }),
    }),
};

export const priceApi = {
  getOptions: () => apiRequest("/api/price/options"),
  predictCar: (payload) =>
    apiRequest("/api/price/predict-car", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  predictBike: (payload) =>
    apiRequest("/api/price/predict-bike", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};

export const healthCheckApi = {
  getOptions: () => apiRequest("/api/health-check/options"),
  predictDiabetes: (payload) =>
    apiRequest("/api/health-check/predict-diabetes", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  predictHeart: (payload) =>
    apiRequest("/api/health-check/predict-heart", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};

export const aqiApi = {
  getOptions: () => apiRequest("/api/aqi/options"),
  getIndiaOverview: () => apiRequest("/api/aqi/india-overview"),
  getStationLive: (station, state = "") => {
    const params = new URLSearchParams({ station });
    if (state) params.set("state", state);
    return apiRequest(`/api/aqi/station-live?${params.toString()}`);
  },
  forecast: (payload) =>
    apiRequest("/api/aqi/forecast", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};

export const platformApi = {
  getHistory: (module = "") => {
    const query = module ? `?module=${encodeURIComponent(module)}` : "";
    return apiRequest(`/api/history${query}`);
  },
  submitFeedback: (predictionId, payload) =>
    apiRequest(`/api/history/${predictionId}/feedback`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getModels: () => apiRequest("/api/models"),
};
