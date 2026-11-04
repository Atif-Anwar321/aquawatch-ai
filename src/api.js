// API client for the Flask backend, with a bundled offline fallback.
//
// When the backend is running (npm run dev proxies /api to
// http://localhost:5000, or VITE_API_URL points at it), every call
// below hits the live API. When the backend is not running, the UI
// falls back to src/data/fallback.json — a snapshot of real API
// responses generated from the Kaggle Water Potability dataset — and
// shows a "Saved snapshot data" banner. Predictions in offline mode use the same
// WQI rules in the browser (see wqi.js) without the ML model.

import fallback from './data/fallback.json';
import { EDGES, FLOW_ORDER, POLLUTANTS, POPULATION, runComparisonLocal } from './simulation';

const API_BASE = import.meta.env.VITE_API_URL || '';

async function get(path) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export async function fetchSummary() {
  try {
    return { data: await get('/api/summary'), live: true };
  } catch {
    return { data: fallback.summary, live: false };
  }
}

export async function fetchZones() {
  try {
    return { data: await get('/api/zones'), live: true };
  } catch {
    return { data: fallback.zones, live: false };
  }
}

export async function fetchZoneHistory(zoneId, points = 48) {
  try {
    return { data: await get(`/api/zones/${zoneId}/history?points=${points}`), live: true };
  } catch {
    return { data: fallback.history[String(zoneId)] || [], live: false };
  }
}

export async function fetchReadings({ limit = 25, offset = 0, status = 'All', zone = 'All' } = {}) {
  try {
    const data = await get(
      `/api/readings?limit=${limit}&offset=${offset}&status=${status}&zone=${zone}`,
    );
    return { data, live: true };
  } catch {
    let rows = fallback.readings.rows;
    if (status !== 'All') rows = rows.filter((r) => r.status === status);
    if (zone !== 'All') rows = rows.filter((r) => r.zone_id === Number(zone));
    return { data: { total: rows.length, limit, offset, rows: rows.slice(offset, offset + limit) }, live: false };
  }
}

export async function fetchAlerts() {
  try {
    return { data: await get('/api/alerts'), live: true };
  } catch {
    return { data: fallback.summary.alerts, live: false };
  }
}

export async function fetchModel() {
  try {
    return { data: await get('/api/model'), live: true };
  } catch {
    return { data: fallback.summary.model, live: false };
  }
}

export async function retrainModel() {
  const res = await fetch(`${API_BASE}/api/retrain`, { method: 'POST' });
  if (!res.ok) throw new Error(`Retrain failed (${res.status})`);
  return res.json();
}

export async function predictReading(values) {
  const res = await fetch(`${API_BASE}/api/predict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(values),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Prediction failed (${res.status})`);
  }
  return res.json();
}

export async function fetchNetwork() {
  try {
    return { data: await get('/api/network'), live: true };
  } catch {
    const byId = Object.fromEntries(fallback.summary.zones.map((z) => [z.id, z]));
    return {
      data: {
        flow_order: FLOW_ORDER,
        zones: FLOW_ORDER.map((id) => ({
          id,
          name: byId[id].name,
          type: byId[id].type,
          population: POPULATION[id],
          baseline_wqi: byId[id].avg_wqi,
        })),
        edges: EDGES.map((e) => ({ ...e, from_name: byId[e.from].name, to_name: byId[e.to].name })),
        pollutants: Object.values(POLLUTANTS),
        severity_levels: [
          { key: 'mild', label: 'Mild', concentration: 1.0 },
          { key: 'moderate', label: 'Moderate', concentration: 2.0 },
          { key: 'severe', label: 'Severe', concentration: 3.5 },
        ],
      },
      live: false,
    };
  }
}

export async function runSimulation(params, baselines) {
  try {
    const res = await fetch(`${API_BASE}/api/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Simulation failed (${res.status})`);
    }
    return { data: await res.json(), live: true };
  } catch {
    const local = runComparisonLocal(baselines, params);
    return {
      data: { ...local, scenario: params, baselines, zone_names: {} },
      live: false,
    };
  }
}

export { fallback };
