import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { fetchNetwork, runSimulation } from '../api';
import { POLLUTANTS, SEVERITY } from '../simulation';
import FlowMap from './FlowMap.jsx';

const ZONE_COLORS = { 1: '#0e7c86', 2: '#1fb6c9', 5: '#7c5cd6', 3: '#2f6fd6', 4: '#d97706', 6: '#4d7c0f' };
const fmtPop = (n) => (n >= 100000 ? `${(n / 100000).toFixed(1)} lakh` : `${(n / 1000).toFixed(0)},000`);

export default function Simulator() {
  const [network, setNetwork] = useState(null);
  const [params, setParams] = useState({
    source_zone_id: 5, pollutant: 'chemical', severity: 'severe',
    duration_hours: 3, horizon_hours: 24, actions: [],
  });
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [hour, setHour] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [showWater, setShowWater] = useState(true);
  const [showPollutant, setShowPollutant] = useState(true);
  const [selectedZone, setSelectedZone] = useState(5);
  const [actionForm, setActionForm] = useState({ type: 'valve_close', from_zone_id: 5, to_zone_id: 3, hour: 1 });
  const timer = useRef(null);

  useEffect(() => {
    let cancelled = false;
    fetchNetwork().then(({ data }) => { if (!cancelled) setNetwork(data); });
    return () => { cancelled = true; };
  }, []);

  const baselines = useMemo(() => {
    if (!network) return {};
    return Object.fromEntries(network.zones.map((z) => [z.id, z.baseline_wqi]));
  }, [network]);

  const zoneNames = useMemo(() => {
    if (!network) return {};
    return Object.fromEntries(network.zones.map((z) => [z.id, z.name]));
  }, [network]);

  useEffect(() => {
    if (!network) return;
    let cancelled = false;
    setError('');
    runSimulation(params, baselines)
      .then(({ data }) => { if (!cancelled) { setResult(data); setHour(0); } })
      .catch((e) => { if (!cancelled) setError(e.message || 'Simulation failed.'); });
    return () => { cancelled = true; };
  }, [network, params, baselines]);

  useEffect(() => {
    if (!playing || !result) return;
    timer.current = setInterval(() => {
      setHour((h) => {
        if (h >= params.horizon_hours) { setPlaying(false); return h; }
        return h + 1;
      });
    }, 800 / speed);
    return () => clearInterval(timer.current);
  }, [playing, result, params.horizon_hours, speed]);

  const set = (key, value) => setParams((p) => ({ ...p, [key]: value }));

  function addAction() {
    const action = { type: actionForm.type, hour: Number(actionForm.hour) };
    if (actionForm.type === 'valve_close') {
      action.from_zone_id = Number(actionForm.from_zone_id);
      action.to_zone_id = Number(actionForm.to_zone_id);
    }
    setParams((p) => ({ ...p, actions: [...p.actions, action] }));
  }

  function loadPreset(kind) {
    if (kind === 'west-chemical') {
      setParams({ source_zone_id: 5, pollutant: 'chemical', severity: 'severe', duration_hours: 3, horizon_hours: 24, actions: [] });
    } else if (kind === 'central-sewage') {
      setParams({ source_zone_id: 3, pollutant: 'sewage', severity: 'moderate', duration_hours: 4, horizon_hours: 24, actions: [] });
    } else {
      setParams({ source_zone_id: 1, pollutant: 'runoff', severity: 'moderate', duration_hours: 2, horizon_hours: 24, actions: [] });
    }
    setSelectedZone(kind === 'central-sewage' ? 3 : kind === 'west-chemical' ? 5 : 1);
  }

  const withActions = result?.with_actions;
  const withoutActions = result?.without_actions;
  const currentStep = withActions?.timeline[Math.min(hour, withActions.timeline.length - 1)];
  const selectedNow = currentStep?.zones.find((z) => z.zone_id === selectedZone);
  const pollutant = POLLUTANTS[params.pollutant];

  const wqiChart = useMemo(() => {
    if (!withActions) return [];
    return withActions.timeline.map((step) => {
      const row = { hour: step.hour };
      for (const z of step.zones) row[`z${z.zone_id}`] = z.wqi;
      return row;
    });
  }, [withActions]);

  const popChart = useMemo(() => {
    if (!withActions || !withoutActions) return [];
    return withActions.timeline.map((step, i) => ({
      hour: step.hour,
      'With your actions': step.unsafe_population,
      'No action': withoutActions.timeline[i]?.unsafe_population ?? 0,
    }));
  }, [withActions, withoutActions]);

  const closedEdges = useMemo(() => {
    const closed = new Set();
    for (const a of params.actions) {
      if (a.type === 'valve_close' && a.hour <= hour) closed.add(`${a.from_zone_id}-${a.to_zone_id}`);
    }
    return closed;
  }, [params.actions, hour]);

  const actionLabel = (a) => {
    if (a.type === 'valve_close') return `Close valve ${zoneNames[a.from_zone_id]} → ${zoneNames[a.to_zone_id]} at hour ${a.hour}`;
    if (a.type === 'treatment_boost') return `Boost treatment from hour ${a.hour}`;
    return `Issue public advisory from hour ${a.hour}`;
  };

  if (!network) return <div className="card"><h2>Contamination Spread Simulator</h2><p className="sub">Loading the supply network…</p></div>;

  const summary = withActions?.summary;
  const baselineSummary = withoutActions?.summary;
  const comparison = result?.comparison;

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card">
        <h2>Contamination Spread Simulator </h2>
        <p className="sub">
          A virtual copy of the six-zone supply network. Inject a pollutant in one zone and watch it
          travel downstream, hour by hour. Then test an action — close a valve, boost treatment, warn
          the public — and compare the outcome against doing nothing. This answers the planning
          question the dashboard alone cannot: <em>if this happens, what happens next, and what should we do first?</em>
        </p>
        <div className="row">
          <button className="btn secondary" onClick={() => loadPreset('west-chemical')}>Chemical leak — West Industrial</button>
          <button className="btn secondary" onClick={() => loadPreset('central-sewage')}>Sewage overflow — Central</button>
          <button className="btn secondary" onClick={() => loadPreset('reservoir-runoff')}>Monsoon runoff — Reservoir</button>
        </div>
      </div>

      <div className="grid two" style={{ gap: 16, alignItems: 'start' }}>
        <div className="card">
          <h2>1. Inject the pollution</h2>
          <div className="grid" style={{ gap: 10 }}>
            <label>Source zone — where does the pollution enter?
              <select value={params.source_zone_id} onChange={(e) => { set('source_zone_id', Number(e.target.value)); setSelectedZone(Number(e.target.value)); }} style={{ width: '100%', marginTop: 4 }}>
                {network.zones.map((z) => <option key={z.id} value={z.id}>{z.name} — {fmtPop(z.population)} people</option>)}
              </select>
            </label>
            <label>Pollutant
              <select value={params.pollutant} onChange={(e) => set('pollutant', e.target.value)} style={{ width: '100%', marginTop: 4 }}>
                {Object.values(POLLUTANTS).map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </label>
            <p className="muted" style={{ margin: 0 }}>{pollutant.description}</p>
            <label>Severity
              <select value={params.severity} onChange={(e) => set('severity', e.target.value)} style={{ width: '100%', marginTop: 4 }}>
                {Object.values(SEVERITY).map((s) => <option key={s.key} value={s.key}>{s.label} (concentration {s.concentration})</option>)}
              </select>
            </label>
            <label>Leak duration — {params.duration_hours} hour(s)
              <input type="range" min={1} max={12} value={params.duration_hours} onChange={(e) => set('duration_hours', Number(e.target.value))} />
            </label>
            <label>Simulation horizon
              <select value={params.horizon_hours} onChange={(e) => set('horizon_hours', Number(e.target.value))} style={{ width: '100%', marginTop: 4 }}>
                {[12, 24, 36, 48].map((h) => <option key={h} value={h}>{h} hours</option>)}
              </select>
            </label>
          </div>

          <h3 style={{ marginTop: 20 }}>2. Test an action</h3>
          <p className="sub">Actions take effect from the hour you choose. The same scenario is also run with no actions, so you can see exactly what your action saved.</p>
          <div className="grid" style={{ gap: 10 }}>
            <label>Action
              <select value={actionForm.type} onChange={(e) => setActionForm((f) => ({ ...f, type: e.target.value }))} style={{ width: '100%', marginTop: 4 }}>
                <option value="valve_close">Close a valve (stop flow on one pipe)</option>
                <option value="treatment_boost">Boost treatment</option>
                <option value="advisory">Issue public advisory (boil water)</option>
              </select>
            </label>
            {actionForm.type === 'valve_close' && (
              <label>Pipe to close
                <select value={`${actionForm.from_zone_id}-${actionForm.to_zone_id}`} onChange={(e) => { const [f, t] = e.target.value.split('-').map(Number); setActionForm((prev) => ({ ...prev, from_zone_id: f, to_zone_id: t })); }} style={{ width: '100%', marginTop: 4 }}>
                  {network.edges.map((e) => <option key={`${e.from}-${e.to}`} value={`${e.from}-${e.to}`}>{e.from_name} → {e.to_name} ({e.travel_hours} h travel)</option>)}
                </select>
              </label>
            )}
            <label>At hour <input type="number" min={0} max={params.horizon_hours} value={actionForm.hour} onChange={(e) => setActionForm((f) => ({ ...f, hour: Number(e.target.value) }))} style={{ width: 90, marginLeft: 8 }} /></label>
            <div><button className="btn" onClick={addAction}>Add action</button>{' '}
              {params.actions.length > 0 && <button className="btn secondary" onClick={() => setParams((p) => ({ ...p, actions: [] }))}>Clear all actions</button>}</div>
          </div>
          {params.actions.length > 0 && (
            <ul className="clean" style={{ marginTop: 10 }}>
              {params.actions.map((a, i) => (
                <li key={i}>{actionLabel(a)}{' '}
                  <button className="btn secondary" style={{ padding: '3px 9px', fontSize: 13 }} onClick={() => setParams((p) => ({ ...p, actions: p.actions.filter((_, j) => j !== i) }))}>Remove</button>
                </li>
              ))}
            </ul>
          )}
          {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
        </div>

        <div className="card">
          <h2>3. Watch it spread</h2>
          <div className="row between">
            <button className="btn" onClick={() => setPlaying((p) => !p)}>{playing ? 'Pause' : 'Play'} simulation</button>
            <strong>Hour {hour} of {params.horizon_hours}</strong>
            <button className="btn secondary" onClick={() => { setPlaying(false); setHour(0); }}>Restart</button>
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <label>Speed
              <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} style={{ marginLeft: 8 }}>
                <option value={0.5}>0.5× slow</option>
                <option value={1}>1× normal</option>
                <option value={2}>2× fast</option>
              </select>
            </label>
            <label><input type="checkbox" checked={showWater} onChange={(e) => setShowWater(e.target.checked)} /> Flowing water</label>
            <label><input type="checkbox" checked={showPollutant} onChange={(e) => setShowPollutant(e.target.checked)} /> Pollutant flow</label>
          </div>
          <input type="range" min={0} max={params.horizon_hours} value={hour} onChange={(e) => { setPlaying(false); setHour(Number(e.target.value)); }} style={{ marginTop: 12 }} aria-label="Simulation hour" />
          {currentStep && (
            <p className="muted" style={{ marginTop: 8 }}>
              At hour {hour}: <strong>{currentStep.unsafe_population.toLocaleString('en-IN')} people</strong> in Unsafe zones
              {currentStep.advisory_active ? ' · public advisory active' : ''}.
              Click a zone below to inspect it.
            </p>
          )}
          <FlowMap
            zones={network.zones}
            currentStep={currentStep}
            selectedZone={selectedZone}
            onSelectZone={setSelectedZone}
            closedEdges={closedEdges}
            sourceZoneId={params.source_zone_id}
            pollutantKey={params.pollutant}
            showWater={showWater}
            showPollutant={showPollutant}
          />
          <p className="muted">
            Blue droplets are clean water flowing along the pipes; coloured blobs are the pollutant
            travelling downstream. Water — and pollution — only flows in the direction of the pipes.
            Upstream zones are never affected by a downstream leak. Map positions are schematic, not
            real GPS locations; travel times and dilution for each pipe are fixed in <code>backend/simulation.py</code>.
          </p>

          {selectedNow && (
            <div className="card" style={{ marginTop: 12, boxShadow: 'none' }}>
              <h3>{zoneNames[selectedZone]} at hour {hour}</h3>
              <p className="sub">Baseline WQI {baselines[selectedZone]} · Now WQI <strong>{selectedNow.wqi}</strong> ({selectedNow.status}) · Pollutant concentration {selectedNow.concentration}</p>
              <p className="sub">Estimated rise caused by the pollutant in this hour:</p>
              <ul className="clean">
                {Object.entries(selectedNow.parameter_deltas).map(([k, v]) => <li key={k}>{k}: +{v}</li>)}
              </ul>
            </div>
          )}
        </div>
      </div>

      {summary && baselineSummary && (
        <div className="card">
          <h2>Result — what your actions changed</h2>
          <div className="table-wrap"><table>
            <thead><tr><th>Outcome</th><th>With your actions</th><th>No action</th><th>Saved by acting</th></tr></thead>
            <tbody>
              <tr><td>Peak population in Unsafe zones</td><td>{summary.peak_unsafe_population.toLocaleString('en-IN')}</td><td>{baselineSummary.peak_unsafe_population.toLocaleString('en-IN')}</td><td><strong>{comparison.population_saved.toLocaleString('en-IN')} people</strong></td></tr>
              <tr><td>Zones that became Unsafe</td><td>{summary.zones_affected}</td><td>{baselineSummary.zones_affected}</td><td>{comparison.zones_saved} zone(s)</td></tr>
              <tr><td>Unsafe zone-hours</td><td>{summary.unsafe_zone_hours}</td><td>{baselineSummary.unsafe_zone_hours}</td><td>{comparison.unsafe_hours_saved} hour(s)</td></tr>
              <tr><td>Lowest WQI (worst hour)</td><td>{summary.worst_wqi} (hour {summary.worst_hour})</td><td>{baselineSummary.worst_wqi} (hour {baselineSummary.worst_hour})</td><td>—</td></tr>
              <tr><td>All zones safe again</td><td>{summary.recovery_hour === null ? 'Not within the horizon' : `Hour ${summary.recovery_hour}`}</td><td>{baselineSummary.recovery_hour === null ? 'Not within the horizon' : `Hour ${baselineSummary.recovery_hour}`}</td><td>—</td></tr>
              <tr><td>Peak population at health risk (advisory lowers this)</td><td>{summary.peak_population_at_risk.toLocaleString('en-IN')}</td><td>{baselineSummary.peak_population_at_risk.toLocaleString('en-IN')}</td><td>—</td></tr>
            </tbody>
          </table></div>
          {params.actions.length === 0 && <p className="muted">No actions added yet — the two columns are identical. Add a valve closure or a treatment boost above and watch the “saved” column change.</p>}
        </div>
      )}

      <div className="grid two" style={{ gap: 16, alignItems: 'start' }}>
        <div className="card">
          <h2>WQI over time — with your actions</h2>
          <p className="sub">Each line is one zone. The fall starts later the further downstream a zone is — that delay is the time you have to act.</p>
          <div style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={wqiChart}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="hour" label={{ value: 'Hour', position: 'insideBottomRight', offset: -4 }} />
                <YAxis domain={[0, 100]} label={{ value: 'WQI', angle: -90, position: 'insideLeft' }} />
                <Tooltip />
                <Legend />
                {network.zones.map((z) => (
                  <Line key={z.id} type="monotone" dataKey={`z${z.id}`} name={z.name} stroke={ZONE_COLORS[z.id]} strokeWidth={2} dot={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <h2 style={{ marginTop: 20 }}>People in Unsafe zones</h2>
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={popChart}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="hour" />
                <YAxis />
                <Tooltip formatter={(v) => Number(v).toLocaleString('en-IN')} />
                <Legend />
                <Line type="monotone" dataKey="With your actions" stroke="#1a7f4b" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="No action" stroke="#c0392b" strokeWidth={2} strokeDasharray="6 4" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <h2>Timeline of events</h2>
          {withActions?.events.length ? (
            <ul className="clean">
              {withActions.events.map((e, i) => <li key={i}><strong>Hour {e.hour}:</strong> {zoneNames[e.zone_id]} — {e.message}</li>)}
            </ul>
          ) : <p className="sub">No zone became Unsafe in this scenario. Try a higher severity, a longer leak, or a pollutant with a stronger effect.</p>}
          <h3 style={{ marginTop: 20 }}>How the model works — and its limits</h3>
          <ul className="clean">
            <li>Each zone starts at its measured average WQI from the dataset.</li>
            <li>Pollution travels only downstream, with a fixed travel time per pipe, is diluted on each pipe, and decays every hour.</li>
            <li>Water passing the treatment plant loses part of its pollutant load; a treatment boost removes more and speeds up decay.</li>
            <li>A closed valve lets only 10% of the pollutant through on that pipe, but it also stops supply downstream — the model shows the water-quality effect only, not the supply shortage.</li>
            <li>An advisory does not change WQI; it reduces the population counted as at health risk, because people boil water or use stored water.</li>
            <li><strong>Limit:</strong> this is a simplified planning model. It does not model pressure, pipe diameter or pumps, and it is not a hydraulic simulator. Travel times and dilution factors in <code>backend/simulation.py</code> must be calibrated against measured flow data before operational use.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
