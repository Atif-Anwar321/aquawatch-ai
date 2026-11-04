import { EDGES } from '../simulation';

// Schematic map positions (viewBox 680 x 460). These are illustrative
// layout positions, NOT real GPS coordinates — the six zones are a
// modelled network, so inventing lat/lng values would be misleading.
// Water flows along the curved pipes in flow order:
// North Reservoir -> East Treatment Plant -> West Industrial Fringe
// -> Central Distribution -> South Residential -> Rural Feed Line.
const POS = {
  1: { x: 95, y: 70, icon: '🌊' },
  2: { x: 330, y: 65, icon: '⚙️' },
  5: { x: 545, y: 135, icon: '🏭' },
  3: { x: 390, y: 265, icon: '🏙️' },
  4: { x: 165, y: 350, icon: '🏠' },
  6: { x: 460, y: 400, icon: '🌾' },
};

// Control point for each pipe's quadratic curve, keyed "from-to".
const CONTROL = {
  '1-2': { x: 212, y: 38 },
  '2-5': { x: 470, y: 58 },
  '5-3': { x: 520, y: 232 },
  '3-4': { x: 262, y: 330 },
  '4-6': { x: 320, y: 425 },
};

const STATUS_COLOR = { Safe: '#1a7f4b', Moderate: '#b7791f', Unsafe: '#c0392b' };
const POLLUTANT_COLOR = {
  chemical: '#c0392b',
  sewage: '#7a5a00',
  runoff: '#8a6d3b',
  rust: '#b7791f',
};

function edgePath(edge) {
  const a = POS[edge.from];
  const b = POS[edge.to];
  const c = CONTROL[`${edge.from}-${edge.to}`];
  return `M ${a.x} ${a.y} Q ${c.x} ${c.y} ${b.x} ${b.y}`;
}

// Point on a quadratic Bezier curve at t (0..1) — used for the valve marker.
function quadPoint(edge, t) {
  const a = POS[edge.from];
  const c = CONTROL[`${edge.from}-${edge.to}`];
  const b = POS[edge.to];
  const u = 1 - t;
  return {
    x: u * u * a.x + 2 * u * t * c.x + t * t * b.x,
    y: u * u * a.y + 2 * u * t * c.y + t * t * b.y,
  };
}

function labelPos(zoneId) {
  // Name label sits above the node, except for the bottom-row zones.
  const p = POS[zoneId];
  return { x: p.x, y: zoneId === 6 ? p.y + 52 : p.y - 38 };
}

export default function FlowMap({
  zones, currentStep, selectedZone, onSelectZone, closedEdges,
  sourceZoneId, pollutantKey, showWater = true, showPollutant = true,
}) {
  const stepById = {};
  if (currentStep) {
    for (const z of currentStep.zones) stepById[z.zone_id] = z;
  }
  const pollutantColor = POLLUTANT_COLOR[pollutantKey] || '#c0392b';

  return (
    <div className="flow-map-wrap">
      <svg className="flow-map-svg" viewBox="0 0 680 460" role="img"
        aria-label="Animated map of the water supply network showing water flowing from zone to zone and pollution spreading downstream">
        <defs>
          <pattern id="map-grid" width="34" height="34" patternUnits="userSpaceOnUse">
            <path d="M 34 0 L 0 0 0 34" fill="none" stroke="#dde8e2" strokeWidth="1" />
          </pattern>
        </defs>

        {/* Land background + decorative map features */}
        <rect x="0" y="0" width="680" height="460" fill="#eef6e8" />
        <rect x="0" y="0" width="680" height="460" fill="url(#map-grid)" />
        <ellipse cx="95" cy="70" rx="78" ry="44" fill="#bfe6f2" opacity="0.85" />
        <text x="95" y="128" textAnchor="middle" className="map-area-label">Reservoir lake</text>
        <ellipse cx="590" cy="360" rx="72" ry="42" fill="#d8ecd0" />
        <ellipse cx="80" cy="250" rx="58" ry="34" fill="#d8ecd0" />
        <text x="80" y="252" textAnchor="middle" className="map-area-label">Park</text>
        <path d="M 0 300 L 680 290" stroke="#e2ddd2" strokeWidth="10" strokeDasharray="16 10" />
        <path d="M 240 0 L 250 460" stroke="#e2ddd2" strokeWidth="8" strokeDasharray="14 10" />
        <text x="545" y="88" textAnchor="middle" className="map-area-label">Industrial area</text>
        <text x="390" y="312" textAnchor="middle" className="map-area-label">City centre</text>
        <text x="150" y="404" textAnchor="middle" className="map-area-label">Residential</text>
        <text x="565" y="392" textAnchor="middle" className="map-area-label">Farmland</text>

        {/* Compass + scale bar */}
        <g transform="translate(640, 28)">
          <circle r="16" fill="#fff" stroke="#b9c9cf" />
          <path d="M 0 -11 L 5 5 L 0 2 L -5 5 Z" fill="#0b2a4a" />
          <text y="-21" textAnchor="middle" className="map-area-label" fontWeight="700">N</text>
        </g>
        <g transform="translate(18, 440)">
          <line x1="0" y1="0" x2="80" y2="0" stroke="#5b6b78" strokeWidth="3" />
          <line x1="0" y1="-5" x2="0" y2="5" stroke="#5b6b78" strokeWidth="3" />
          <line x1="80" y1="-5" x2="80" y2="5" stroke="#5b6b78" strokeWidth="3" />
          <text x="40" y="-8" textAnchor="middle" className="map-area-label">Schematic — not to scale</text>
        </g>

        {/* Pipes: base, flowing clean water, pollutant stream, moving blobs */}
        {EDGES.map((edge) => {
          const d = edgePath(edge);
          const fromStep = stepById[edge.from];
          const conc = fromStep ? fromStep.concentration : 0;
          const closed = closedEdges.has(`${edge.from}-${edge.to}`);
          const polluted = showPollutant && conc > 0.05;
          const mid = quadPoint(edge, 0.5);
          const blobDur = Math.max(1.6, edge.travel_hours * 1.4);
          return (
            <g key={`${edge.from}-${edge.to}`}>
              <path d={d} className="map-pipe" />
              {showWater && !closed && (
                <path d={d} className="map-water-flow" />
              )}
              {showWater && closed && (
                <path d={d} className="map-water-flow map-water-trickle" />
              )}
              {polluted && (
                <path
                  d={d}
                  className="map-pollutant-flow"
                  style={{
                    stroke: pollutantColor,
                    opacity: Math.min(0.95, 0.35 + conc * 0.18),
                    strokeWidth: 4 + Math.min(6, conc * 1.6),
                  }}
                />
              )}
              {/* Clean-water droplets travelling along the pipe */}
              {showWater && [0, 1].map((i) => (
                <circle key={`w${i}`} r="4.5" fill="#1fb6c9" opacity={closed ? 0.3 : 0.9}>
                  <animateMotion dur={`${blobDur}s`} begin={`${-i * blobDur * 0.5}s`} repeatCount="indefinite" path={d} />
                </circle>
              ))}
              {/* Pollutant blobs travelling along the pipe */}
              {polluted && [0, 1, 2].map((i) => (
                <circle key={`p${i}`} r={5 + Math.min(3, conc)} fill={pollutantColor} opacity="0.92">
                  <animateMotion dur={`${blobDur * 1.15}s`} begin={`${-i * blobDur * 0.38}s`} repeatCount="indefinite" path={d} />
                </circle>
              ))}
              {/* Valve marker at the middle of a closed pipe */}
              {closed && (
                <g transform={`translate(${mid.x}, ${mid.y})`}>
                  <circle r="13" fill="#fff" stroke="#c0392b" strokeWidth="2.5" />
                  <text textAnchor="middle" dominantBaseline="central" fontSize="15" fontWeight="700" fill="#c0392b">✕</text>
                  <text y="-20" textAnchor="middle" className="map-valve-label">VALVE CLOSED</text>
                </g>
              )}
              {/* Travel-time label at the middle of an open pipe */}
              {!closed && (
                <text x={mid.x} y={mid.y - 12} textAnchor="middle" className="map-travel-label">
                  {edge.travel_hours} h
                </text>
              )}
            </g>
          );
        })}

        {/* Zones */}
        {zones.map((zone) => {
          const p = POS[zone.id];
          const now = stepById[zone.id];
          const status = now?.status || 'Moderate';
          const color = STATUS_COLOR[status];
          const conc = now?.concentration || 0;
          const label = labelPos(zone.id);
          const isSource = zone.id === sourceZoneId;
          return (
            <g
              key={zone.id}
              className="map-node"
              onClick={() => onSelectZone(zone.id)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectZone(zone.id); } }}
              tabIndex={0}
              role="button"
              aria-label={`${zone.name}, WQI ${now?.wqi ?? zone.baseline_wqi}, ${status}`}
            >
              {conc > 0.05 && (
                <circle cx={p.x} cy={p.y} r="34" fill={pollutantColor} opacity="0.22">
                  <animate attributeName="r" values="32;46;32" dur="2s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.28;0.08;0.28" dur="2s" repeatCount="indefinite" />
                </circle>
              )}
              {status === 'Unsafe' && (
                <circle cx={p.x} cy={p.y} r="34" fill="none" stroke="#c0392b" strokeWidth="2.5">
                  <animate attributeName="r" values="30;44;30" dur="1.6s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.9;0.15;0.9" dur="1.6s" repeatCount="indefinite" />
                </circle>
              )}
              <circle cx={p.x} cy={p.y} r="27" fill={color} stroke="#fff" strokeWidth="3.5" />
              <text x={p.x} y={p.y + 1} textAnchor="middle" dominantBaseline="central" fontSize="21">{p.icon}</text>
              {isSource && (
                <g transform={`translate(${p.x + 30}, ${p.y - 30})`}>
                  <rect x="-26" y="-11" width="52" height="20" rx="10" fill="#c0392b" />
                  <text textAnchor="middle" dominantBaseline="central" fontSize="10.5" fontWeight="700" fill="#fff">LEAK</text>
                </g>
              )}
              <text x={label.x} y={label.y} textAnchor="middle" className="map-zone-label">{zone.name}</text>
              <text x={label.x} y={label.y + 15} textAnchor="middle" className="map-zone-sub">
                WQI {now?.wqi ?? zone.baseline_wqi} · {status}
              </text>
              {selectedZone === zone.id && (
                <circle cx={p.x} cy={p.y} r="33" fill="none" stroke="#0b2a4a" strokeWidth="2" strokeDasharray="5 4" />
              )}
            </g>
          );
        })}
      </svg>

      <div className="flow-legend">
        <span><i className="legend-dot" style={{ background: '#1fb6c9' }} /> Clean water flowing</span>
        <span><i className="legend-dot" style={{ background: pollutantColor }} /> Pollutant spreading</span>
        <span><i className="legend-dot" style={{ background: '#c0392b' }} /> Unsafe zone (pulsing ring)</span>
        <span><strong>✕</strong> Closed valve</span>
        <span>Click a zone on the map to inspect it</span>
      </div>
    </div>
  );
}
