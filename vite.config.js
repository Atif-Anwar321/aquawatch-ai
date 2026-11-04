import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // In `npm run dev`, /api requests are proxied to the Flask backend,
    // so the frontend needs no API URL configuration locally.
    proxy: {
      '/api': 'http://localhost:5000',
    },
  },
  preview: {
    port: 4173,
    proxy: {
      '/api': 'http://localhost:5000',
    },
  },
})
