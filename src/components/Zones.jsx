import { useEffect, useState } from 'react';
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { fetchZoneHistory, fetchZones } from '../api';
import { FEATURES } from '../wqi';

function fmtTime(iso) {
  return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function ParamBar({ label, value, unit, pct, breach }) {
  return (
    <div className="param-bar">
      <div className="lbl"><span>{label} — <strong>{value} {unit}</strong></span><span className="muted">{breach ? 'Breach' : 'Within limit'}</span></div>
      <div className="bar-track"><div className="bar-fill" style={{ width: `${Math.min(100, pct)}%`, background: breach ? 'var(--danger)' : 'var(--teal)' }} /></div>
    </div>
  );
}

export default function Zones({ selectedZoneId, onSelectZone }) {
  const [zones, setZones] = useState([]);
  const [zoneId, setZoneId] = useState(selectedZoneId || 3);
  const [history, setHistory] = useState([]);

  useEffect(() => { setZoneId(selectedZoneId || 3); }, [selectedZoneId]);
  useEffect(() => { fetchZones().then(({ data }) => setZones(data)); }, []);
  useEffect(() => { fetchZoneHistory(zoneId, 72).then(({ data }) => setHistory(data)); }, [zoneId]);

  const zone = zones.find((z) => z.id === zoneId);
  const latest = zone?.latest;
  const pctFor = (key, value) => {
    const ranges = { ph: [0, 14], Hardness: [0, 330], Solids: [0, 62000], Chloramines: [0, 14], Sulfate: [0, 490], Conductivity: [0, 760], Organic_carbon: [0, 29], Trihalomethanes: [0, 125], Turbidity: [0, 7] };
    const [lo, hi] = ranges[key];
    return ((value - lo) / (hi - lo)) * 100;
  };

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card">
        <h2>Supply network — schematic</h2>
        <p className="sub">Water flows from the reservoir through the treatment plant into the distribution zones. Select any zone to inspect it. This is a schematic of the six replay zones, not a geographic map.</p>
        <div className="flow">
          <span className="step">North Reservoir (intake)</span><span className="arrow">→</span>
          <span className="step">East Treatment Plant</span><span className="arrow">→</span>
          <span className="step">Central Distribution</span><span className="arrow">→</span>
          <span className="step">South Residential</span><span className="arrow">→</span>
          <span className="step">West Industrial Fringe</span><span className="arrow">→</span>
          <span className="step">Rural Feed Line</span>
        </div>
      </div>

      <div className="grid three">
        {zones.map((z) => (
          <button
            key={z.id}
            className={`card zone-card ${z.id === zoneId ? 'selected' : ''}`}
            onClick={() => { setZoneId(z.id); onSelectZone(z.id); }}
          >
            <div className="zone-name">{z.name}</div>
            <div className="zone-meta">{z.type} · serves about {z.population}</div>
            <p><span className={`badge ${z.latest.status}`}>{z.latest.status}</span>{' '}<span className="muted">WQI {z.latest.wqi}</span></p>
            <p className="muted">Average WQI {z.avg_wqi} · {z.safe_pct}% Safe · {z.unsafe_count} Unsafe of {z.samples} samples</p>
          </button>
        ))}
      </div>

      {zone && latest && (
        <div className="grid two">
          <div className="card">
            <h2>{zone.name} — latest reading</h2>
            <p className="sub">{zone.type} · {fmtTime(latest.timestamp)} (replay clock) · Sample #{latest.id} of the dataset replay for this zone.</p>
            <p><span className={`badge ${latest.status}`}>{latest.status}</span>{' '}<span className="muted">WQI {latest.wqi} ({latest.wqi_category}) · ML potable probability {latest.ml_probability != null ? `${(latest.ml_probability * 100).toFixed(0)}%` : '—'} · Dataset label: {latest.potable_label === 1 ? 'Potable' : 'Non-potable'}</span></p>
            {FEATURES.map((f) => {
              const v = latest.values[f.key];
              const breach = latest.breaches.some((b) => b.key === f.key);
              return <ParamBar key={f.key} label={f.label} value={v != null ? Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '—'} unit={f.unit} pct={v != null ? pctFor(f.key, v) : 0} breach={breach} />;
            })}
            {latest.breaches.length > 0 && (
              <div>
                <h3>Guideline breaches</h3>
                <ul className="clean">{latest.breaches.map((b) => <li key={b.key}>{b.message}</li>)}</ul>
              </div>
            )}
          </div>
          <div className="card">
            <h2>WQI history — {zone.name}</h2>
            <p className="sub">Last 72 replayed readings for this zone.</p>
            <div style={{ height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={history.map((h) => ({ ...h, label: fmtTime(h.timestamp) }))}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={50} />
                  <YAxis domain={[0, 100]} />
                  <Tooltip />
                  <Line type="monotone" dataKey="wqi" name="WQI" stroke="#0e7c86" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="ph" name="pH" stroke="#123f6b" strokeWidth={1.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="muted">WQI 80+ is Safe, 50–79 Moderate, below 50 Unsafe. The ML probability is shown on the Dashboard current-reading card.</p>
          </div>
        </div>
      )}
    </div>
  );
}
