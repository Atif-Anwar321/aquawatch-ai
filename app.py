#!/usr/bin/env python3
"""
AI-Driven Water Quality & Pollution Monitoring — BACKEND (Flask API)
=======================================================================

Software-only version: NO Arduino / ESP32 / sensors / hardware.
All readings come from a public dataset (see data/DATA_SOURCE.md):
the Kaggle "Water Potability" dataset (3,276 samples). The backend
replays dataset rows across six supply zones, computes a Water
Quality Index (WQI) from WHO guideline limits, and classifies each
reading with a Random Forest model trained on the same dataset
(synopsis §5.3: Python + Pandas + Scikit-learn, Random Forest).

Run it (from this backend/ folder, in VS Code's terminal):

    python -m venv .venv
    .venv\\Scripts\\activate        # Windows
    source .venv/bin/activate       # macOS / Linux
    pip install -r requirements.txt
    python app.py                   # -> http://localhost:5000

Then, in a second terminal, run the frontend (see ../frontend/README.md).
The API also works on its own: try http://localhost:5000/api/health
in a browser.

If scikit-learn is not installed, the API still runs in "WQI-only"
mode: predictions use the rule-based WQI and no ML probability is
returned. Install requirements.txt for the full ML model.
"""
import json
import math
import os
from datetime import datetime, timedelta, timezone

from flask import Flask, jsonify, request
from flask_cors import CORS

from wqi import (FEATURE_META, FEATURES, breached_parameters, compute_wqi,
                 final_status, sub_index, wqi_category)
from simulation import DEFAULT_BASELINE_WQI, network_definition, run_comparison

try:
    import joblib
    import pandas as pd
    from train_model import FEATURES as MODEL_FEATURES, load_dataset, train
    ML_AVAILABLE = True
except Exception as _exc:  # pandas / sklearn missing -> WQI-only mode
    ML_AVAILABLE = False
    print(f"[warn] ML libraries unavailable ({_exc}); running in WQI-only mode.")

BASE = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = os.path.join(BASE, "data", "water_potability.csv")
MODEL_PATH = os.path.join(BASE, "models", "model.joblib")
METRICS_PATH = os.path.join(BASE, "models", "metrics.json")

app = Flask(__name__)
CORS(app)

# ---------------------------------------------------------------- state
DATASET = None          # pandas DataFrame, median-imputed
MEDIANS = {}
MODEL = None            # sklearn RandomForest, or None
METRICS = None          # dict from train_model, or None
READINGS = []           # cached list of dicts: one per dataset row
ZONES = [
    {"id": 1, "name": "North Reservoir", "type": "Reservoir / intake", "population": "1.2 lakh"},
    {"id": 2, "name": "East Treatment Plant", "type": "Treatment plant outlet", "population": "85,000"},
    {"id": 3, "name": "Central Distribution", "type": "City centre network", "population": "2.1 lakh"},
    {"id": 4, "name": "South Residential", "type": "Residential zone", "population": "1.6 lakh"},
    {"id": 5, "name": "West Industrial Fringe", "type": "Mixed industrial / residential", "population": "60,000"},
    {"id": 6, "name": "Rural Feed Line", "type": "Rural supply line", "population": "45,000"},
]
# Replay clock: dataset rows are replayed as if collected hourly.
# Timestamps are a replay clock, NOT sensor timestamps.
REPLAY_END = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)


def _row_timestamp(row_index, total):
    return (REPLAY_END - timedelta(hours=(total - 1 - row_index))).isoformat()


def _reading_dict(idx, row, zone_id, prob=None):
    values = {k: (None if (row[k] is None or (isinstance(row[k], float) and math.isnan(row[k]))) else round(float(row[k]), 3))
              for k in MODEL_FEATURES} if ML_AVAILABLE else {}
    if not ML_AVAILABLE:  # plain-dict fallback (csv rows read without pandas)
        values = {k: row.get(k) for k in FEATURE_META}
    wqi, parts = compute_wqi(values)
    if prob is None and MODEL is not None and ML_AVAILABLE:
        import pandas as pd
        filled = {k: (MEDIANS[k] if values.get(k) is None else values[k]) for k in MODEL_FEATURES}
        prob = round(float(MODEL.predict_proba(pd.DataFrame([filled]))[0][1]), 3)
    return {
        "id": idx + 1,
        "zone_id": zone_id,
        "zone": ZONES[zone_id - 1]["name"],
        "timestamp": _row_timestamp(idx, len(READINGS) or 3276),
        "values": values,
        "wqi": wqi,
        "wqi_category": wqi_category(wqi),
        "status": final_status(wqi, prob),
        "ml_probability": prob,
        "potable_label": (int(row["Potability"]) if "Potability" in row and row["Potability"] is not None else None),
        "breaches": breached_parameters(values),
    }


def load_state():
    """Load the dataset, train/load the model, and cache all readings."""
    global DATASET, MEDIANS, MODEL, METRICS, READINGS
    if not ML_AVAILABLE:
        return
    df, medians = load_dataset(DATA_PATH)
    DATASET, MEDIANS = df, medians
    # Reuse a saved model if present, otherwise train now (first run).
    if os.path.exists(MODEL_PATH) and os.path.exists(METRICS_PATH):
        bundle = joblib.load(MODEL_PATH)
        MODEL = bundle["model"]
        with open(METRICS_PATH) as f:
            METRICS = json.load(f)
    else:
        MODEL, METRICS = train(df)
        os.makedirs(os.path.join(BASE, "models"), exist_ok=True)
        joblib.dump({"model": MODEL, "medians": medians, "features": MODEL_FEATURES}, MODEL_PATH)
        with open(METRICS_PATH, "w") as f:
            json.dump(METRICS, f, indent=2)
    # Cache readings: rows are dealt to zones in contiguous blocks.
    # Probabilities are computed in ONE batched call (fast) instead of
    # one predict_proba() per row.
    total = len(df)
    block = math.ceil(total / len(ZONES))
    if MODEL is not None:
        filled = df[MODEL_FEATURES].fillna(MEDIANS)
        probs = MODEL.predict_proba(filled)[:, 1]
    else:
        probs = [None] * total
    READINGS = []
    for idx, (_, row) in enumerate(df.iterrows()):
        zone_id = min(idx // block + 1, len(ZONES))
        prob = None if probs[idx] is None else round(float(probs[idx]), 3)
        READINGS.append(_reading_dict(idx, row.to_dict(), zone_id, prob=prob))
    # Replay clock: each zone's readings end at the current hour, so
    # every zone's "latest" reading is "now" in replay time.
    for zone_id in range(1, len(ZONES) + 1):
        zone_rows = [r for r in READINGS if r["zone_id"] == zone_id]
        for pos, r in enumerate(zone_rows):
            r["timestamp"] = (REPLAY_END - timedelta(hours=(len(zone_rows) - 1 - pos))).isoformat()
    print(f"[backend] {total} rows loaded, {len(ZONES)} zones, "
          f"model accuracy={METRICS['accuracy'] if METRICS else 'n/a'}")


load_state()


def _zone_summary(zone_id):
    rows = [r for r in READINGS if r["zone_id"] == zone_id]
    latest = rows[-1] if rows else None
    avg_wqi = round(sum(r["wqi"] for r in rows) / len(rows), 1) if rows else 0
    return {
        **ZONES[zone_id - 1],
        "samples": len(rows),
        "avg_wqi": avg_wqi,
        "safe_pct": round(100 * sum(1 for r in rows if r["status"] == "Safe") / len(rows), 1) if rows else 0,
        "unsafe_count": sum(1 for r in rows if r["status"] == "Unsafe"),
        "latest": latest,
    }


def _alerts():
    alerts = []
    for z in ZONES:
        s = _zone_summary(z["id"])
        latest = s["latest"]
        if latest is None:
            continue
        if latest["status"] == "Unsafe":
            alerts.append({
                "id": f"zone-{z['id']}-unsafe", "severity": "high", "zone_id": z["id"],
                "zone": z["name"], "title": f"Unsafe water in {z['name']}",
                "message": f"Latest replayed reading has WQI {latest['wqi']} (Unsafe). "
                           + "; ".join(b["message"] for b in latest["breaches"][:2]),
                "timestamp": latest["timestamp"], "wqi": latest["wqi"],
            })
        elif latest["breaches"]:
            alerts.append({
                "id": f"zone-{z['id']}-breach", "severity": "medium", "zone_id": z["id"],
                "zone": z["name"], "title": f"Guideline breach in {z['name']}",
                "message": "; ".join(b["message"] for b in latest["breaches"][:2]),
                "timestamp": latest["timestamp"], "wqi": latest["wqi"],
            })
    alerts.sort(key=lambda a: (a["severity"] != "high", a["timestamp"]), reverse=False)
    return alerts


# ---------------------------------------------------------------- routes
@app.get("/api/health")
def health():
    return jsonify({
        "status": "ok",
        "mode": "software-only, dataset-driven (no hardware)",
        "model_loaded": MODEL is not None,
        "ml_available": ML_AVAILABLE,
        "dataset_rows": len(READINGS),
        "dataset_source": "Kaggle Water Potability dataset (3,276 samples) — see backend/data/DATA_SOURCE.md",
        "zones": len(ZONES),
    })


@app.get("/api/summary")
def summary():
    if not READINGS:
        return jsonify({"error": "Dataset not loaded. Install requirements.txt and restart."}), 503
    statuses = {s: sum(1 for r in READINGS if r["status"] == s) for s in ("Safe", "Moderate", "Unsafe")}
    potable = sum(1 for r in READINGS if r["potable_label"] == 1)
    means = {}
    for k in FEATURE_META:
        vals = [r["values"][k] for r in READINGS if r["values"].get(k) is not None]
        means[k] = round(sum(vals) / len(vals), 2) if vals else None
    return jsonify({
        "total_samples": len(READINGS),
        "potable_samples": potable,
        "potable_pct": round(100 * potable / len(READINGS), 1),
        "status_counts": statuses,
        "avg_wqi": round(sum(r["wqi"] for r in READINGS) / len(READINGS), 1),
        "feature_means": means,
        "features": [FEATURE_META[k] for k in FEATURE_META],
        "zones": [_zone_summary(z["id"]) for z in ZONES],
        "alerts": _alerts(),
        "model": METRICS,
    })


@app.get("/api/zones")
def zones():
    return jsonify([_zone_summary(z["id"]) for z in ZONES])


@app.get("/api/zones/<int:zone_id>")
def zone_detail(zone_id):
    if not (1 <= zone_id <= len(ZONES)):
        return jsonify({"error": "Unknown zone"}), 404
    return jsonify(_zone_summary(zone_id))


@app.get("/api/zones/<int:zone_id>/history")
def zone_history(zone_id):
    if not (1 <= zone_id <= len(ZONES)):
        return jsonify({"error": "Unknown zone"}), 404
    try:
        points = max(6, min(200, int(request.args.get("points", 48))))
    except ValueError:
        points = 48
    rows = [r for r in READINGS if r["zone_id"] == zone_id][-points:]
    return jsonify([{
        "timestamp": r["timestamp"], "wqi": r["wqi"], "status": r["status"],
        "ml_probability": r["ml_probability"], **{k: r["values"].get(k) for k in FEATURE_META},
    } for r in rows])


@app.get("/api/readings")
def readings():
    try:
        limit = max(1, min(100, int(request.args.get("limit", 25))))
        offset = max(0, int(request.args.get("offset", 0)))
    except ValueError:
        return jsonify({"error": "limit/offset must be integers"}), 400
    status = request.args.get("status", "All")
    zone = request.args.get("zone", "All")
    rows = READINGS
    if status in ("Safe", "Moderate", "Unsafe"):
        rows = [r for r in rows if r["status"] == status]
    if zone != "All":
        try:
            zid = int(zone)
            rows = [r for r in rows if r["zone_id"] == zid]
        except ValueError:
            return jsonify({"error": "zone must be a zone id or All"}), 400
    return jsonify({
        "total": len(rows), "limit": limit, "offset": offset,
        "rows": rows[offset:offset + limit],
    })


@app.get("/api/alerts")
def alerts():
    return jsonify(_alerts())


@app.get("/api/model")
def model_info():
    if METRICS is None:
        return jsonify({"error": "Model not trained yet. Install requirements.txt and restart, or POST /api/retrain."}), 503
    return jsonify(METRICS)


@app.post("/api/retrain")
def retrain():
    """Re-train the Random Forest on the dataset and reload it.
    No authentication is configured; use only on a trusted local network."""
    if not ML_AVAILABLE:
        return jsonify({"error": "scikit-learn / pandas not installed."}), 503
    global MODEL, METRICS
    MODEL, METRICS = train(DATASET)
    joblib.dump({"model": MODEL, "medians": MEDIANS, "features": MODEL_FEATURES}, MODEL_PATH)
    with open(METRICS_PATH, "w") as f:
        json.dump(METRICS, f, indent=2)
    # Refresh cached ML probabilities / statuses (batched, as in load_state).
    filled = DATASET[MODEL_FEATURES].fillna(MEDIANS)
    probs = MODEL.predict_proba(filled)[:, 1]
    for idx, r in enumerate(READINGS):
        prob = round(float(probs[idx]), 3)
        r["ml_probability"] = prob
        r["status"] = final_status(r["wqi"], prob)
    return jsonify({"retrained": True, "metrics": METRICS})


@app.post("/api/predict")
def predict():
    data = request.get_json(silent=True) or {}
    missing = [k for k in FEATURE_META if data.get(k) in (None, "")]
    if missing:
        return jsonify({"error": f"Missing value(s): {', '.join(missing)}"}), 400
    try:
        values = {k: float(data[k]) for k in FEATURE_META}
    except (TypeError, ValueError):
        return jsonify({"error": "All nine parameters must be numbers."}), 400
    if not (0 <= values["ph"] <= 14):
        return jsonify({"error": "pH must be between 0 and 14."}), 400
    wqi, parts = compute_wqi(values)
    prob = None
    if MODEL is not None:
        import pandas as pd
        filled = {k: values[k] for k in MODEL_FEATURES}
        prob = round(float(MODEL.predict_proba(pd.DataFrame([filled]))[0][1]), 3)
    status = final_status(wqi, prob)
    breaches = breached_parameters(values)
    # Top drivers: important features whose sub-index is poorest.
    drivers = []
    if METRICS:
        imp = METRICS.get("feature_importance", {})
        for k, s in parts.items():
            drivers.append({"key": k, "label": FEATURE_META[k]["label"],
                            "sub_index": s, "importance": imp.get(k, 0),
                            "score": round(imp.get(k, 0) * (100 - s), 2)})
        drivers.sort(key=lambda d: d["score"], reverse=True)
    advice = []
    if status == "Safe":
        advice.append("No immediate action: all guideline checks pass for this sample.")
    if any(b["key"] == "ph" for b in breaches):
        advice.append("Adjust pH towards 6.5–8.5 (treatment / blending) and re-test before supply.")
    if any(b["key"] == "Turbidity" for b in breaches):
        advice.append("Increase filtration / settling: high turbidity can shield microbes from disinfection.")
    if any(b["key"] in ("Chloramines", "Trihalomethanes") for b in breaches):
        advice.append("Review disinfection dosing: excess disinfectant raises chloramines and trihalomethanes.")
    if any(b["key"] in ("Sulfate", "Conductivity", "Hardness") for b in breaches):
        advice.append("Check for mineral / industrial inflow upstream; consider dilution or treatment.")
    if status == "Moderate":
        advice.append("Monitor closely and re-test soon: moderate water should be watched for deterioration, especially the parameters with the lowest sub-indices.")
    if status == "Unsafe":
        advice.append("Do NOT supply this water for drinking until it is re-tested and cleared.")
    return jsonify({
        "values": values,
        "wqi": wqi,
        "wqi_category": wqi_category(wqi),
        "status": status,
        "ml_probability": prob,
        "ml_prediction": ("Potable" if prob is not None and prob >= 0.5 else
                          "Non-potable" if prob is not None else None),
        "model": "RandomForestClassifier" if MODEL is not None else "WQI-only (no ML model loaded)",
        "breaches": breaches,
        "sub_indices": parts,
        "top_drivers": drivers[:3],
        "advice": advice,
    })


def _simulation_baselines():
    """Baseline WQI per zone from the measured dataset rows, falling
    back to the defaults in simulation.py when no rows are loaded."""
    baselines = {}
    for z in ZONES:
        rows = [r for r in READINGS if r["zone_id"] == z["id"]]
        if rows:
            baselines[z["id"]] = round(sum(r["wqi"] for r in rows) / len(rows), 1)
        else:
            baselines[z["id"]] = DEFAULT_BASELINE_WQI[z["id"]]
    return baselines


@app.get("/api/network")
def network():
    net = network_definition()
    zone_names = {z["id"]: z["name"] for z in ZONES}
    net["zones"] = [{
        **item,
        "name": zone_names[item["id"]],
        "type": next(z["type"] for z in ZONES if z["id"] == item["id"]),
        "baseline_wqi": _simulation_baselines()[item["id"]],
    } for item in net["zones"]]
    net["edges"] = [{
        **e,
        "from_name": zone_names[e["from"]],
        "to_name": zone_names[e["to"]],
    } for e in net["edges"]]
    return jsonify(net)


@app.post("/api/simulate")
def simulate():
    """Run a contamination-spread scenario, with and without actions.

    Body: {source_zone_id, pollutant, severity, duration_hours,
    horizon_hours, actions: [{type, hour, from_zone_id, to_zone_id}]}.
    Returns both runs so the UI can compare "with actions" against
    "no action" for the same scenario.
    """
    data = request.get_json(silent=True) or {}
    try:
        result = run_comparison(_simulation_baselines(), data)
    except (ValueError, TypeError, KeyError) as exc:
        return jsonify({"error": str(exc)}), 400
    zone_names = {z["id"]: z["name"] for z in ZONES}
    result["scenario"] = data
    result["zone_names"] = zone_names
    result["baselines"] = _simulation_baselines()
    return jsonify(result)


@app.get("/api/dataset/info")
def dataset_info():
    return jsonify({
        "name": "Water Potability dataset",
        "source": "Kaggle — https://www.kaggle.com/datasets/adityakadiwal/water-potability",
        "mirror_used": "Public GitHub mirror of the same Kaggle file (see backend/data/DATA_SOURCE.md)",
        "rows": len(READINGS),
        "columns": list(FEATURE_META) + ["Potability"],
        "target": "Potability (1 = potable, 0 = non-potable)",
        "missing_values": {"ph": 491, "Sulfate": 781, "Trihalomethanes": 162},
        "imputation": "Median imputation (training only; raw rows keep missing values in the explorer)",
        "note": "No hardware data. Readings are replayed dataset rows, grouped into six supply zones.",
        "features": [FEATURE_META[k] for k in FEATURE_META],
    })


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5000"))
    # use_reloader=False: load_state() trains/loads the model once.
    # With the reloader on, Flask would load it twice at startup.
    app.run(host="0.0.0.0", port=port,
            debug=os.environ.get("FLASK_DEBUG", "true").lower() == "true",
            use_reloader=False)
