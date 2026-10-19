const configuredApiBase = window.__APP_CONFIG__?.API_BASE || import.meta.env.VITE_API_BASE;

export const API_BASE = (
  configuredApiBase || (import.meta.env.DEV ? "http://127.0.0.1:8000" : "")
).replace(/\/+$/, "");

export const API_CONFIG_ERROR =
  "Backend URL is not configured. Set VITE_API_BASE in the frontend's Vercel project and redeploy.";
