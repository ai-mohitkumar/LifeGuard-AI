/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          indigo: "#3B3FD8",
          "indigo-hover": "#2F32B8",
          "indigo-light": "#818CF8",
          teal: "#14B8A6",
          "teal-ink": "#0F766E",
          navy: "#0F172A",
          surface: "#1E293B",
          offwhite: "#F8FAFC",
        },
        module: {
          scam: "#EF4444",
          "scam-ink": "#B91C1C",
          price: "#F59E0B",
          "price-ink": "#92400E",
          health: "#14B8A6",
          "health-ink": "#0F766E",
          aqi: "#0EA5E9",
          "aqi-ink": "#0369A1",
        },
        verdict: {
          safe: "#22C55E",
          "safe-ink": "#166534",
          warn: "#F59E0B",
          "warn-ink": "#92400E",
          danger: "#EF4444",
          "danger-ink": "#B91C1C",
        },
      },
      fontFamily: {
        display: ["Poppins", "system-ui", "sans-serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      borderRadius: {
        card: "16px",
        control: "12px",
      },
      boxShadow: {
        soft: "0 1px 2px rgba(15, 23, 42, 0.04), 0 8px 24px -12px rgba(15, 23, 42, 0.08)",
        "soft-hover": "0 12px 28px -12px rgba(59, 63, 216, 0.16)",
      },
    },
  },
  plugins: [],
};
