#!/usr/bin/env python3
"""Re-download the Water Potability dataset (public mirror of the Kaggle file).

Usage:  python scripts/download_dataset.py
Writes: backend/data/water_potability.csv  (3,276 data rows expected)
"""
import csv
import os
import urllib.request

URL = ("https://raw.githubusercontent.com/schmalmr/607_Fall_2021_Project_2_Water/"
       "main/Potable_Water_CSV.csv")
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                   "backend", "data", "water_potability.csv")
EXPECTED = ["ph", "Hardness", "Solids", "Chloramines", "Sulfate", "Conductivity",
            "Organic_carbon", "Trihalomethanes", "Turbidity", "Potability"]


def main():
    print("Downloading", URL)
    urllib.request.urlretrieve(URL, OUT)
    with open(OUT, newline="") as f:
        reader = csv.reader(f)
        header = next(reader)
        rows = sum(1 for _ in reader)
    assert header == EXPECTED, f"Unexpected header: {header}"
    assert rows == 3276, f"Expected 3276 rows, got {rows}"
    print(f"OK: {rows} rows saved to {OUT}")


if __name__ == "__main__":
    main()
