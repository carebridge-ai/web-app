"""
Generate synthetic training data for plan recommendation model.

Creates 5,000+ synthetic user profiles with random demographics/conditions,
then calls the Groq LLM to score each user against available plans.
Outputs to ml-service/data/training_data.csv.

Usage:
    python generate_training_data.py [--rows 5000] [--batch-size 10] [--dry-run]
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import random
import re
import sys
import time
from pathlib import Path
from typing import Any

import numpy as np
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

# Add parent for imports
sys.path.insert(0, str(Path(__file__).parent))
from app.features import FEATURE_NAMES, user_to_features

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

# Load .env.local from project root
PROJECT_ROOT = Path(__file__).parent.parent
for env_file in [PROJECT_ROOT / ".env.local", PROJECT_ROOT / ".env"]:
    if env_file.exists():
        load_dotenv(env_file)

_raw_db_url = os.environ.get("DATABASE_URL", "")
# Strip Prisma-specific ?schema= param that psycopg2 doesn't understand
DATABASE_URL = _raw_db_url.split("?")[0] if "?schema=" in _raw_db_url else _raw_db_url
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
OPENAI_BASE_URL = os.environ.get("OPENAI_BASE_URL", "https://api.groq.com/openai/v1")
LLM_MODEL = os.environ.get("LLM_MODEL", "qwen/qwen3-32b")

OUTPUT_DIR = Path(__file__).parent / "data"
OUTPUT_FILE = OUTPUT_DIR / "training_data.csv"

# Suitability classes
CLASSES = {0: "poor", 1: "moderate", 2: "strong", 3: "excellent"}

# Rate limiting
RATE_LIMIT_DELAY = 2.0  # seconds between batches
MAX_RETRIES = 3
RETRY_DELAY = 5.0

# ---------------------------------------------------------------------------
# Synthetic profile generation pools
# ---------------------------------------------------------------------------

AGE_BANDS = [
    "AGE_0_17", "AGE_18_25", "AGE_26_35", "AGE_36_45",
    "AGE_46_55", "AGE_56_64", "AGE_65_PLUS",
]
# Weighted: more working-age adults
AGE_WEIGHTS = [0.05, 0.15, 0.20, 0.20, 0.18, 0.12, 0.10]

PROVINCES = ["ON", "BC", "QC", "AB", "MB", "SK", "NS", "NB", "NL", "PE", "NT", "NU", "YT"]
PROVINCE_WEIGHTS = [0.38, 0.14, 0.22, 0.12, 0.04, 0.03, 0.02, 0.02, 0.01, 0.005, 0.005, 0.005, 0.005]

IMMIGRATION_STATUSES = [
    "citizen", "permanent_resident", "work_permit", "student_visa",
    "refugee", "asylum_seeker", "undocumented", "unknown",
]
IMMIGRATION_WEIGHTS = [0.45, 0.20, 0.10, 0.08, 0.06, 0.04, 0.02, 0.05]

EMPLOYMENT_STATUSES = ["student", "employed", "self_employed", "unemployed", "retiree"]
EMPLOYMENT_WEIGHTS = [0.12, 0.45, 0.12, 0.15, 0.16]

INCOME_BANDS = ["low", "medium", "high", "prefer_not_to_say"]
INCOME_WEIGHTS = [0.30, 0.40, 0.20, 0.10]

SPECIAL_CATEGORIES = [None, "refugee", "temp_foreign_worker", "intl_student", "asylum_seeker"]

CONDITIONS_POOL = [
    # High severity
    ("cancer", 0.03), ("heart failure", 0.04), ("COPD", 0.05),
    ("chronic kidney disease", 0.03), ("stroke", 0.02), ("multiple sclerosis", 0.01),
    # Moderate severity
    ("Type 2 diabetes", 0.10), ("hypertension", 0.15), ("asthma", 0.08),
    ("depression", 0.10), ("anxiety", 0.12), ("arthritis", 0.07),
    ("bipolar disorder", 0.02), ("Crohn's disease", 0.02),
    # Mild
    ("eczema", 0.05), ("migraine", 0.06), ("allergic rhinitis", 0.08),
    ("acid reflux", 0.06), ("back pain", 0.07), ("insomnia", 0.05),
]

MEDICATIONS_POOL = [
    # Common
    ("metformin", 0.10), ("lisinopril", 0.08), ("amlodipine", 0.07),
    ("omeprazole", 0.08), ("simvastatin", 0.06), ("levothyroxine", 0.05),
    ("amoxicillin", 0.04), ("ibuprofen", 0.09), ("acetaminophen", 0.10),
    ("sertraline", 0.06), ("escitalopram", 0.05), ("bupropion", 0.04),
    ("albuterol", 0.05), ("montelukast", 0.04), ("gabapentin", 0.03),
    # Specialty
    ("Humira", 0.02), ("Ozempic", 0.03), ("insulin", 0.04),
    ("Enbrel", 0.01), ("Keytruda", 0.005),
]

ALLERGIES_POOL = [
    "penicillin", "sulfa", "aspirin", "latex", "iodine",
    "shellfish", "peanuts", "tree nuts", "eggs", "codeine",
]

SURGERIES_POOL = [
    "appendectomy", "cholecystectomy", "knee replacement",
    "hip replacement", "C-section", "tonsillectomy",
    "hernia repair", "cataract surgery", "wisdom teeth removal",
]

FAMILY_HISTORY_POOL = [
    "heart disease", "cancer", "diabetes", "stroke",
    "hypertension", "Alzheimer's", "autoimmune disease",
]

RISK_FACTORS_POOL = [
    "smoker", "former smoker", "obesity", "sedentary lifestyle",
    "heavy alcohol use", "high stress",
]


# ---------------------------------------------------------------------------
# Profile generation
# ---------------------------------------------------------------------------


def generate_random_profile() -> dict[str, Any]:
    """Generate a random but coherent user profile."""
    age_band = random.choices(AGE_BANDS, weights=AGE_WEIGHTS, k=1)[0]
    province = random.choices(PROVINCES, weights=PROVINCE_WEIGHTS, k=1)[0]
    immigration = random.choices(IMMIGRATION_STATUSES, weights=IMMIGRATION_WEIGHTS, k=1)[0]
    employment = random.choices(EMPLOYMENT_STATUSES, weights=EMPLOYMENT_WEIGHTS, k=1)[0]
    income = random.choices(INCOME_BANDS, weights=INCOME_WEIGHTS, k=1)[0]

    # Coherence rules
    if age_band == "AGE_0_17":
        employment = "student"
        income = "low"
    elif age_band == "AGE_65_PLUS":
        if random.random() < 0.7:
            employment = "retiree"
    if immigration == "student_visa":
        if random.random() < 0.7:
            employment = "student"

    has_benefits = "unknown"
    if employment == "employed":
        has_benefits = random.choices(["yes", "no", "unknown"], weights=[0.55, 0.35, 0.10], k=1)[0]
    elif employment in ("self_employed", "unemployed", "student", "retiree"):
        has_benefits = random.choices(["no", "unknown"], weights=[0.8, 0.2], k=1)[0]

    # Special category coherence
    special = None
    if immigration == "refugee":
        special = "refugee"
    elif immigration == "asylum_seeker":
        special = "asylum_seeker"
    elif immigration == "student_visa" and random.random() < 0.6:
        special = "intl_student"
    elif immigration == "work_permit" and random.random() < 0.4:
        special = "temp_foreign_worker"

    # Dependants
    num_deps = 0
    if age_band in ("AGE_26_35", "AGE_36_45", "AGE_46_55"):
        num_deps = random.choices([0, 1, 2, 3, 4], weights=[0.35, 0.25, 0.25, 0.10, 0.05], k=1)[0]
    elif age_band in ("AGE_56_64", "AGE_65_PLUS"):
        num_deps = random.choices([0, 1], weights=[0.7, 0.3], k=1)[0]

    dependants = [{"relation": "dependent"} for _ in range(num_deps)]

    return {
        "ageBand": age_band,
        "province": province,
        "immigrationStatus": immigration,
        "employmentStatus": employment,
        "hasEmployerBenefits": has_benefits,
        "incomeBand": income,
        "specialCategory": special,
        "dependants": dependants,
    }


def generate_random_medical(age_band: str) -> dict[str, Any]:
    """Generate a random but coherent medical profile."""
    # Older people have more conditions
    age_condition_factor = {
        "AGE_0_17": 0.3, "AGE_18_25": 0.5, "AGE_26_35": 0.7,
        "AGE_36_45": 1.0, "AGE_46_55": 1.3, "AGE_56_64": 1.5, "AGE_65_PLUS": 1.8,
    }.get(age_band, 1.0)

    # Sample conditions
    conditions = []
    for name, base_prob in CONDITIONS_POOL:
        if random.random() < base_prob * age_condition_factor:
            conditions.append({"name": name})

    # Sample medications (correlated with conditions)
    medications = []
    med_count = max(0, len(conditions) + random.randint(-1, 2))
    if med_count > 0:
        available_meds = list(MEDICATIONS_POOL)
        random.shuffle(available_meds)
        for name, _ in available_meds[:med_count]:
            medications.append({"name": name})

    # Allergies (1-3 with 30% chance)
    allergies = []
    if random.random() < 0.30:
        k = random.randint(1, 3)
        allergies = [{"name": a} for a in random.sample(ALLERGIES_POOL, min(k, len(ALLERGIES_POOL)))]

    # Surgeries
    surgeries = []
    if random.random() < 0.25 * age_condition_factor:
        k = random.randint(1, 2)
        surgeries = [{"name": s} for s in random.sample(SURGERIES_POOL, min(k, len(SURGERIES_POOL)))]

    # Family history
    family_history = []
    if random.random() < 0.40:
        k = random.randint(1, 3)
        family_history = [{"name": f} for f in random.sample(FAMILY_HISTORY_POOL, min(k, len(FAMILY_HISTORY_POOL)))]

    # Risk factors
    risk_factors = []
    if random.random() < 0.35:
        k = random.randint(1, 2)
        risk_factors = [{"name": r} for r in random.sample(RISK_FACTORS_POOL, min(k, len(RISK_FACTORS_POOL)))]

    return {
        "conditions": conditions,
        "medications": medications,
        "allergies": allergies,
        "surgeries": surgeries,
        "familyHistory": family_history,
        "riskFactors": risk_factors,
    }


# ---------------------------------------------------------------------------
# Plan loading from database
# ---------------------------------------------------------------------------


def load_plans_from_db() -> list[dict[str, Any]]:
    """Load all plans from PostgreSQL."""
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL not set")
    engine = create_engine(DATABASE_URL)
    with engine.connect() as conn:
        rows = conn.execute(text(
            'SELECT id, "planCode", name, carrier, state, "planType", type, '
            '"monthlyPremium", deductible, "annualDeductible", "maxOutOfPocket", '
            '"coinsuranceRate", "primaryCareCopay", "specialistCopay", "erCopay", '
            '"drugCoverage", "coverageDetails", "eligibility", features '
            "FROM plans"
        )).fetchall()

    plans = []
    for row in rows:
        plans.append({
            "id": row[0],
            "planCode": row[1],
            "name": row[2],
            "carrier": row[3],
            "state": row[4],
            "planType": row[5],
            "type": row[6],
            "monthlyPremium": row[7],
            "deductible": row[8],
            "annualDeductible": row[9],
            "maxOutOfPocket": row[10],
            "coinsuranceRate": row[11],
            "primaryCareCopay": row[12],
            "specialistCopay": row[13],
            "erCopay": row[14],
            "drugCoverage": row[15],
            "coverageDetails": row[16],
            "eligibility": row[17],
            "features": row[18],
        })
    return plans


def load_plans_from_extracted() -> list[dict[str, Any]]:
    """Fallback: load from extracted_plans table if plans table is empty."""
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL not set")
    engine = create_engine(DATABASE_URL)
    with engine.connect() as conn:
        rows = conn.execute(text(
            'SELECT id, "planName", carrier, jurisdiction, "extractedData", "mlFeatures" '
            "FROM extracted_plans"
        )).fetchall()

    plans = []
    for row in rows:
        extracted = row[4] if isinstance(row[4], dict) else json.loads(row[4] or "{}")
        ml = row[5] if isinstance(row[5], dict) else json.loads(row[5] or "{}")
        cost = extracted.get("costStructure", {})
        plans.append({
            "id": row[0],
            "planCode": row[0],
            "name": row[1],
            "carrier": row[2],
            "state": row[3],
            "planType": ml.get("planType", "unknown"),
            "type": ml.get("planType", "private"),
            "monthlyPremium": cost.get("monthlyPremiumEstimate") or 0,
            "deductible": cost.get("deductible") or 0,
            "annualDeductible": cost.get("deductible") or 0,
            "maxOutOfPocket": cost.get("maxOutOfPocket") or 0,
            "coinsuranceRate": cost.get("coinsuranceDefault") or 0,
            "primaryCareCopay": 0,
            "specialistCopay": 0,
            "erCopay": 0,
            "drugCoverage": None,
            "coverageDetails": None,
            "eligibility": extracted.get("eligibility"),
            "features": ml.get("featureVector"),
            "_mlFeatures": ml,
            "_extractedData": extracted,
        })
    return plans


def format_plan_summary(plan: dict[str, Any]) -> str:
    """Format a plan for inclusion in the LLM prompt."""
    coverage = plan.get("coverageDetails") or {}
    if isinstance(coverage, str):
        try:
            coverage = json.loads(coverage)
        except (json.JSONDecodeError, TypeError):
            coverage = {}

    ml = plan.get("_mlFeatures", {})
    covered = []
    for key in ["dental", "vision", "mental", "mentalHealth", "drugs", "prescription",
                "hospital", "emergency", "specialist", "physiotherapy", "maternity"]:
        if coverage.get(key) or ml.get(f"covers{key.title().replace('_', '')}"):
            covered.append(key)

    return (
        f"  - {plan['name']} ({plan['carrier']}, {plan['planType']})\n"
        f"    Province: {plan['state']}, Type: {plan.get('type', 'unknown')}\n"
        f"    Premium: ${plan['monthlyPremium']}/mo, Deductible: ${plan.get('annualDeductible') or plan['deductible']}\n"
        f"    OOP Max: ${plan['maxOutOfPocket']}, Coinsurance: {plan['coinsuranceRate']}%\n"
        f"    Covered: {', '.join(covered) if covered else 'see details'}"
    )


# ---------------------------------------------------------------------------
# LLM scoring
# ---------------------------------------------------------------------------


def call_llm(system: str, prompt: str) -> str:
    """Call Groq-compatible LLM via OpenAI SDK."""
    # Import here to avoid top-level dependency
    from openai import OpenAI

    client = OpenAI(api_key=OPENAI_API_KEY, base_url=OPENAI_BASE_URL)
    completion = client.chat.completions.create(
        model=LLM_MODEL,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ],
        max_tokens=1500,
        temperature=0.1,
    )
    content = completion.choices[0].message.content or ""
    # Strip reasoning blocks (Qwen-style <think> tags)
    content = re.sub(r"<think>[\s\S]*?</think>", "", content, flags=re.IGNORECASE).strip()
    return content


def extract_json(text: str) -> Any:
    """Extract JSON object from LLM response."""
    # Try fenced code block first
    m = re.search(r"```json\s*([\s\S]*?)```", text, re.IGNORECASE)
    if m:
        return json.loads(m.group(1).strip())
    # Try raw JSON
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        return json.loads(text[start : end + 1])
    raise ValueError(f"No JSON found in LLM response: {text[:200]}")


def score_batch(
    users: list[dict[str, Any]],
    plans: list[dict[str, Any]],
) -> list[dict[str, int]]:
    """
    Score a batch of users against all plans.
    Returns list of {plan_id: suitability_class} dicts, one per user.
    """
    plan_descriptions = "\n".join(
        f"Plan {i+1} (ID: {p['id']}):\n{format_plan_summary(p)}"
        for i, p in enumerate(plans)
    )

    user_descriptions = []
    for i, u in enumerate(users):
        profile = u["profile"]
        medical = u["medical"]
        conditions = [c["name"] for c in medical.get("conditions", [])]
        medications = [m["name"] for m in medical.get("medications", [])]
        risk_factors = [r["name"] for r in medical.get("riskFactors", [])]

        user_descriptions.append(
            f"User {i+1}:\n"
            f"  Age: {profile['ageBand']}, Province: {profile['province']}\n"
            f"  Immigration: {profile['immigrationStatus']}, Employment: {profile['employmentStatus']}\n"
            f"  Income: {profile['incomeBand']}, Employer benefits: {profile['hasEmployerBenefits']}\n"
            f"  Dependants: {len(profile.get('dependants', []))}\n"
            f"  Conditions: {', '.join(conditions) or 'none'}\n"
            f"  Medications: {', '.join(medications) or 'none'}\n"
            f"  Risk factors: {', '.join(risk_factors) or 'none'}"
        )

    system = (
        "You are a Canadian healthcare plan matching expert. "
        "Given user profiles and insurance plans, rate how suitable each plan is for each user.\n\n"
        "Score each user-plan pair as:\n"
        "  3 = excellent: ideal match for needs, eligibility, and budget\n"
        "  2 = strong: covers most needs well\n"
        "  1 = moderate: some coverage but notable gaps\n"
        "  0 = poor: wrong eligibility, insufficient coverage, or too expensive\n\n"
        "Consider: provincial eligibility, immigration status restrictions, medical needs, "
        "medication coverage, income constraints, and family situation.\n\n"
        "Return ONLY a JSON object with this exact structure:\n"
        '{"scores": [{"user": 1, "ratings": [{"plan_id": "...", "score": 0-3}, ...]}, ...]}'
    )

    prompt = f"Plans:\n{plan_descriptions}\n\nUsers:\n" + "\n\n".join(user_descriptions)

    for attempt in range(MAX_RETRIES):
        try:
            response = call_llm(system, prompt)
            data = extract_json(response)
            scores = data.get("scores", [])

            # Parse into per-user dicts
            results: list[dict[str, int]] = []
            for user_scores in scores:
                ratings = {}
                for r in user_scores.get("ratings", []):
                    plan_id = str(r.get("plan_id", ""))
                    score = int(r.get("score", 1))
                    score = max(0, min(3, score))
                    ratings[plan_id] = score
                results.append(ratings)

            # Pad if LLM returned fewer users than expected
            while len(results) < len(users):
                results.append({p["id"]: 1 for p in plans})

            return results

        except Exception as e:
            print(f"  [retry {attempt+1}/{MAX_RETRIES}] LLM error: {e}")
            if attempt < MAX_RETRIES - 1:
                time.sleep(RETRY_DELAY * (attempt + 1))

    # Fallback: return moderate scores
    print("  [warn] All retries failed, using default scores")
    return [{p["id"]: 1 for p in plans} for _ in users]


# ---------------------------------------------------------------------------
# Main generation loop
# ---------------------------------------------------------------------------


def generate_training_data(
    target_rows: int = 5000,
    batch_size: int = 10,
    dry_run: bool = False,
) -> Path:
    """Generate synthetic training data and write to CSV."""
    print(f"[config] Target rows: {target_rows}, Batch size: {batch_size}")
    print(f"[config] LLM: {LLM_MODEL} via {OPENAI_BASE_URL}")
    print(f"[config] Output: {OUTPUT_FILE}")

    # Load plans
    plans = load_plans_from_db()
    if not plans:
        print("[info] No plans in 'plans' table, trying extracted_plans...")
        plans = load_plans_from_extracted()
    if not plans:
        raise RuntimeError("No plans found in database. Seed plans first.")

    print(f"[info] Loaded {len(plans)} plans")
    num_plans = len(plans)

    # Calculate how many users we need
    # Each user × each plan = 1 row
    users_needed = max(1, target_rows // num_plans)
    total_rows = users_needed * num_plans
    print(f"[info] Generating {users_needed} users × {num_plans} plans = {total_rows} rows")

    # Generate all user profiles upfront
    print("[step 1/3] Generating synthetic profiles...")
    random.seed(42)  # reproducible
    users = []
    for _ in range(users_needed):
        profile = generate_random_profile()
        medical = generate_random_medical(profile["ageBand"])
        users.append({"profile": profile, "medical": medical})

    if dry_run:
        print(f"[dry-run] Would generate {total_rows} rows. Sample user:")
        print(json.dumps(users[0], indent=2))
        print(f"\nSample plan: {plans[0]['name']} ({plans[0]['carrier']})")
        features = user_to_features(users[0]["profile"], users[0]["medical"])
        print(f"Feature vector shape: {features.shape}")
        print(f"Feature names: {len(FEATURE_NAMES)}")
        return OUTPUT_FILE

    # Score in batches
    print("[step 2/3] Scoring users against plans via LLM...")
    all_scores: list[dict[str, int]] = []
    num_batches = (users_needed + batch_size - 1) // batch_size

    for batch_idx in range(num_batches):
        start = batch_idx * batch_size
        end = min(start + batch_size, users_needed)
        batch = users[start:end]

        print(f"  Batch {batch_idx+1}/{num_batches} (users {start+1}-{end})...", end=" ", flush=True)
        scores = score_batch(batch, plans)
        all_scores.extend(scores)
        print(f"done ({len(scores)} users scored)")

        if batch_idx < num_batches - 1:
            time.sleep(RATE_LIMIT_DELAY)

    # Write CSV
    print("[step 3/3] Writing CSV...")
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    header = FEATURE_NAMES + ["plan_id", "plan_name", "suitability_class", "suitability_label"]
    rows_written = 0

    with open(OUTPUT_FILE, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(header)

        for user_idx, (user, user_scores) in enumerate(zip(users, all_scores)):
            features = user_to_features(user["profile"], user["medical"])

            for plan in plans:
                plan_id = plan["id"]
                score = user_scores.get(plan_id, 1)  # default moderate
                label = CLASSES[score]

                row = list(features) + [plan_id, plan["name"], score, label]
                writer.writerow(row)
                rows_written += 1

    print(f"\n[done] Wrote {rows_written} rows to {OUTPUT_FILE}")

    # Spot check
    spot_check(users, all_scores, plans)

    return OUTPUT_FILE


def spot_check(
    users: list[dict[str, Any]],
    all_scores: list[dict[str, int]],
    plans: list[dict[str, Any]],
    n: int = 20,
) -> None:
    """Print a random sample of rows for manual verification."""
    print(f"\n{'='*70}")
    print(f"SPOT CHECK — {n} random user-plan pairs")
    print(f"{'='*70}")

    indices = random.sample(range(len(users)), min(n, len(users)))
    plan_lookup = {p["id"]: p for p in plans}

    for i in indices:
        user = users[i]
        scores = all_scores[i]
        profile = user["profile"]
        medical = user["medical"]
        conditions = [c["name"] for c in medical.get("conditions", [])]

        # Pick a random plan for this user
        plan_id = random.choice(list(scores.keys())) if scores else plans[0]["id"]
        score = scores.get(plan_id, 1)
        plan = plan_lookup.get(plan_id, {})

        print(
            f"\n  User {i+1}: {profile['ageBand']}, {profile['province']}, "
            f"{profile['immigrationStatus']}, {profile['employmentStatus']}, "
            f"income={profile['incomeBand']}"
        )
        print(f"  Conditions: {', '.join(conditions) or 'none'}")
        print(
            f"  Plan: {plan.get('name', '?')} ({plan.get('carrier', '?')}) "
            f"— ${plan.get('monthlyPremium', '?')}/mo"
        )
        print(f"  Score: {score} ({CLASSES[score]})")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate synthetic training data")
    parser.add_argument("--rows", type=int, default=5000, help="Target number of rows (default: 5000)")
    parser.add_argument("--batch-size", type=int, default=10, help="Users per LLM batch (default: 10)")
    parser.add_argument("--dry-run", action="store_true", help="Generate profiles without calling LLM")
    args = parser.parse_args()

    generate_training_data(
        target_rows=args.rows,
        batch_size=args.batch_size,
        dry_run=args.dry_run,
    )
