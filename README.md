# Frontend — React + Vite dashboard

React 19 + Vite + Recharts. Plain CSS (no Tailwind) in `src/App.css`.

## Run

```bash
npm install
npm run dev      # http://localhost:5173 (proxies /api to the Flask backend on :5000)
npm run build    # production build into dist/
npm run preview  # serve the production build on http://localhost:4173
```

Start the backend first (`../backend/README.md`) for live data. Without it, the
app shows a bundled snapshot (`src/data/fallback.json`, real API responses)
and a "Saved snapshot data" banner; predictions then use the browser WQI mirror in
`src/wqi.js` without the ML model.

To point at a backend on another host/port, set `VITE_API_URL`:

```bash
VITE_API_URL=http://localhost:5000 npm run dev
```

## Structure

- `src/App.jsx` — header, tabs, layout, backend-live banner.
- `src/api.js` — API client with offline fallback.
- `src/wqi.js` — browser mirror of `backend/wqi.py` (offline mode only; keep in sync).
- `src/components/` — `Dashboard`, `Zones`, `Simulator`, `FlowMap` (animated SVG network map for the simulator), `Predictor`, `Explorer`, `ModelPage`, `About`.
- `src/simulation.js` — browser mirror of `backend/simulation.py` (offline mode only; keep in sync).
- `src/data/fallback.json` — snapshot of real API responses, regenerated from a
  running backend when the dataset or model changes.
