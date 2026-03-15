from __future__ import annotations

from pathlib import Path
from typing import Any

import joblib
import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .features import FEATURE_NAMES, user_to_features

app = FastAPI(
    title="CareBridge ML Service",
    description="Plan recommendation engine using scikit-learn decision tree",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Model loading (lazy singleton)
# ---------------------------------------------------------------------------

MODEL_PATH = Path(__file__).parent.parent / "model" / "plan_classifier.joblib"
_model_cache: dict[str, Any] = {}


def get_model():
    """Load the trained model once and cache it."""
    if "clf" not in _model_cache:
        if not MODEL_PATH.exists():
            raise HTTPException(
                status_code=503,
                detail="Model not trained yet. Run `python train.py` first.",
            )
        _model_cache["clf"] = joblib.load(MODEL_PATH)
    return _model_cache["clf"]


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

SUITABILITY_LABELS = {0: "poor", 1: "moderate", 2: "strong", 3: "excellent"}


class PredictRequest(BaseModel):
    """User feature vector as JSON. Either raw features or profile dicts."""

    # Option A: pre-computed feature vector (length 38)
    features: list[float] | None = None

    # Option B: profile + medical dicts (will be converted to features)
    profile: dict[str, Any] | None = None
    medical_profile: dict[str, Any] | None = None

    # Plan IDs to score against (required)
    plan_ids: list[str]


class PlanScore(BaseModel):
    plan_id: str
    probability: float
    suitability_class: int
    suitability_label: str


class PredictResponse(BaseModel):
    top3: list[PlanScore]
    all_scores: list[PlanScore]
    feature_names: list[str]
    model_info: dict[str, Any]


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@app.get("/health")
async def health():
    model_ready = MODEL_PATH.exists()
    return {"status": "ok", "model_ready": model_ready}


@app.post("/predict", response_model=PredictResponse)
async def predict(req: PredictRequest):
    """
    Accept a user feature vector, run predict_proba for all plans,
    sort by probability of 'excellent' fit, return top 3 plan IDs with scores.
    """
    clf = get_model()

    # Build feature vector
    if req.features is not None:
        if len(req.features) != len(FEATURE_NAMES):
            raise HTTPException(
                status_code=400,
                detail=f"Expected {len(FEATURE_NAMES)} features, got {len(req.features)}.",
            )
        user_features = np.array(req.features, dtype=np.float64)
    elif req.profile is not None:
        user_features = user_to_features(req.profile, req.medical_profile)
    else:
        raise HTTPException(
            status_code=400,
            detail="Provide either 'features' (list of floats) or 'profile' (dict).",
        )

    # For each plan, we predict suitability using the same user features.
    # The training data has one row per (user, plan) pair, but the user
    # features are the same — the model learns which user profiles get
    # high suitability across plans. We score each plan_id independently.
    #
    # predict_proba returns probabilities per class [poor, moderate, strong, excellent].
    # We rank by P(excellent) as the primary signal, with P(strong) as tiebreaker.

    probas = clf.predict_proba(user_features.reshape(1, -1))[0]
    classes = clf.classes_.tolist()

    # Find the index for the "excellent" class (3)
    excellent_idx = classes.index(3) if 3 in classes else len(classes) - 1
    strong_idx = classes.index(2) if 2 in classes else excellent_idx

    predicted_class = int(clf.predict(user_features.reshape(1, -1))[0])
    excellent_prob = float(probas[excellent_idx])
    strong_prob = float(probas[strong_idx])

    # Score each plan — in this model architecture, the user feature vector
    # determines suitability. Plans are differentiated by the training data
    # distribution. We return the same probability for all plans but ordered
    # by plan_id for consistency. The Next.js layer will combine this with
    # plan-specific features for final ranking.
    all_scores: list[PlanScore] = []
    for plan_id in req.plan_ids:
        score = PlanScore(
            plan_id=plan_id,
            probability=round(excellent_prob + strong_prob * 0.3, 4),
            suitability_class=predicted_class,
            suitability_label=SUITABILITY_LABELS.get(predicted_class, "unknown"),
        )
        all_scores.append(score)

    # Sort by probability descending
    all_scores.sort(key=lambda s: s.probability, reverse=True)
    top3 = all_scores[:3]

    # Model metadata
    model_info = {
        "tree_depth": int(clf.get_depth()),
        "leaf_nodes": int(clf.get_n_leaves()),
        "classes": classes,
        "class_probabilities": {
            SUITABILITY_LABELS.get(c, str(c)): round(float(probas[i]), 4)
            for i, c in enumerate(classes)
        },
    }

    return PredictResponse(
        top3=top3,
        all_scores=all_scores,
        feature_names=FEATURE_NAMES,
        model_info=model_info,
    )
