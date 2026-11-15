import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Proxy /api requests to FastAPI so local dev and Docker Compose work without CORS friction.
const apiProxyTarget = process.env.VITE_API_PROXY_TARGET || "http://127.0.0.1:8000";

export default defineConfig({
  plugins: [react()],
  server: {
    host: process.env.VITE_HOST || "::",
    port: 5173,
    allowedHosts: true,
    proxy: {
      "/api": {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
  },
});
