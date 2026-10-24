/// <reference types="vite/client" />

// The VITE_* variables the app reads (see .env.example). Vite's own types allow
// any name, with any value; declaring them makes import.meta.env.VITE_API_URL a string.
interface ImportMetaEnv {
    readonly VITE_API_URL?: string
}

interface ImportMeta {
    readonly env: ImportMetaEnv
}
