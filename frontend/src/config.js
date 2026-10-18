// The backend's address. Vite fills in VITE_API_URL from the environment that
// starts it; the end-to-end tests use that to point the app at a test backend.
export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";
