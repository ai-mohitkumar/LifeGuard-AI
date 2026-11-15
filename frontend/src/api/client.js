/**
 * Lightweight API client that injects the saved JWT Bearer token
 * and extracts readable error messages from FastAPI responses.
 */

const TOKEN_STORAGE_KEY = "lifeguard_access_token";

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

export async function apiRequest(path, options = {}) {
  const token = getStoredToken();
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(path, {
    ...options,
    headers,
  });

  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await response.json()
    : null;

  if (!response.ok) {
    // FastAPI returns either a string detail or a list of Pydantic validation errors.
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
  socialLogin: (payload) =>
    apiRequest("/api/auth/social-login", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
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
