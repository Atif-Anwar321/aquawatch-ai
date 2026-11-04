#!/usr/bin/env python3
"""
Train the water-potability classifier (Random Forest, as in the synopsis §5.3).

Data: backend/data/water_potability.csv — the public Kaggle "Water
Potability" dataset (3,276 samples, 9 features + Potability label).
No hardware and no sensor data are used.

Pre-processing: median imputation for the three columns with missing
values (pH, Sulfate, Trihalomethanes), stratified 80/20 split.

Outputs: backend/models/model.joblib, backend/models/metrics.json
Run:  python train_model.py        (from the backend/ folder)
"""
import json
import os

import joblib
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, confusion_matrix, f1_score, precision_score, recall_score
from sklearn.model_selection import train_test_split

BASE = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = os.path.join(BASE, "data", "water_potability.csv")
MODEL_DIR = os.path.join(BASE, "models")

FEATURES = ["ph", "Hardness", "Solids", "Chloramines", "Sulfate",
            "Conductivity", "Organic_carbon", "Trihalomethanes", "Turbidity"]
TARGET = "Potability"


def load_dataset(path=DATA_PATH):
    df = pd.read_csv(path)
    medians = df[FEATURES].median(numeric_only=True)
    df[FEATURES] = df[FEATURES].fillna(medians)
    return df, medians.to_dict()


def train(df):
    X = df[FEATURES]
    y = df[TARGET].astype(int)
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.20, random_state=42, stratify=y)
    model = RandomForestClassifier(
        n_estimators=200, random_state=42, n_jobs=-1,
        class_weight="balanced_subsample")
    model.fit(X_train, y_train)
    pred = model.predict(X_test)
    proba = model.predict_proba(X_test)[:, 1]
    cm = confusion_matrix(y_test, pred).tolist()
    metrics = {
        "accuracy": round(float(accuracy_score(y_test, pred)), 4),
        "precision": round(float(precision_score(y_test, pred, zero_division=0)), 4),
        "recall": round(float(recall_score(y_test, pred, zero_division=0)), 4),
        "f1": round(float(f1_score(y_test, pred, zero_division=0)), 4),
        "confusion_matrix": {"labels": ["Non-potable (0)", "Potable (1)"], "matrix": cm},
        "test_samples": int(len(y_test)),
        "train_samples": int(len(y_train)),
        "feature_importance": {f: round(float(v), 4)
                               for f, v in zip(FEATURES, model.feature_importances_)},
        "model": "RandomForestClassifier(n_estimators=200, random_state=42)",
        "split": "80/20 stratified, random_state=42",
        "imputation": "median",
    }
    return model, metrics


def main():
    df, medians = load_dataset()
    print(f"Dataset: {len(df)} rows, potable={int(df[TARGET].sum())}, "
          f"non-potable={int(len(df) - df[TARGET].sum())}")
    model, metrics = train(df)
    os.makedirs(MODEL_DIR, exist_ok=True)
    joblib.dump({"model": model, "medians": medians, "features": FEATURES},
                os.path.join(MODEL_DIR, "model.joblib"))
    with open(os.path.join(MODEL_DIR, "metrics.json"), "w") as f:
        json.dump(metrics, f, indent=2)
    print("Accuracy:", metrics["accuracy"], "| F1:", metrics["f1"])
    print("Saved model + metrics to", MODEL_DIR)


if __name__ == "__main__":
    main()
