import { useState } from 'react';
import { predictReading } from '../api';
import { FEATURES, computeWqi, wqiCategory } from '../wqi';

const PRESETS = {
  safe: { ph: 7.1, Hardness: 170, Solids: 9000, Chloramines: 3.2, Sulfate: 210, Conductivity: 360, Organic_carbon: 8, Trihalomethanes: 45, Turbidity: 0.8 },
  unsafe: { ph: 9.6, Hardness: 290, Solids: 48000, Chloramines: 11.5, Sulfate: 450, Conductivity: 690, Organic_carbon: 24, Trihalomethanes: 110, Turbidity: 6.2 },
  typical: { ph: 7.0, Hardness: 196, Solids: 20000, Chloramines: 7.1, Sulfate: 334, Conductivity: 426, Organic_carbon: 14.3, Trihalomethanes: 66, Turbidity: 4.0 },
};

export default function Predictor() {
  const [values, setValues] = useState({ ...PRESETS.typical });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [offlineCalc, setOfflineCalc] = useState(false);
  const [history, setHistory] = useState([]);

  const set = (key, v) => setValues((prev) => ({ ...prev, [key]: Number(v) }));

  async function onPredict() {
    setLoading(true); setError(''); setOfflineCalc(false);
    try {
      const r = await predictReading(values);
      setResult(r);
      setHistory((h) => [{ ...r, at: new Date().toLocaleTimeString('en-IN') }, ...h].slice(0, 5));
    } catch (e) {
      // Backend not running: fall back to the browser WQI mirror.
      const { wqi, parts } = computeWqi(values);
      const category = wqiCategory(wqi);
      setResult({
        values, wqi, wqi_category: category, status: category,
        ml_probability: null, ml_prediction: null,
        model: 'WQI-only (backend not running — start it for the ML model)',
        breaches: [], sub_indices: parts, top_drivers: [], advice: [
          'Offline mode: only the rule-based WQI was calculated. Start the Flask backend for the Random Forest prediction.',
        ],
      });
      setOfflineCalc(true);
    } finally { setLoading(false); }
  }

  return (
    <div className="grid two" style={{ gap: 16, alignItems: 'start' }}>
      <div className="card">
        <h2>Enter a water sample</h2>
        {FEATURES.map((f) => (
          <div className="slider-row" key={f.key}>
            <label htmlFor={f.key}>{f.label} <span className="limit">({f.unit}, limit {f.limit})</span></label>
            <input id={f.key} type="range" min={f.min} max={f.max} step={f.step} value={values[f.key]}
              onChange={(e) => set(f.key, e.target.value)} aria-label={f.label} />
            <span className="val"><input type="number" value={values[f.key]} step={f.step} min={f.min} max={f.max}
              onChange={(e) => set(f.key, e.target.value)} aria-label={`${f.label} value`} style={{ width: 100 }} /> {f.unit}</span>
          </div>
        ))}
        <div className="row" style={{ marginTop: 14 }}>
          <button className="btn" onClick={onPredict} disabled={loading}>{loading ? 'Predicting…' : 'Predict water quality'}</button>
          <button className="btn secondary" onClick={() => setValues({ ...PRESETS.safe })}>Load safe sample</button>
          <button className="btn secondary" onClick={() => setValues({ ...PRESETS.unsafe })}>Load unsafe sample</button>
          <button className="btn secondary" onClick={() => setValues({ ...PRESETS.typical })}>Load typical sample</button>
        </div>
        {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
        {offlineCalc && <p className="note" style={{ marginTop: 12 }}><strong>Offline mode.</strong> The backend was not reachable, so this result uses the browser WQI calculation only, without the ML model. Start the backend (see About → How to run) for the full prediction.</p>}
      </div>

      <div>
        {result ? (
          <div className={`result ${result.status}`}>
            <span className="muted" style={{ color: '#fff', opacity: .85 }}>{result.model}</span>
            <div className="big">{result.status}</div>
            <p>WQI <strong>{result.wqi}</strong> / 100 ({result.wqi_category}) · ML prediction: <strong>{result.ml_prediction || 'not available'}</strong>
              {result.ml_probability != null && ` · potable probability ${(result.ml_probability * 100).toFixed(1)}%`}</p>
            <div className="gauge"><div style={{ width: `${result.wqi}%` }} /></div>
            {result.breaches?.length > 0 && (<><p><strong>Guideline breaches:</strong></p><ul className="clean">{result.breaches.map((b) => <li key={b.key}>{b.message}</li>)}</ul></>)}
            {result.breaches?.length === 0 && <p>No WHO guideline breaches for this sample.</p>}
            {result.top_drivers?.length > 0 && (<><p><strong>Biggest drivers of a poor score:</strong></p><ul className="clean">{result.top_drivers.map((d) => <li key={d.key}>{d.label} — sub-index {d.sub_index}/100, model importance {(d.importance * 100).toFixed(1)}%</li>)}</ul></>)}
            {result.advice?.length > 0 && (<><p><strong>What to do:</strong></p><ul className="clean">{result.advice.map((a, i) => <li key={i}>{a}</li>)}</ul></>)}
          </div>
        ) : (
          <div className="card"><h2>No prediction yet</h2><p className="sub">Adjust the sliders and press “Predict water quality”. Try the safe and unsafe presets to see how the status changes.</p></div>
        )}

        {history.length > 0 && (
          <div className="card" style={{ marginTop: 16 }}>
            <h3>Your predictions this session</h3>
            <div className="table-wrap"><table><thead><tr><th>Time</th><th>Status</th><th>WQI</th><th>ML probability</th></tr></thead>
              <tbody>{history.map((h, i) => <tr key={i}><td>{h.at}</td><td><span className={`badge ${h.status}`}>{h.status}</span></td><td>{h.wqi}</td><td>{h.ml_probability != null ? `${(h.ml_probability * 100).toFixed(0)}%` : '—'}</td></tr>)}</tbody></table></div>
          </div>
        )}
      </div>
    </div>
  );
}
