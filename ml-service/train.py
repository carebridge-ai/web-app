"""
S7-01: Train and export a DecisionTreeClassifier for plan suitability.

Loads training data from data/training_data.csv, trains a
DecisionTreeClassifier (max_depth=8, min_samples_leaf=50,
class_weight='balanced'), runs 5-fold cross-validation, and exports
the model to model/plan_classifier.joblib.

Usage:
    python train.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.model_selection import cross_val_score
from sklearn.tree import DecisionTreeClassifier

# Add parent for imports
sys.path.insert(0, str(Path(__file__).parent))
from app.features import FEATURE_NAMES

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

DATA_FILE = Path(__file__).parent / "data" / "training_data.csv"
MODEL_DIR = Path(__file__).parent / "model"
MODEL_FILE = MODEL_DIR / "plan_classifier.joblib"


def train() -> None:
    # ------------------------------------------------------------------
    # 1. Load data
    # ------------------------------------------------------------------
    if not DATA_FILE.exists():
        print(f"[error] Training data not found at {DATA_FILE}")
        print("       Run `python generate_training_data.py` first.")
        sys.exit(1)

    print(f"[step 1/4] Loading training data from {DATA_FILE}...")
    df = pd.read_csv(DATA_FILE)
    print(f"           {len(df)} rows, {len(df.columns)} columns")

    # ------------------------------------------------------------------
    # 2. Prepare features and labels
    # ------------------------------------------------------------------
    print("[step 2/4] Preparing feature matrix and labels...")

    # Feature columns are the 38 user features defined in features.py
    missing = [f for f in FEATURE_NAMES if f not in df.columns]
    if missing:
        print(f"[error] Missing feature columns: {missing}")
        sys.exit(1)

    X = df[FEATURE_NAMES].values.astype(np.float64)
    y = df["suitability_class"].values.astype(int)

    classes, counts = np.unique(y, return_counts=True)
    print(f"           Features: {X.shape[1]}, Samples: {X.shape[0]}")
    print(f"           Class distribution: {dict(zip(classes.tolist(), counts.tolist()))}")

    # ------------------------------------------------------------------
    # 3. Cross-validate
    # ------------------------------------------------------------------
    print("[step 3/4] Running 5-fold cross-validation...")

    clf = DecisionTreeClassifier(
        max_depth=8,
        min_samples_leaf=50,
        class_weight="balanced",
        random_state=42,
    )

    scores = cross_val_score(clf, X, y, cv=5, scoring="accuracy")
    mean_acc = scores.mean()
    std_acc = scores.std()

    print(f"           Fold accuracies: {[round(s, 4) for s in scores]}")
    print(f"           Mean accuracy:   {mean_acc:.4f} (+/- {std_acc:.4f})")

    if mean_acc < 0.70:
        print(f"[warn] Cross-validation accuracy ({mean_acc:.4f}) is below 70% target.")
        print("       The model will still be exported, but consider improving training data.")

    # ------------------------------------------------------------------
    # 4. Train on full dataset and export
    # ------------------------------------------------------------------
    print("[step 4/4] Training final model on full dataset and exporting...")

    clf.fit(X, y)

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(clf, MODEL_FILE)

    print(f"\n[done] Model exported to {MODEL_FILE}")
    print(f"       Tree depth: {clf.get_depth()}")
    print(f"       Leaf nodes: {clf.get_n_leaves()}")
    print(f"       Classes:    {clf.classes_.tolist()}")

    # Print top feature importances
    importances = clf.feature_importances_
    top_indices = np.argsort(importances)[::-1][:10]
    print("\n       Top 10 feature importances:")
    for i in top_indices:
        print(f"         {FEATURE_NAMES[i]:30s} {importances[i]:.4f}")

    # Quick verification: load and predict
    loaded = joblib.load(MODEL_FILE)
    sample = X[:3]
    preds = loaded.predict(sample)
    probas = loaded.predict_proba(sample)
    print(f"\n       Verification — predictions on first 3 rows: {preds.tolist()}")
    print(f"       Probabilities shape: {probas.shape}")


if __name__ == "__main__":
    train()
