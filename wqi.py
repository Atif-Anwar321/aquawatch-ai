"""
Water Quality Index (WQI) and WHO-limit checks.

Software-only redesign note
---------------------------
The original synopsis used Arduino/ESP32 sensors. This version uses NO
hardware: readings come from a public dataset (see data/DATA_SOURCE.md).
The parameters below are the nine features of the Kaggle "Water
Potability" dataset. Dissolved oxygen and temperature from the synopsis
are NOT in that dataset, so they are not invented here.

Solids (TDS) honesty note
--------------------------
In this public dataset "Solids" values are far larger (mean ~22,000)
than drinking-water TDS in mg/L (WHO aesthetic guideline ~500 mg/L).
The Solids sub-index below therefore uses a log scale fitted to the
dataset's own range and is capped, and it is documented as a relative
indicator, not a literal WHO TDS comparison. All other limits follow
WHO Guidelines for Drinking-Water Quality (4th ed.) / US EPA values
as listed in FEATURES.
"""

FEATURES = [
    # key, label, unit, WHO / guideline limit, good (low) value, bad (high) value, weight
    ("ph", "pH", "pH units", "6.5 – 8.5", 7.0, 11.0, 0.18),
    ("Hardness", "Hardness", "mg/L", "≤ 300", 200.0, 350.0, 0.08),
    ("Solids", "Solids (TDS)", "mg/L*", "see note", 1000.0, 60000.0, 0.10),
    ("Chloramines", "Chloramines", "ppm", "≤ 4", 4.0, 13.0, 0.12),
    ("Sulfate", "Sulfate", "mg/L", "≤ 250", 250.0, 500.0, 0.10),
    ("Conductivity", "Conductivity", "µS/cm", "≤ 400", 400.0, 800.0, 0.12),
    ("Organic_carbon", "Organic carbon", "ppm", "≤ 10 (indicative)", 10.0, 30.0, 0.07),
    ("Trihalomethanes", "Trihalomethanes", "µg/L", "≤ 80", 60.0, 125.0, 0.07),
    ("Turbidity", "Turbidity", "NTU", "≤ 1 (ideal) / ≤ 5", 1.0, 10.0, 0.16),
]

FEATURE_META = {
    key: {"key": key, "label": label, "unit": unit, "limit": limit,
          "good": good, "bad": bad, "weight": weight}
    for key, label, unit, limit, good, bad, weight in FEATURES
}


def _clip(x, lo=0.0, hi=100.0):
    return max(lo, min(hi, x))


def sub_index(key, value):
    """Return a 0-100 sub-index (100 = best) for one parameter."""
    if value is None:
        return None
    try:
        v = float(value)
    except (TypeError, ValueError):
        return None
    meta = FEATURE_META[key]
    if key == "ph":
        if 6.5 <= v <= 8.5:
            return 100.0
        if v < 6.5:
            return _clip(100.0 - (6.5 - v) * 40.0)
        return _clip(100.0 - (v - 8.5) * 40.0)
    if key == "Solids":
        # Log scale, fitted to the dataset's range (see module docstring).
        import math
        if v <= 0:
            return 100.0
        lo, hi = math.log10(1000.0), math.log10(60000.0)
        return _clip(100.0 - (math.log10(v) - lo) / (hi - lo) * 100.0)
    good, bad = meta["good"], meta["bad"]
    if v <= good:
        return 100.0
    if v >= bad:
        return 0.0
    return _clip(100.0 - (v - good) / (bad - good) * 100.0)


def compute_wqi(reading):
    """Weighted WQI (0-100) from a dict of feature values. Missing values are skipped."""
    total_w, weighted = 0.0, 0.0
    parts = {}
    for key, _, _, _, _, _, weight in FEATURES:
        s = sub_index(key, reading.get(key))
        if s is not None:
            parts[key] = round(s, 1)
            weighted += s * weight
            total_w += weight
    if total_w == 0:
        return 0.0, parts
    return round(weighted / total_w, 1), parts


def wqi_category(wqi):
    if wqi >= 80:
        return "Safe"
    if wqi >= 50:
        return "Moderate"
    return "Unsafe"


def breached_parameters(reading):
    """Parameters outside their WHO guideline range (human-readable list)."""
    out = []
    v = reading
    if v.get("ph") is not None and not (6.5 <= float(v["ph"]) <= 8.5):
        out.append({"key": "ph", "label": "pH", "value": v["ph"], "limit": "6.5 – 8.5",
                    "message": "pH outside the WHO range 6.5–8.5."})
    if v.get("Turbidity") is not None and float(v["Turbidity"]) > 5:
        out.append({"key": "Turbidity", "label": "Turbidity", "value": v["Turbidity"], "limit": "≤ 5 NTU",
                    "message": "Turbidity above 5 NTU — water looks cloudy; particles may shield microbes."})
    if v.get("Chloramines") is not None and float(v["Chloramines"]) > 4:
        out.append({"key": "Chloramines", "label": "Chloramines", "value": v["Chloramines"], "limit": "≤ 4 ppm",
                    "message": "Chloramines above the 4 ppm guideline."})
    if v.get("Sulfate") is not None and float(v["Sulfate"]) > 250:
        out.append({"key": "Sulfate", "label": "Sulfate", "value": v["Sulfate"], "limit": "≤ 250 mg/L",
                    "message": "Sulfate above the 250 mg/L guideline (taste / laxative effects)."})
    if v.get("Conductivity") is not None and float(v["Conductivity"]) > 400:
        out.append({"key": "Conductivity", "label": "Conductivity", "value": v["Conductivity"], "limit": "≤ 400 µS/cm",
                    "message": "Conductivity above 400 µS/cm — high dissolved-ion load."})
    if v.get("Hardness") is not None and float(v["Hardness"]) > 300:
        out.append({"key": "Hardness", "label": "Hardness", "value": v["Hardness"], "limit": "≤ 300 mg/L",
                    "message": "Hardness above 300 mg/L (scaling, taste)."})
    if v.get("Trihalomethanes") is not None and float(v["Trihalomethanes"]) > 80:
        out.append({"key": "Trihalomethanes", "label": "Trihalomethanes", "value": v["Trihalomethanes"], "limit": "≤ 80 µg/L",
                    "message": "Trihalomethanes above 80 µg/L (disinfection by-products)."})
    return out


def final_status(wqi, ml_probability):
    """Combine the rule-based WQI with the ML potability probability.

    Safe     : WQI >= 80 and ML probability of potable >= 0.50
    Moderate : WQI 50-79
    Unsafe   : WQI < 50, or WQI < 65 with ML probability < 0.35
    """
    if wqi < 50:
        return "Unsafe"
    if wqi < 65 and ml_probability is not None and ml_probability < 0.35:
        return "Unsafe"
    if wqi >= 80 and (ml_probability is None or ml_probability >= 0.50):
        return "Safe"
    if wqi >= 80:
        return "Moderate"
    return "Moderate"
