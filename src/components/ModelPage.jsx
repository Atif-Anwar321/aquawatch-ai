import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fetchModel, retrainModel } from '../api';
import { FEATURES } from '../wqi';

export default function ModelPage() {
  const [model, setModel] = useState(null);
  const [retraining, setRetraining] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => { fetchModel().then(({ data }) => setModel(data)); }, []);

  async function onRetrain() {
    setRetraining(true); setMessage('');
    try {
      const r = await retrainModel();
      setModel(r.metrics);
      setMessage(`Retrained. New accuracy: ${(r.metrics.accuracy * 100).toFixed(1)}% on the held-out test set.`);
    } catch (e) {
      setMessage('Retraining needs the Flask backend. Start it (see About → How to run) and try again.');
    } finally { setRetraining(false); }
  }

  if (!model) return <p className="empty">Loading model details…</p>;
  const cm = model.confusion_matrix?.matrix || [[0, 0], [0, 0]];
  const importance = Object.entries(model.feature_importance || {})
    .map(([key, value]) => ({ name: FEATURES.find((f) => f.key === key)?.label || key, importance: +(value * 100).toFixed(1) }))
    .sort((a, b) => b.importance - a.importance);

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="grid kpis">
        <div className="card kpi"><div className="label">Accuracy</div><div className="value">{(model.accuracy * 100).toFixed(1)}%</div><div className="hint">Held-out test set ({model.test_samples} samples)</div></div>
        <div className="card kpi"><div className="label">Precision</div><div className="value">{(model.precision * 100).toFixed(1)}%</div><div className="hint">Of predicted potable, how many were potable</div></div>
        <div className="card kpi"><div className="label">Recall</div><div className="value">{(model.recall * 100).toFixed(1)}%</div><div className="hint">Of truly potable, how many were found</div></div>
        <div className="card kpi"><div className="label">F1 score</div><div className="value">{model.f1.toFixed(3)}</div><div className="hint">Balance of precision and recall</div></div>
      </div>
      <p className="note"><strong>Read these numbers honestly.</strong> This public dataset is known to be hard for shallow models: a Random Forest reaches about 66% accuracy here, and the F1 of {model.f1.toFixed(2)} shows it misses many potable samples. That is why this system never relies on the ML model alone — the WQI rule check (WHO limits) is the primary safety signal, and the model is a second opinion. Do not present 66% as a production-grade safety system.</p>

      <div className="grid two">
        <div className="card">
          <h2>Confusion matrix (test set)</h2>
          <p className="sub">Rows are the true dataset label, columns are the model&apos;s prediction.</p>
          <div className="matrix">
            <div className="tn">True non-potable<br />{cm[0][0]}</div>
            <div className="fp">False potable<br />{cm[0][1]}</div>
            <div className="fn">False non-potable<br />{cm[1][0]}</div>
            <div className="tp">True potable<br />{cm[1][1]}</div>
          </div>
          <p className="muted" style={{ marginTop: 10 }}>False potable (top right) is the dangerous error: water predicted safe that is not. In this system a high WQI is also required before a sample can be called Safe, which reduces that risk.</p>
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn" onClick={onRetrain} disabled={retraining}>{retraining ? 'Retraining…' : 'Retrain model on the dataset'}</button>
          </div>
          {message && <p className="muted">{message}</p>}
          <p className="muted">Model: {model.model} · Split: {model.split} · Missing values: {model.imputation} imputation.</p>
        </div>
        <div className="card">
          <h2>Which parameters matter most?</h2>
          <p className="sub">Random Forest feature importance (% of splits). Sulfate and Solids dominate in this dataset.</p>
          <div style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={importance} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="importance" fill="#0e7c86" name="Importance (%)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>How the Water Quality Index (WQI) is calculated</h2>
        <p className="sub">Each parameter gets a 0–100 sub-index from its WHO guideline limit (100 = fully compliant, 0 = far outside the limit). The WQI is the weighted average. The full formula lives in <code>backend/wqi.py</code> so a reviewer can audit it.</p>
        <div className="table-wrap"><table>
          <thead><tr><th>Parameter</th><th>Unit</th><th>Guideline</th><th>Weight</th><th>Sub-index rule</th></tr></thead>
          <tbody>
            {FEATURES.map((f) => (
              <tr key={f.key}><td>{f.label}</td><td>{f.unit}</td><td>{f.limit}</td>
                <td>{({ ph: '18%', Hardness: '8%', Solids: '10%', Chloramines: '12%', Sulfate: '10%', Conductivity: '12%', Organic_carbon: '7%', Trihalomethanes: '7%', Turbidity: '16%' })[f.key]}</td>
                <td>{f.key === 'ph' ? '100 inside 6.5–8.5, falling 40 points per pH unit outside' : f.key === 'Solids' ? 'Log scale fitted to the dataset range (see note)' : '100 up to the guideline, then linear to 0 at the “bad” value'}</td></tr>
            ))}
          </tbody>
        </table></div>
        <p className="muted"><strong>Solids note:</strong> in this dataset Solids average about 22,000, far above drinking-water TDS levels. A literal WHO 500 mg/L comparison would score almost every row at 0, so the Solids sub-index uses a log scale over the dataset&apos;s own range and is a relative indicator. All other limits are WHO/EPA values. Categories: WQI ≥ 80 Safe, 50–79 Moderate, &lt; 50 Unsafe.</p>
      </div>
    </div>
  );
}
