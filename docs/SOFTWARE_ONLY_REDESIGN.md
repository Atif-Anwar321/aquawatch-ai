# Software-only redesign — from the synopsis to this implementation

The synopsis (*AI-Driven Water Quality and Pollution Monitoring in Water Supply
Systems*, Ray, Gaur & Anwar) proposed an Arduino/ESP32 sensor node. At the
project owner's request, **every hardware part was removed**. This document
records exactly what replaced each hardware element, so a reviewer or examiner
can trace every synopsis claim to the software that now implements it.

## Layer-by-layer mapping

| Synopsis layer (§5.1) | Hardware version | Software-only version (this project) |
|---|---|---|
| Sensor layer | pH, turbidity, TDS, conductivity, temperature sensors | Public dataset: Kaggle Water Potability, 3,276 samples (`backend/data/water_potability.csv`) |
| Edge / microcontroller layer | ESP32 + Wi-Fi, averaging/filtering | Dataset loader + median imputation (`backend/train_model.py`, `load_dataset`) |
| Cloud / data layer | Firebase / ThingSpeak time-stamped readings | CSV file + Flask API replay across 6 zones on a replay clock (`backend/app.py`) |
| Intelligence layer | Random Forest / ANN on sensor + dataset data | Random Forest (200 trees) trained only on the dataset (`backend/train_model.py`) + rule-based WQI (`backend/wqi.py`) |
| Application layer | Blynk / web dashboard (HTML, JS, Chart.js) | React + Vite dashboard with Recharts (`frontend/`) |
| Alert layer | Telegram Bot / email / SMS on Unsafe | In-app alerts from latest zone readings (`GET /api/alerts`); email/Telegram wiring is future work |

## Objectives (§4) — rewritten software-only

1. ~~Assemble a low-cost IoT sensor node~~ → Ingest and validate a public water-quality dataset covering pH, turbidity, TDS (Solids), conductivity and related parameters.
2. ~~Wireless pipeline from microcontroller to cloud~~ → A local data pipeline: CSV → pandas → Flask API, replayed per zone at hourly replay steps.
3. Train an ML model classifying water quality (Safe / Moderate / Unsafe) — **unchanged**, now trained only on the dataset.
4. Integrate the model so every new reading is evaluated — **unchanged**: every replayed row and every predictor input is scored by the model + WQI on arrival.
5. Real-time visualisation dashboard — **unchanged in intent**: the React dashboard updates per zone, with replay and history charts.
6. Automated alerts on unsafe water — **changed medium**: in-app alerts (email/Telegram not yet wired).
7. ~~Validate with contaminated lab samples~~ → Validate on the held-out 20% test split + predictor presets (safe / unsafe / typical samples) and report honest metrics.

## Parameters

The dataset provides 9 features: pH, Hardness, Solids, Chloramines, Sulfate,
Conductivity, Organic carbon, Trihalomethanes, Turbidity. The synopsis also
lists dissolved oxygen and temperature; **neither is in the dataset, and neither
is simulated or invented in this project**. If a future version adds them, it
needs a dataset that actually contains them (e.g. a CPCB / USGS water-quality
dataset) and the WQI weights in `backend/wqi.py` must be re-derived.

## Contamination Spread Simulator (Digital Twin)

The simulator (`backend/simulation.py`, tab "Contamination Simulator") is a
simplified planning model over the same six zones: water flows in one fixed
direction, a pollutant travels downstream with a configured travel time per
pipe, is diluted and decays each hour, and is partly removed at the treatment
plant. Each zone's WQI starts at its measured baseline and falls with the
pollutant concentration present. The user can test valve closures, treatment
boosts and public advisories, and the same scenario is run with and without
the actions for comparison. It is not a hydraulic simulator: it does not model
pressure, pipe diameter or pumps, and its travel times and dilution factors
must be calibrated against measured flow data before operational use.

## What "real-time" means here

"Real-time" in this version means: a new dataset row is classified and shown as
soon as it is replayed, and a user-entered sample is classified immediately by
the API. There is no live sensor stream. Every timestamp in the UI is a replay
clock and is labelled as such in the interface and in the code.

## Results to report honestly

- Random Forest test accuracy ≈ 66%, F1 ≈ 0.38 (see `backend/models/metrics.json`
  after training). The dataset is known to be difficult; do not report higher
  numbers without a different dataset or model.
- WQI is a transparent rule-based index (WHO limits), not a learned score.
  Its Solids sub-index is log-scaled to the dataset's range — see `backend/wqi.py`.
