"""
User feature engineering for the plan recommendation model.

Converts a user's profile and medical profile dicts into a fixed-length
numpy feature vector suitable for scikit-learn classifiers.
"""

from __future__ import annotations

from typing import Any

import numpy as np

# ---------------------------------------------------------------------------
# Encoding maps — must stay in sync with Prisma enums
# ---------------------------------------------------------------------------

AGE_BAND_MAP: dict[str, float] = {
    "AGE_0_17": 10.0,
    "AGE_18_25": 22.0,
    "AGE_26_35": 30.0,
    "AGE_36_45": 40.0,
    "AGE_46_55": 50.0,
    "AGE_56_64": 60.0,
    "AGE_65_PLUS": 72.0,
}

INCOME_BAND_MAP: dict[str, float] = {
    "low": 0.0,
    "medium": 1.0,
    "high": 2.0,
    "prefer_not_to_say": 1.0,  # default to middle
}

EMPLOYMENT_TYPES = [
    "student",
    "employed",
    "self_employed",
    "unemployed",
    "retiree",
]

IMMIGRATION_STATUSES = [
    "citizen",
    "permanent_resident",
    "work_permit",
    "student_visa",
    "refugee",
    "asylum_seeker",
    "undocumented",
    "unknown",
]

PROVINCES = [
    "AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT",
]

# Conditions considered high-severity for scoring purposes
HIGH_SEVERITY_CONDITIONS = {
    "cancer", "heart failure", "copd", "chronic kidney disease", "ckd",
    "stroke", "hiv", "hepatitis", "cirrhosis", "organ transplant",
    "multiple sclerosis", "ms", "als", "parkinson", "epilepsy",
}

MODERATE_SEVERITY_CONDITIONS = {
    "diabetes", "type 2 diabetes", "type 1 diabetes", "hypertension",
    "asthma", "arthritis", "depression", "anxiety", "bipolar",
    "crohn", "colitis", "lupus", "fibromyalgia",
}

# Medications that indicate specialty drug needs
SPECIALTY_DRUG_KEYWORDS = {
    "humira", "enbrel", "remicade", "stelara", "keytruda", "opdivo",
    "ozempic", "trulicity", "jardiance", "lantus", "insulin",
    "methotrexate", "biologics", "immunosuppressant",
}

# Family history conditions that increase risk
FAMILY_RISK_CONDITIONS = {
    "cancer", "heart disease", "diabetes", "stroke", "hypertension",
    "alzheimer", "dementia", "autoimmune",
}

# ---------------------------------------------------------------------------
# Feature names — defines the output vector order
# ---------------------------------------------------------------------------

FEATURE_NAMES: list[str] = [
    "age_band",
    "num_conditions",
    "condition_severity_max",
    "num_medications",
    "has_specialty_drugs",
    "num_dependents",
    "income_band",
    # employment one-hot (5)
    *[f"employment_{t}" for t in EMPLOYMENT_TYPES],
    "has_employer_benefits",
    # immigration one-hot (8)
    *[f"immigration_{s}" for s in IMMIGRATION_STATUSES],
    "risk_score",
    # province one-hot (13)
    *[f"province_{p}" for p in PROVINCES],
    "surgical_history_count",
    "allergy_count",
    "family_risk_score",
]


def feature_count() -> int:
    """Return the expected length of the feature vector."""
    return len(FEATURE_NAMES)


# ---------------------------------------------------------------------------
# Core function
# ---------------------------------------------------------------------------


def user_to_features(
    profile: dict[str, Any] | None,
    medical_profile: dict[str, Any] | None,
) -> np.ndarray:
    """
    Convert a user profile + medical profile into a numpy feature array.

    Parameters
    ----------
    profile : dict or None
        Keys match the Prisma Profile model (ageBand, employmentStatus,
        hasEmployerBenefits, dependants, incomeBand, immigrationStatus,
        province, specialCategory).
    medical_profile : dict or None
        Keys match the Prisma MedicalProfile model (conditions, medications,
        allergies, surgeries, familyHistory, riskFactors).

    Returns
    -------
    np.ndarray
        1-D float64 array of length ``feature_count()``.
    """
    profile = profile or {}
    medical = medical_profile or {}

    features: list[float] = []

    # 1. age_band (numeric midpoint)
    features.append(AGE_BAND_MAP.get(profile.get("ageBand", ""), 30.0))

    # 2. num_conditions
    conditions = _as_list(medical.get("conditions"))
    features.append(float(len(conditions)))

    # 3. condition_severity_max (0=none, 1=mild, 2=moderate, 3=high)
    features.append(_max_severity(conditions))

    # 4. num_medications
    medications = _as_list(medical.get("medications"))
    features.append(float(len(medications)))

    # 5. has_specialty_drugs (0 or 1)
    features.append(1.0 if _has_specialty_drugs(medications) else 0.0)

    # 6. num_dependents
    dependants = _as_list(profile.get("dependants"))
    features.append(float(len(dependants)))

    # 7. income_band (numeric)
    features.append(INCOME_BAND_MAP.get(profile.get("incomeBand", ""), 1.0))

    # 8–12. employment one-hot (5 values)
    emp = profile.get("employmentStatus", "")
    for t in EMPLOYMENT_TYPES:
        features.append(1.0 if emp == t else 0.0)

    # 13. has_employer_benefits (0 or 1)
    features.append(1.0 if profile.get("hasEmployerBenefits") == "yes" else 0.0)

    # 14–21. immigration one-hot (8 values)
    imm = profile.get("immigrationStatus", "")
    for s in IMMIGRATION_STATUSES:
        features.append(1.0 if imm == s else 0.0)

    # 22. risk_score (composite 0–10)
    risk_factors = _as_list(medical.get("riskFactors"))
    features.append(_compute_risk_score(conditions, medications, risk_factors))

    # 23–35. province one-hot (13 values)
    prov = profile.get("province", "").upper()
    for p in PROVINCES:
        features.append(1.0 if prov == p else 0.0)

    # 36. surgical_history_count
    surgeries = _as_list(medical.get("surgeries"))
    features.append(float(len(surgeries)))

    # 37. allergy_count
    allergies = _as_list(medical.get("allergies"))
    features.append(float(len(allergies)))

    # 38. family_risk_score (0–5)
    family_history = _as_list(medical.get("familyHistory"))
    features.append(_compute_family_risk_score(family_history))

    return np.array(features, dtype=np.float64)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _as_list(value: Any) -> list[Any]:
    """Coerce a value to a list, handling None, dicts, and other types."""
    if value is None:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, dict):
        # e.g. old-style { spouse: true, children: 2 } dependants
        return [value]
    return []


def _item_name(item: Any) -> str:
    """Extract a name string from a list item (str or dict with 'name')."""
    if isinstance(item, str):
        return item.lower()
    if isinstance(item, dict):
        return str(item.get("name", item.get("rawText", ""))).lower()
    return ""


def _max_severity(conditions: list[Any]) -> float:
    """Return max severity: 0=none, 1=mild, 2=moderate, 3=high."""
    if not conditions:
        return 0.0
    max_sev = 0.0
    for cond in conditions:
        name = _item_name(cond)
        if not name:
            max_sev = max(max_sev, 1.0)
        elif any(h in name for h in HIGH_SEVERITY_CONDITIONS):
            max_sev = max(max_sev, 3.0)
        elif any(m in name for m in MODERATE_SEVERITY_CONDITIONS):
            max_sev = max(max_sev, 2.0)
        else:
            max_sev = max(max_sev, 1.0)
    return max_sev


def _has_specialty_drugs(medications: list[Any]) -> bool:
    """Check if any medications are specialty/biologic drugs."""
    for med in medications:
        name = _item_name(med)
        if any(kw in name for kw in SPECIALTY_DRUG_KEYWORDS):
            return True
    return False


def _compute_risk_score(
    conditions: list[Any],
    medications: list[Any],
    risk_factors: list[Any],
) -> float:
    """
    Composite risk score 0–10 based on conditions, medications, risk factors.
    """
    score = 0.0

    # Condition count contributes up to 4 points
    score += min(len(conditions) * 0.8, 4.0)

    # Polypharmacy (5+ meds) adds risk
    if len(medications) >= 5:
        score += 1.5
    elif len(medications) >= 3:
        score += 0.5

    # High-severity conditions add risk
    for cond in conditions:
        name = _item_name(cond)
        if any(h in name for h in HIGH_SEVERITY_CONDITIONS):
            score += 1.0
            break

    # Risk factors (smoking, obesity, etc.) add risk
    score += min(len(risk_factors) * 0.5, 2.0)

    # Specialty drugs indicate complex care
    if _has_specialty_drugs(medications):
        score += 1.0

    return min(score, 10.0)


def _compute_family_risk_score(family_history: list[Any]) -> float:
    """
    Family risk score 0–5 based on family history entries.
    """
    if not family_history:
        return 0.0
    score = 0.0
    for item in family_history:
        name = _item_name(item)
        if any(r in name for r in FAMILY_RISK_CONDITIONS):
            score += 1.0
        else:
            score += 0.3  # unknown family history items still add some risk
    return min(score, 5.0)
