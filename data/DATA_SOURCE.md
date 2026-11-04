# Data source — no hardware, dataset-driven

## What this project uses instead of sensors

The original synopsis used an Arduino/ESP32 sensor node. This
software-only version uses **no hardware at all**. Every reading shown
in the dashboard is a row from a public dataset, replayed across six
supply zones. There are no live sensor feeds, and timestamps in the
app are a clearly labelled *replay clock*, not sensor timestamps.

## Dataset

**Water Potability dataset** — Kaggle:
https://www.kaggle.com/datasets/adityakadiwal/water-potability

- 3,276 samples, 9 physicochemical features + `Potability` label
  (1 = potable, 0 = non-potable): 1,278 potable / 1,998 non-potable.
- Features: `ph`, `Hardness`, `Solids`, `Chloramines`, `Sulfate`,
  `Conductivity`, `Organic_carbon`, `Trihalomethanes`, `Turbidity`.
- Missing values: `ph` 491, `Sulfate` 781, `Trihalomethanes` 162.
  Training uses median imputation; the raw file is kept as downloaded.

The file `water_potability.csv` in this folder is a copy of that Kaggle
file, fetched from a public GitHub mirror of the same dataset
(`schmalmr/607_Fall_2021_Project_2_Water`, file
`Potable_Water_CSV.csv`). Verify it after download: it must have
3,276 data rows and the 10 column headers listed above.

## Getting the full dataset yourself (Kaggle)

Option A — Kaggle website: open the dataset page above, download
`water_potability.csv`, and replace this folder's file with it.

Option B — Kaggle CLI (needs a Kaggle account + API token):

```bash
pip install kaggle
kaggle datasets download -d adityakadiwal/water-potability --unzip
cp water_potability.csv backend/data/water_potability.csv
```

Option C — re-run the included script:

```bash
python scripts/download_dataset.py
```

## What the dataset does NOT contain

Dissolved oxygen and temperature appear in the synopsis but are **not**
in this dataset, so this project does not invent them. The WQI and the
ML model use only the nine available features. Adding dissolved
oxygen / temperature would need a different dataset — see
`docs/SOFTWARE_ONLY_REDESIGN.md`.

## Licence / credit

The dataset is a public Kaggle dataset shared for learning. Credit the
Kaggle dataset page when you present this project, and keep this file
with the data.
