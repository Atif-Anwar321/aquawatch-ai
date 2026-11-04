import { useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid, Legend, Line, LineChart, Pie, PieChart, Cell,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { fetchSummary, fetchZoneHistory } from '../api';
import { FEATURES } from '../wqi';

const PIE_COLORS = { Safe: '#1a7f4b', Moderate: '#d99a26', Unsafe: '#c0392b' };

function fmtTime(iso) {
  const d = new Date(iso);
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function Dashboard({ onSelectZone, onGoTab }) {
  const [summary, setSummary] = useState(null);
  const [live, setLive] = useState(false);
  const [zoneId, setZoneId] = useState(3);
  const [history, setHistory] = useState([]);
  const [replay, setReplay] = useState(false);
  const [replayIdx, setReplayIdx] = useState(null);

  useEffect(() => {
    fetchSummary().then(({ data, live: isLive }) => { setSummary(data); setLive(isLive); });
  }, []);

  useEffect(() => {
    fetchZoneHistory(zoneId, 48).then(({ data }) => {
      setHistory(data);
      setReplayIdx(data.length - 1);
    });
  }, [zoneId]);

  useEffect(() => {
    if (!replay || history.length === 0) return undefined;
    const t = setInterval(() => setReplayIdx((i) => (i + 1) % history.length), 2500);
    return () => clearInterval(t);
  }, [replay, history]);

  const current = useMemo(() => {
    if (history.length === 0) return null;
    return history[replayIdx ?? history.length - 1];
  }, [history, replayIdx]);

  if (!summary) return <p className="empty">Loading dashboard…</p>;

  const pie = Object.entries(summary.status_counts).map(([name, value]) => ({ name, value }));
  const zones = summary.zones || [];
  const selectedZone = zones.find((z) => z.id === zoneId);

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="grid kpis">
        <div className="card kpi"><div className="label">Dataset samples</div><div className="value">{summary.total_samples.toLocaleString('en-IN')}</div><div className="hint">Kaggle Water Potability dataset</div></div>
        <div className="card kpi"><div className="label">Potable in dataset</div><div className="value">{summary.potable_pct}%</div><div className="hint">{summary.potable_samples.toLocaleString('en-IN')} of {summary.total_samples.toLocaleString('en-IN')} labelled potable</div></div>
        <div className="card kpi"><div className="label">Average WQI</div><div className="value">{summary.avg_wqi}</div><div className="hint">0–100, WHO-limit sub-indices (see Model &amp; WQI)</div></div>
        <div className="card kpi"><div className="label">Unsafe samples</div><div className="value">{summary.status_counts.Unsafe.toLocaleString('en-IN')}</div><div className="hint">{summary.status_counts.Safe} Safe · {summary.status_counts.Moderate} Moderate</div></div>
        <div className="card kpi"><div className="label">Model accuracy</div><div className="value">{summary.model ? `${(summary.model.accuracy * 100).toFixed(1)}%` : '—'}</div><div className="hint">Random Forest, held-out test set</div></div>
        <div className="card kpi"><div className="label">Active alerts</div><div className="value">{summary.alerts.length}</div><div className="hint">From latest zone readings</div></div>
      </div>

      <div className="grid two">
        <div className="card">
          <div className="row between">
            <h2>Water Quality Index — replay over time</h2>
            <select value={zoneId} onChange={(e) => setZoneId(Number(e.target.value))} aria-label="Select zone">
              {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
            </select>
          </div>
          <p className="sub">
            {selectedZone ? `${selectedZone.type} · ${selectedZone.samples} replayed samples · serving about ${selectedZone.population} people.` : ''}
            {' '}Each point is one dataset row replayed for this zone (replay clock, not a live sensor feed).
          </p>
          <div style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={history.map((h) => ({ ...h, label: fmtTime(h.timestamp) }))}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={40} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="wqi" name="WQI" stroke="#0e7c86" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Turbidity" name="Turbidity (NTU)" stroke="#d99a26" strokeWidth={1.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn" onClick={() => setReplay((r) => !r)}>{replay ? 'Pause replay' : 'Play replay'}</button>
            <button className="btn secondary" onClick={() => onSelectZone(zoneId)}>Open {selectedZone?.name} details</button>
            <span className="muted">{replay ? 'Replaying dataset rows for this zone, one every 2.5 seconds.' : 'Replay paused at the latest reading.'}</span>
          </div>
        </div>

        <div className="card">
          <h2>Current reading {current ? `— ${fmtTime(current.timestamp)}` : ''}</h2>
          <p className="sub">Latest replayed reading for {selectedZone?.name}. Status combines the WQI with the Random Forest probability.</p>
          {current && (
            <>
              <p><span className={`badge ${current.status}`}>{current.status}</span>{' '}<span className="muted">WQI {current.wqi} · ML potable probability {current.ml_probability != null ? `${(current.ml_probability * 100).toFixed(0)}%` : 'not available'}</span></p>
              <div className="table-wrap"><table><tbody>
                {FEATURES.map((f) => (
                  <tr key={f.key}><td>{f.label}</td><td><strong>{current[f.key] != null ? Number(current[f.key]).toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '—'}</strong> {f.unit}</td><td className="muted">Limit {f.limit}</td></tr>
                ))}
              </tbody></table></div>
            </>
          )}
        </div>
      </div>

      <div className="grid two">
        <div className="card">
          <h2>Classification of all samples</h2>
          <p className="sub">Final status for every dataset row: WQI ≥ 80 with a potable ML prediction is Safe, 50–79 is Moderate, below 50 is Unsafe.</p>
          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pie} dataKey="value" nameKey="name" outerRadius={95} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {pie.map((p) => <Cell key={p.name} fill={PIE_COLORS[p.name]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <p className="muted">Most rows land in Moderate: the dataset&apos;s Solids values are far above drinking-water TDS levels, which pulls the WQI down. This is a property of the public dataset, not a fault in the code — see Model &amp; WQI.</p>
        </div>

        <div className="card">
          <h2>Alerts</h2>
          <p className="sub">Generated from the latest reading in each zone. In the original synopsis these went out by Telegram / email; here they are in-app alerts, ready to be wired to an email or messaging service.</p>
          {summary.alerts.length === 0 && <p className="empty">No active alerts. All zones are within guideline limits on their latest reading.</p>}
          {summary.alerts.map((a) => (
            <div className={`alert ${a.severity}`} key={a.id}>
              <h4>{a.title} <span className={`badge ${a.severity}`}>{a.severity}</span></h4>
              <p>{a.message}</p>
              <p>WQI {a.wqi} · {fmtTime(a.timestamp)}</p>
              <button className="btn secondary" style={{ marginTop: 8 }} onClick={() => onSelectZone(a.zone_id)}>View zone</button>
            </div>
          ))}
          <button className="btn secondary" onClick={() => onGoTab('predictor')}>Test a sample with the AI predictor →</button>
        </div>
      </div>
      <p className="muted">Data source: {live ? 'Live Flask backend' : 'Bundled snapshot'} · Kaggle Water Potability dataset (3,276 samples). No hardware or live sensors are used in this version.</p>
    </div>
  );
}
