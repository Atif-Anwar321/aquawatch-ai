#!/usr/bin/env python3
"""
Contamination Spread Simulator / Digital Twin engine.

This is a simplified, transparent planning model, not a hydraulic
simulation (it is not EPANET and it does not model pressure, pipe
diameter or pump curves). Water flows in one fixed direction through
six zones. A pollutant injected in one zone travels downstream with
a configured travel time per pipe, is diluted at each step, decays
over time, and is partly removed when it passes the treatment plant.
Each zone's Water Quality Index (WQI) starts from its measured
baseline and falls in proportion to the pollutant concentration
present in that zone in that hour.

All constants below are in one place so a reviewer can change the
network, travel times or dilution factors and re-run the same
scenario. The browser copy in frontend/src/simulation.js mirrors
this file exactly; keep the two in sync if a constant changes.

Flow order (water flows left to right, pollution never flows back):
    North Reservoir -> East Treatment Plant -> West Industrial Fringe
    -> Central Distribution -> South Residential -> Rural Feed Line
"""
import math

# Zone populations (people served), as shown on the Network Zones tab.
POPULATION = {1: 120000, 2: 85000, 3: 210000, 4: 160000, 5: 60000, 6: 45000}

# (from_zone, to_zone, travel_time_hours, transmission)
# transmission = fraction of the upstream concentration that is
# still present when the water arrives downstream (the rest is lost
# to dilution / mixing on that pipe).
EDGES = [
    (1, 2, 1, 0.85),
    (2, 5, 1, 0.90),
    (5, 3, 2, 0.75),
    (3, 4, 4, 0.80),
    (4, 6, 3, 0.85),
]
FLOW_ORDER = [1, 2, 5, 3, 4, 6]

# Per-hour decay of concentration left in a zone (settling, natural
# breakdown and flushing). A treatment boost uses DECAY_BOOST.
DECAY = 0.93
DECAY_BOOST = 0.85
# Fraction of an arriving pollutant removed by the treatment plant
# (zone 2). A treatment boost removes more.
TREATMENT_REMOVAL = 0.30
TREATMENT_REMOVAL_BOOST = 0.55
# A closed valve still lets a small fraction through (leakage / bypass).
VALVE_RESIDUAL = 0.10
# A public advisory does not change WQI, but it reduces the share of
# the population exposed to unsafe water (boiling, bottled water).
ADVISORY_EXPOSURE = 0.60

# Default baseline WQI per zone, used only when no measured baseline
# is available (for example when the dataset has not loaded).
DEFAULT_BASELINE_WQI = {1: 77.0, 2: 75.5, 3: 74.2, 4: 73.5, 5: 70.8, 6: 76.0}

# Pollutant profiles. "potency" = WQI points lost per unit of
# concentration. The deltas are the estimated rise in each parameter
# per unit of concentration, shown on the zone detail panel.
POLLUTANTS = {
    "chemical": {
        "key": "chemical", "label": "Chemical leak (industrial)",
        "potency": 20.0,
        "deltas": {"Turbidity": 1.2, "Sulfate": 90.0, "Chloramines": 1.0,
                   "Conductivity": 55.0},
        "description": "Industrial discharge: high sulfate and conductivity, sharp WQI fall.",
    },
    "sewage": {
        "key": "sewage", "label": "Sewage overflow",
        "potency": 16.0,
        "deltas": {"Turbidity": 1.8, "Organic_carbon": 6.0,
                   "Trihalomethanes": 20.0, "Chloramines": 0.8},
        "description": "Sewage inflow: high organic load and turbidity, microbial risk.",
    },
    "runoff": {
        "key": "runoff", "label": "Monsoon runoff / soil",
        "potency": 13.0,
        "deltas": {"Turbidity": 2.5, "Solids": 6000.0, "Hardness": 25.0},
        "description": "Rain-driven soil and surface runoff: very cloudy water, high solids.",
    },
    "rust": {
        "key": "rust", "label": "Old pipe / rust and scale",
        "potency": 9.0,
        "deltas": {"Turbidity": 1.0, "Hardness": 40.0, "Conductivity": 60.0},
        "description": "Corroded pipe material: hardness and conductivity rise, slower WQI fall.",
    },
}

SEVERITY = {
    "mild": {"key": "mild", "label": "Mild", "concentration": 1.0},
    "moderate": {"key": "moderate", "label": "Moderate", "concentration": 2.0},
    "severe": {"key": "severe", "label": "Severe", "concentration": 3.5},
}


def network_definition():
    """Network, pollutants and assumptions, for the API and the UI."""
    return {
        "flow_order": FLOW_ORDER,
        "zones": [{"id": z, "population": POPULATION[z]} for z in FLOW_ORDER],
        "edges": [{"from": a, "to": b, "travel_hours": t, "transmission": tr}
                  for a, b, t, tr in EDGES],
        "pollutants": [POLLUTANTS[k] for k in POLLUTANTS],
        "severity_levels": [SEVERITY[k] for k in SEVERITY],
        "assumptions": {
            "decay_per_hour": DECAY,
            "decay_per_hour_treatment_boost": DECAY_BOOST,
            "treatment_removal": TREATMENT_REMOVAL,
            "treatment_removal_boost": TREATMENT_REMOVAL_BOOST,
            "valve_residual_fraction": VALVE_RESIDUAL,
            "advisory_exposure_fraction": ADVISORY_EXPOSURE,
            "note": ("Simplified planning model: fixed flow direction, fixed "
                     "travel times, dilution and decay only. It does not model "
                     "pressure, pipe diameter or pumps. Calibrate travel times "
                     "and dilution against measured flow data before operational use."),
        },
    }


def _wqi_status(wqi):
    if wqi >= 80:
        return "Safe"
    if wqi >= 50:
        return "Moderate"
    return "Unsafe"


def _validate(params):
    if params.get("source_zone_id") not in FLOW_ORDER:
        raise ValueError("source_zone_id must be one of the six zone ids")
    if params.get("pollutant") not in POLLUTANTS:
        raise ValueError("Unknown pollutant")
    if params.get("severity") not in SEVERITY:
        raise ValueError("severity must be mild, moderate or severe")
    duration = int(params.get("duration_hours", 3))
    if not 1 <= duration <= 12:
        raise ValueError("duration_hours must be between 1 and 12")
    horizon = int(params.get("horizon_hours", 24))
    if not 12 <= horizon <= 48:
        raise ValueError("horizon_hours must be between 12 and 48")
    actions = params.get("actions") or []
    edge_set = {(a, b) for a, b, _, _ in EDGES}
    for a in actions:
        if a.get("type") not in ("valve_close", "treatment_boost", "advisory"):
            raise ValueError("Unknown action type")
        hour = int(a.get("hour", 0))
        if not 0 <= hour <= horizon:
            raise ValueError("Action hour is outside the simulation horizon")
        if a.get("type") == "valve_close":
            edge = (int(a.get("from_zone_id", 0)), int(a.get("to_zone_id", 0)))
            if edge not in edge_set:
                raise ValueError("valve_close must name a pipe that exists in the network")
    return duration, horizon, actions


def run_simulation(baselines, params):
    """Run one scenario and return timeline, events and summary.

    baselines: {zone_id: baseline WQI}. params: source_zone_id,
    pollutant, severity, duration_hours, horizon_hours, actions.
    Actions: [{"type": "valve_close", "from_zone_id", "to_zone_id",
    "hour"}, {"type": "treatment_boost", "hour"},
    {"type": "advisory", "hour"}].
    """
    duration, horizon, actions = _validate(params)
    pollutant = POLLUTANTS[params["pollutant"]]
    source = int(params["source_zone_id"])
    inject = SEVERITY[params["severity"]]["concentration"]

    valve_closed = {}   # (from, to) -> first closed hour
    boost_from = None
    advisory_from = None
    for a in actions:
        hour = int(a["hour"])
        if a["type"] == "valve_close":
            key = (int(a["from_zone_id"]), int(a["to_zone_id"]))
            valve_closed[key] = hour if key not in valve_closed else min(valve_closed[key], hour)
        elif a["type"] == "treatment_boost":
            boost_from = hour if boost_from is None else min(boost_from, hour)
        elif a["type"] == "advisory":
            advisory_from = hour if advisory_from is None else min(advisory_from, hour)

    # Delay queues: one per pipe. queue[0] arrives this hour; after
    # each hour the upstream zone's outgoing concentration is appended.
    queues = {i: [0.0] * travel for i, (_, _, travel, _) in enumerate(EDGES)}
    conc = {z: 0.0 for z in FLOW_ORDER}
    timeline = []
    events = []
    prev_status = {z: None for z in FLOW_ORDER}

    for hour in range(horizon + 1):
        boost_active = boost_from is not None and hour >= boost_from
        advisory_active = advisory_from is not None and hour >= advisory_from
        decay = DECAY_BOOST if boost_active else DECAY

        # Concentrations arriving through each pipe this hour.
        arrivals = {z: 0.0 for z in FLOW_ORDER}
        for i, (frm, to, _travel, transmission) in enumerate(EDGES):
            arriving = queues[i].pop(0)
            if (frm, to) in valve_closed and hour >= valve_closed[(frm, to)]:
                arriving *= VALVE_RESIDUAL
            if to == 2:  # treatment plant removes part of what arrives
                removal = TREATMENT_REMOVAL_BOOST if boost_active else TREATMENT_REMOVAL
                arriving *= (1.0 - removal)
            arrivals[to] += arriving * transmission

        # Update every zone. A zone is a well-mixed tank: its
        # concentration is the higher of what is left from last hour
        # (decayed) and what has just arrived. It never sums the two,
        # so concentrations stay bounded by the injected level.
        new_conc = {}
        for zone in FLOW_ORDER:
            value = max(conc[zone] * decay, arrivals[zone])
            if zone == source and hour < duration:
                value = max(value, inject)
            new_conc[zone] = value
        conc = new_conc

        # Push outgoing concentrations into the pipe queues.
        for i, (frm, _to, _travel, _tr) in enumerate(EDGES):
            queues[i].append(conc[frm])

        zones_out = []
        unsafe_pop = 0
        for zone in FLOW_ORDER:
            baseline = float(baselines.get(zone, DEFAULT_BASELINE_WQI[zone]))
            wqi = round(max(5.0, baseline - conc[zone] * pollutant["potency"]), 1)
            status = _wqi_status(wqi)
            if status == "Unsafe":
                unsafe_pop += POPULATION[zone]
            deltas = {k: round(v * conc[zone], 2) for k, v in pollutant["deltas"].items()}
            zones_out.append({
                "zone_id": zone,
                "concentration": round(conc[zone], 3),
                "wqi": wqi,
                "status": status,
                "population": POPULATION[zone],
                "parameter_deltas": deltas,
            })
            if prev_status[zone] is not None and status != prev_status[zone]:
                if status == "Unsafe":
                    events.append({"hour": hour, "zone_id": zone, "kind": "became_unsafe",
                                   "message": f"Zone {zone} became Unsafe (WQI {wqi})."})
                elif prev_status[zone] == "Unsafe":
                    events.append({"hour": hour, "zone_id": zone, "kind": "recovered",
                                   "message": f"Zone {zone} recovered to {status} (WQI {wqi})."})
            prev_status[zone] = status

        exposure = ADVISORY_EXPOSURE if advisory_active else 1.0
        timeline.append({
            "hour": hour,
            "zones": zones_out,
            "unsafe_population": unsafe_pop,
            "population_at_risk": int(round(unsafe_pop * exposure)),
            "advisory_active": advisory_active,
        })

    # Summary.
    affected_zones = set()
    unsafe_zone_hours = 0
    worst_wqi = 100.0
    worst_hour = 0
    peak_unsafe = 0
    peak_risk = 0
    first_unsafe_hour = None
    for step in timeline:
        peak_unsafe = max(peak_unsafe, step["unsafe_population"])
        peak_risk = max(peak_risk, step["population_at_risk"])
        for z in step["zones"]:
            if z["wqi"] < worst_wqi:
                worst_wqi = z["wqi"]
                worst_hour = step["hour"]
            if z["status"] == "Unsafe":
                affected_zones.add(z["zone_id"])
                unsafe_zone_hours += 1
                if first_unsafe_hour is None:
                    first_unsafe_hour = step["hour"]
    recovery_hour = None
    if first_unsafe_hour is not None:
        for step in timeline:
            if step["hour"] > first_unsafe_hour and all(
                    z["status"] != "Unsafe" for z in step["zones"]):
                recovery_hour = step["hour"]
                break
    summary = {
        "zones_affected": len(affected_zones),
        "affected_zone_ids": sorted(affected_zones),
        "unsafe_zone_hours": unsafe_zone_hours,
        "peak_unsafe_population": peak_unsafe,
        "peak_population_at_risk": peak_risk,
        "worst_wqi": worst_wqi,
        "worst_hour": worst_hour,
        "recovery_hour": recovery_hour,
        "horizon_hours": horizon,
    }
    return {"timeline": timeline, "events": events, "summary": summary}


def run_comparison(baselines, params):
    """Run the scenario with the requested actions and again with no
    actions, so the two can be compared side by side."""
    with_actions = run_simulation(baselines, params)
    no_action_params = dict(params)
    no_action_params["actions"] = []
    without_actions = run_simulation(baselines, no_action_params)
    a = with_actions["summary"]
    b = without_actions["summary"]
    comparison = {
        "population_saved": max(0, b["peak_unsafe_population"] - a["peak_unsafe_population"]),
        "zones_saved": max(0, b["zones_affected"] - a["zones_affected"]),
        "unsafe_hours_saved": max(0, b["unsafe_zone_hours"] - a["unsafe_zone_hours"]),
    }
    return {"with_actions": with_actions, "without_actions": without_actions,
            "comparison": comparison}
