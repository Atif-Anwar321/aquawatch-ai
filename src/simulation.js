// Contamination Spread Simulator — browser mirror of
// backend/simulation.py. Used when the Flask backend is not reachable,
// so the Simulator tab still runs on the saved dataset snapshot.
// Keep every constant and the queue algorithm in sync with that file.

export const FLOW_ORDER = [1, 2, 5, 3, 4, 6];
export const POPULATION = { 1: 120000, 2: 85000, 3: 210000, 4: 160000, 5: 60000, 6: 45000 };
export const EDGES = [
  { from: 1, to: 2, travel_hours: 1, transmission: 0.85 },
  { from: 2, to: 5, travel_hours: 1, transmission: 0.9 },
  { from: 5, to: 3, travel_hours: 2, transmission: 0.75 },
  { from: 3, to: 4, travel_hours: 4, transmission: 0.8 },
  { from: 4, to: 6, travel_hours: 3, transmission: 0.85 },
];
export const DECAY = 0.93;
export const DECAY_BOOST = 0.85;
export const TREATMENT_REMOVAL = 0.3;
export const TREATMENT_REMOVAL_BOOST = 0.55;
export const VALVE_RESIDUAL = 0.1;
export const ADVISORY_EXPOSURE = 0.6;

export const POLLUTANTS = {
  chemical: {
    key: 'chemical', label: 'Chemical leak (industrial)', potency: 20,
    deltas: { Turbidity: 1.2, Sulfate: 90, Chloramines: 1.0, Conductivity: 55 },
    description: 'Industrial discharge: high sulfate and conductivity, sharp WQI fall.',
  },
  sewage: {
    key: 'sewage', label: 'Sewage overflow', potency: 16,
    deltas: { Turbidity: 1.8, Organic_carbon: 6, Trihalomethanes: 20, Chloramines: 0.8 },
    description: 'Sewage inflow: high organic load and turbidity, microbial risk.',
  },
  runoff: {
    key: 'runoff', label: 'Monsoon runoff / soil', potency: 13,
    deltas: { Turbidity: 2.5, Solids: 6000, Hardness: 25 },
    description: 'Rain-driven soil and surface runoff: very cloudy water, high solids.',
  },
  rust: {
    key: 'rust', label: 'Old pipe / rust and scale', potency: 9,
    deltas: { Turbidity: 1.0, Hardness: 40, Conductivity: 60 },
    description: 'Corroded pipe material: hardness and conductivity rise, slower WQI fall.',
  },
};
export const SEVERITY = {
  mild: { key: 'mild', label: 'Mild', concentration: 1.0 },
  moderate: { key: 'moderate', label: 'Moderate', concentration: 2.0 },
  severe: { key: 'severe', label: 'Severe', concentration: 3.5 },
};
export const DEFAULT_BASELINE_WQI = { 1: 77, 2: 75.5, 3: 74.2, 4: 73.5, 5: 70.8, 6: 76 };

function wqiStatus(wqi) {
  return wqi >= 80 ? 'Safe' : wqi >= 50 ? 'Moderate' : 'Unsafe';
}

export function runSimulationLocal(baselines, params) {
  const duration = params.duration_hours;
  const horizon = params.horizon_hours;
  const pollutant = POLLUTANTS[params.pollutant];
  const source = params.source_zone_id;
  const inject = SEVERITY[params.severity].concentration;
  const actions = params.actions || [];

  const valveClosed = {};
  let boostFrom = null;
  let advisoryFrom = null;
  for (const a of actions) {
    if (a.type === 'valve_close') {
      const key = `${a.from_zone_id}-${a.to_zone_id}`;
      valveClosed[key] = valveClosed[key] === undefined ? a.hour : Math.min(valveClosed[key], a.hour);
    } else if (a.type === 'treatment_boost') {
      boostFrom = boostFrom === null ? a.hour : Math.min(boostFrom, a.hour);
    } else if (a.type === 'advisory') {
      advisoryFrom = advisoryFrom === null ? a.hour : Math.min(advisoryFrom, a.hour);
    }
  }

  const queues = EDGES.map((e) => Array(e.travel_hours).fill(0));
  let conc = Object.fromEntries(FLOW_ORDER.map((z) => [z, 0]));
  const timeline = [];
  const events = [];
  const prevStatus = {};

  for (let hour = 0; hour <= horizon; hour += 1) {
    const boostActive = boostFrom !== null && hour >= boostFrom;
    const advisoryActive = advisoryFrom !== null && hour >= advisoryFrom;
    const decay = boostActive ? DECAY_BOOST : DECAY;

    const arrivals = Object.fromEntries(FLOW_ORDER.map((z) => [z, 0]));
    EDGES.forEach((edge, i) => {
      let arriving = queues[i].shift();
      const key = `${edge.from}-${edge.to}`;
      if (valveClosed[key] !== undefined && hour >= valveClosed[key]) arriving *= VALVE_RESIDUAL;
      if (edge.to === 2) {
        const removal = boostActive ? TREATMENT_REMOVAL_BOOST : TREATMENT_REMOVAL;
        arriving *= 1 - removal;
      }
      arrivals[edge.to] += arriving * edge.transmission;
    });

    const newConc = {};
    for (const zone of FLOW_ORDER) {
      let value = Math.max(conc[zone] * decay, arrivals[zone]);
      if (zone === source && hour < duration) value = Math.max(value, inject);
      newConc[zone] = value;
    }
    conc = newConc;
    EDGES.forEach((edge, i) => queues[i].push(conc[edge.from]));

    const zonesOut = [];
    let unsafePop = 0;
    for (const zone of FLOW_ORDER) {
      const baseline = baselines[zone] ?? DEFAULT_BASELINE_WQI[zone];
      const wqi = Math.round(Math.max(5, baseline - conc[zone] * pollutant.potency) * 10) / 10;
      const status = wqiStatus(wqi);
      if (status === 'Unsafe') unsafePop += POPULATION[zone];
      const deltas = {};
      for (const [k, v] of Object.entries(pollutant.deltas)) deltas[k] = Math.round(v * conc[zone] * 100) / 100;
      zonesOut.push({ zone_id: zone, concentration: Math.round(conc[zone] * 1000) / 1000, wqi, status, population: POPULATION[zone], parameter_deltas: deltas });
      if (prevStatus[zone] !== undefined && status !== prevStatus[zone]) {
        if (status === 'Unsafe') events.push({ hour, zone_id: zone, kind: 'became_unsafe', message: `Zone ${zone} became Unsafe (WQI ${wqi}).` });
        else if (prevStatus[zone] === 'Unsafe') events.push({ hour, zone_id: zone, kind: 'recovered', message: `Zone ${zone} recovered to ${status} (WQI ${wqi}).` });
      }
      prevStatus[zone] = status;
    }
    const exposure = advisoryActive ? ADVISORY_EXPOSURE : 1;
    timeline.push({ hour, zones: zonesOut, unsafe_population: unsafePop, population_at_risk: Math.round(unsafePop * exposure), advisory_active: advisoryActive });
  }

  let affected = new Set();
  let unsafeHours = 0;
  let worstWqi = 100;
  let worstHour = 0;
  let peakUnsafe = 0;
  let peakRisk = 0;
  let firstUnsafe = null;
  for (const step of timeline) {
    peakUnsafe = Math.max(peakUnsafe, step.unsafe_population);
    peakRisk = Math.max(peakRisk, step.population_at_risk);
    for (const z of step.zones) {
      if (z.wqi < worstWqi) { worstWqi = z.wqi; worstHour = step.hour; }
      if (z.status === 'Unsafe') {
        affected.add(z.zone_id);
        unsafeHours += 1;
        if (firstUnsafe === null) firstUnsafe = step.hour;
      }
    }
  }
  let recoveryHour = null;
  if (firstUnsafe !== null) {
    for (const step of timeline) {
      if (step.hour > firstUnsafe && step.zones.every((z) => z.status !== 'Unsafe')) { recoveryHour = step.hour; break; }
    }
  }
  return {
    timeline,
    events,
    summary: {
      zones_affected: affected.size,
      affected_zone_ids: [...affected].sort((a, b) => a - b),
      unsafe_zone_hours: unsafeHours,
      peak_unsafe_population: peakUnsafe,
      peak_population_at_risk: peakRisk,
      worst_wqi: worstWqi,
      worst_hour: worstHour,
      recovery_hour: recoveryHour,
      horizon_hours: horizon,
    },
  };
}

export function runComparisonLocal(baselines, params) {
  const withActions = runSimulationLocal(baselines, params);
  const withoutActions = runSimulationLocal(baselines, { ...params, actions: [] });
  const a = withActions.summary;
  const b = withoutActions.summary;
  return {
    with_actions: withActions,
    without_actions: withoutActions,
    comparison: {
      population_saved: Math.max(0, b.peak_unsafe_population - a.peak_unsafe_population),
      zones_saved: Math.max(0, b.zones_affected - a.zones_affected),
      unsafe_hours_saved: Math.max(0, b.unsafe_zone_hours - a.unsafe_zone_hours),
    },
  };
}
