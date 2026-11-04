// Browser-side WQI calculation — a mirror of backend/wqi.py, used
// ONLY when the Flask backend is not running (offline mode). The live
// backend is the source of truth; keep the two in sync if you change
// the formula.

export const FEATURES = [
  { key: 'ph', label: 'pH', unit: 'pH units', limit: '6.5 – 8.5', min: 0, max: 14, step: 0.1, def: 7.0 },
  { key: 'Hardness', label: 'Hardness', unit: 'mg/L', limit: '≤ 300', min: 40, max: 330, step: 1, def: 196 },
  { key: 'Solids', label: 'Solids (TDS)', unit: 'mg/L*', limit: 'see note', min: 300, max: 62000, step: 100, def: 20000 },
  { key: 'Chloramines', label: 'Chloramines', unit: 'ppm', limit: '≤ 4', min: 0, max: 14, step: 0.1, def: 7.1 },
  { key: 'Sulfate', label: 'Sulfate', unit: 'mg/L', limit: '≤ 250', min: 120, max: 490, step: 1, def: 334 },
  { key: 'Conductivity', label: 'Conductivity', unit: 'µS/cm', limit: '≤ 400', min: 180, max: 760, step: 1, def: 426 },
  { key: 'Organic_carbon', label: 'Organic carbon', unit: 'ppm', limit: '≤ 10 (indicative)', min: 2, max: 29, step: 0.1, def: 14.3 },
  { key: 'Trihalomethanes', label: 'Trihalomethanes', unit: 'µg/L', limit: '≤ 80', min: 0, max: 125, step: 1, def: 66 },
  { key: 'Turbidity', label: 'Turbidity', unit: 'NTU', limit: '≤ 5', min: 1, max: 7, step: 0.1, def: 4.0 },
];

const WEIGHTS = {
  ph: 0.18, Hardness: 0.08, Solids: 0.1, Chloramines: 0.12, Sulfate: 0.1,
  Conductivity: 0.12, Organic_carbon: 0.07, Trihalomethanes: 0.07, Turbidity: 0.16,
};

function clip(x) {
  return Math.max(0, Math.min(100, x));
}

export function subIndex(key, v) {
  if (key === 'ph') {
    if (v >= 6.5 && v <= 8.5) return 100;
    return clip(v < 6.5 ? 100 - (6.5 - v) * 40 : 100 - (v - 8.5) * 40);
  }
  if (key === 'Solids') {
    const lo = Math.log10(1000);
    const hi = Math.log10(60000);
    return clip(100 - ((Math.log10(Math.max(v, 1)) - lo) / (hi - lo)) * 100);
  }
  const goodBad = {
    Hardness: [200, 350], Chloramines: [4, 13], Sulfate: [250, 500],
    Conductivity: [400, 800], Organic_carbon: [10, 30],
    Trihalomethanes: [60, 125], Turbidity: [1, 10],
  }[key];
  const [good, bad] = goodBad;
  if (v <= good) return 100;
  if (v >= bad) return 0;
  return clip(100 - ((v - good) / (bad - good)) * 100);
}

export function computeWqi(values) {
  let weighted = 0;
  let total = 0;
  const parts = {};
  for (const f of FEATURES) {
    const s = subIndex(f.key, Number(values[f.key]));
    parts[f.key] = Math.round(s * 10) / 10;
    weighted += s * WEIGHTS[f.key];
    total += WEIGHTS[f.key];
  }
  return { wqi: Math.round((weighted / total) * 10) / 10, parts };
}

export function wqiCategory(wqi) {
  return wqi >= 80 ? 'Safe' : wqi >= 50 ? 'Moderate' : 'Unsafe';
}

export function statusColor(status) {
  return status === 'Safe' ? 'var(--safe)' : status === 'Moderate' ? 'var(--warn)' : 'var(--danger)';
}
