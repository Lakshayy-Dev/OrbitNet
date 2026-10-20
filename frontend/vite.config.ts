import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// The FastAPI backend runs on port 8000; the dev server proxies /api to it
// so the browser talks to a single origin.
const API = process.env.ORBITNET_API ?? 'http://127.0.0.1:8000'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173, proxy: { '/api': API } },
  preview: { port: 4173, proxy: { '/api': API } },
  build: { chunkSizeWarningLimit: 1600 },
})
