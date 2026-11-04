import { useCallback, useEffect, useState } from 'react';
import { fetchReadings, fetchZones } from '../api';
import { FEATURES } from '../wqi';

const PAGE = 25;

function toCsv(rows) {
  const head = ['id', 'zone', 'timestamp', 'status', 'wqi', 'ml_probability', 'potable_label', ...FEATURES.map((f) => f.key)];
  const lines = [head.join(',')];
  for (const r of rows) {
    lines.push([r.id, `"${r.zone}"`, r.timestamp, r.status, r.wqi, r.ml_probability ?? '', r.potable_label ?? '',
      ...FEATURES.map((f) => r.values[f.key] ?? '')].join(','));
  }
  return lines.join('\n');
}

export default function Explorer() {
  const [zones, setZones] = useState([]);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState('All');
  const [zone, setZone] = useState('All');
  const [page, setPage] = useState(0);
  const [live, setLive] = useState(true);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, live: isLive } = await fetchReadings({ limit: PAGE, offset: page * PAGE, status, zone });
    setRows(data.rows); setTotal(data.total); setLive(isLive); setLoading(false);
  }, [page, status, zone]);

  useEffect(() => { fetchZones().then(({ data }) => setZones(data)); }, []);
  useEffect(() => { load(); }, [load]);

  const pages = Math.max(1, Math.ceil(total / PAGE));

  function exportCsv() {
    const blob = new Blob([toCsv(rows)], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `water-quality-page-${page + 1}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="card">
      <h2>Dataset explorer</h2>
      <p className="sub">
      </p>
      <div className="row" style={{ marginBottom: 14 }}>
        <label>Status <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }}>
          <option>All</option><option>Safe</option><option>Moderate</option><option>Unsafe</option>
        </select></label>
        <label>Zone <select value={zone} onChange={(e) => { setZone(e.target.value); setPage(0); }}>
          <option value="All">All zones</option>
          {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
        </select></label>
        <button className="btn secondary" onClick={exportCsv}>Export this page (CSV)</button>
        <span className="muted">{total.toLocaleString('en-IN')} matching rows · page {page + 1} of {pages}</span>
      </div>
      {loading ? <p className="empty">Loading…</p> : (
        <div className="table-wrap"><table>
          <thead><tr><th>#</th><th>Zone</th><th>Time (replay)</th><th>Status</th><th>WQI</th><th>ML %</th><th>Label</th>
            {FEATURES.map((f) => <th key={f.key}>{f.label}</th>)}</tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.id}</td><td>{r.zone}</td>
                <td>{new Date(r.timestamp).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                <td><span className={`badge ${r.status}`}>{r.status}</span></td>
                <td>{r.wqi}</td>
                <td>{r.ml_probability != null ? `${(r.ml_probability * 100).toFixed(0)}%` : '—'}</td>
                <td>{r.potable_label === 1 ? 'Potable' : 'Non-potable'}</td>
                {FEATURES.map((f) => <td key={f.key}>{r.values[f.key] != null ? Number(r.values[f.key]).toLocaleString('en-IN', { maximumFractionDigits: 1 }) : '—'}</td>)}
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
      <div className="row" style={{ marginTop: 14 }}>
        <button className="btn secondary" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>← Previous</button>
        <button className="btn secondary" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>Next →</button>
        <span className="muted">Missing values in the raw file (pH, Sulfate, Trihalomethanes) are shown as —; the model fills them with the median during training.</span>
      </div>
    </div>
  );
}
