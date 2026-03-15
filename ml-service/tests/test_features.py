"""Unit tests for user feature engineering."""

import numpy as np
import pytest

from app.features import (
    FEATURE_NAMES,
    feature_count,
    user_to_features,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

FULL_PROFILE = {
    "province": "ON",
    "immigrationStatus": "citizen",
    "ageBand": "AGE_36_45",
    "employmentStatus": "employed",
    "hasEmployerBenefits": "yes",
    "dependants": [{"relation": "spouse"}, {"relation": "child", "ageBand": "0-5"}],
    "incomeBand": "medium",
    "specialCategory": None,
}

FULL_MEDICAL = {
    "conditions": [
        {"name": "Type 2 diabetes"},
        {"name": "hypertension"},
    ],
    "medications": [
        {"name": "metformin"},
        {"name": "lisinopril"},
        {"name": "Humira"},
    ],
    "allergies": [{"name": "penicillin"}],
    "surgeries": [{"name": "appendectomy"}],
    "familyHistory": [
        {"name": "heart disease"},
        {"name": "cancer"},
    ],
    "riskFactors": [{"name": "smoker"}],
}


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestFeatureShape:
    def test_feature_count_matches_names(self):
        assert feature_count() == len(FEATURE_NAMES)

    def test_output_shape_full_input(self):
        result = user_to_features(FULL_PROFILE, FULL_MEDICAL)
        assert isinstance(result, np.ndarray)
        assert result.shape == (feature_count(),)
        assert result.dtype == np.float64

    def test_output_shape_none_inputs(self):
        result = user_to_features(None, None)
        assert result.shape == (feature_count(),)

    def test_output_shape_empty_dicts(self):
        result = user_to_features({}, {})
        assert result.shape == (feature_count(),)


class TestDemographicFeatures:
    def test_age_band_encoding(self):
        result = user_to_features({"ageBand": "AGE_36_45"}, None)
        assert result[0] == 40.0

    def test_age_band_default(self):
        result = user_to_features({}, None)
        assert result[0] == 30.0  # default midpoint

    def test_income_band(self):
        result = user_to_features({"incomeBand": "low"}, None)
        idx = FEATURE_NAMES.index("income_band")
        assert result[idx] == 0.0

    def test_income_band_prefer_not_defaults_medium(self):
        result = user_to_features({"incomeBand": "prefer_not_to_say"}, None)
        idx = FEATURE_NAMES.index("income_band")
        assert result[idx] == 1.0

    def test_num_dependents(self):
        result = user_to_features(FULL_PROFILE, None)
        idx = FEATURE_NAMES.index("num_dependents")
        assert result[idx] == 2.0

    def test_num_dependents_none(self):
        result = user_to_features({"dependants": None}, None)
        idx = FEATURE_NAMES.index("num_dependents")
        assert result[idx] == 0.0

    def test_dependants_old_dict_format(self):
        """Old-style { spouse: true, children: 2 } should count as 1 entry."""
        result = user_to_features(
            {"dependants": {"spouse": True, "children": 2}}, None
        )
        idx = FEATURE_NAMES.index("num_dependents")
        assert result[idx] == 1.0


class TestOneHotEncodings:
    def test_employment_one_hot(self):
        result = user_to_features({"employmentStatus": "employed"}, None)
        emp_start = FEATURE_NAMES.index("employment_student")
        emp_slice = result[emp_start : emp_start + 5]
        # student=0, employed=1, self_employed=0, unemployed=0, retiree=0
        np.testing.assert_array_equal(emp_slice, [0, 1, 0, 0, 0])

    def test_employment_unknown_all_zeros(self):
        result = user_to_features({"employmentStatus": "nonsense"}, None)
        emp_start = FEATURE_NAMES.index("employment_student")
        emp_slice = result[emp_start : emp_start + 5]
        np.testing.assert_array_equal(emp_slice, [0, 0, 0, 0, 0])

    def test_immigration_one_hot(self):
        result = user_to_features({"immigrationStatus": "refugee"}, None)
        imm_start = FEATURE_NAMES.index("immigration_citizen")
        imm_slice = result[imm_start : imm_start + 8]
        expected = [0, 0, 0, 0, 1, 0, 0, 0]  # refugee is index 4
        np.testing.assert_array_equal(imm_slice, expected)

    def test_province_one_hot(self):
        result = user_to_features({"province": "ON"}, None)
        prov_start = FEATURE_NAMES.index("province_AB")
        prov_slice = result[prov_start : prov_start + 13]
        # ON is index 8 in PROVINCES
        expected = [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0]
        np.testing.assert_array_equal(prov_slice, expected)

    def test_province_case_insensitive(self):
        result = user_to_features({"province": "bc"}, None)
        idx = FEATURE_NAMES.index("province_BC")
        assert result[idx] == 1.0

    def test_has_employer_benefits(self):
        result = user_to_features({"hasEmployerBenefits": "yes"}, None)
        idx = FEATURE_NAMES.index("has_employer_benefits")
        assert result[idx] == 1.0

    def test_no_employer_benefits(self):
        result = user_to_features({"hasEmployerBenefits": "no"}, None)
        idx = FEATURE_NAMES.index("has_employer_benefits")
        assert result[idx] == 0.0


class TestMedicalFeatures:
    def test_num_conditions(self):
        result = user_to_features(None, FULL_MEDICAL)
        idx = FEATURE_NAMES.index("num_conditions")
        assert result[idx] == 2.0

    def test_condition_severity_high(self):
        medical = {"conditions": [{"name": "cancer"}]}
        result = user_to_features(None, medical)
        idx = FEATURE_NAMES.index("condition_severity_max")
        assert result[idx] == 3.0

    def test_condition_severity_moderate(self):
        medical = {"conditions": [{"name": "asthma"}]}
        result = user_to_features(None, medical)
        idx = FEATURE_NAMES.index("condition_severity_max")
        assert result[idx] == 2.0

    def test_condition_severity_mild(self):
        medical = {"conditions": [{"name": "eczema"}]}
        result = user_to_features(None, medical)
        idx = FEATURE_NAMES.index("condition_severity_max")
        assert result[idx] == 1.0

    def test_condition_severity_none(self):
        result = user_to_features(None, {"conditions": []})
        idx = FEATURE_NAMES.index("condition_severity_max")
        assert result[idx] == 0.0

    def test_num_medications(self):
        result = user_to_features(None, FULL_MEDICAL)
        idx = FEATURE_NAMES.index("num_medications")
        assert result[idx] == 3.0

    def test_has_specialty_drugs_true(self):
        result = user_to_features(None, FULL_MEDICAL)  # has Humira
        idx = FEATURE_NAMES.index("has_specialty_drugs")
        assert result[idx] == 1.0

    def test_has_specialty_drugs_false(self):
        medical = {"medications": [{"name": "metformin"}]}
        result = user_to_features(None, medical)
        idx = FEATURE_NAMES.index("has_specialty_drugs")
        assert result[idx] == 0.0

    def test_surgical_history_count(self):
        result = user_to_features(None, FULL_MEDICAL)
        idx = FEATURE_NAMES.index("surgical_history_count")
        assert result[idx] == 1.0

    def test_allergy_count(self):
        result = user_to_features(None, FULL_MEDICAL)
        idx = FEATURE_NAMES.index("allergy_count")
        assert result[idx] == 1.0

    def test_string_conditions(self):
        """Conditions can be plain strings instead of dicts."""
        medical = {"conditions": ["diabetes", "asthma"]}
        result = user_to_features(None, medical)
        idx = FEATURE_NAMES.index("num_conditions")
        assert result[idx] == 2.0
        sev_idx = FEATURE_NAMES.index("condition_severity_max")
        assert result[sev_idx] == 2.0  # diabetes is moderate


class TestRiskScores:
    def test_risk_score_healthy(self):
        result = user_to_features(None, None)
        idx = FEATURE_NAMES.index("risk_score")
        assert result[idx] == 0.0

    def test_risk_score_complex(self):
        result = user_to_features(None, FULL_MEDICAL)
        idx = FEATURE_NAMES.index("risk_score")
        # 2 conditions (1.6) + 3 meds (0.5) + 1 risk factor (0.5)
        # + specialty drug Humira (1.0) = 3.6
        assert result[idx] == pytest.approx(3.6, abs=0.01)

    def test_risk_score_capped_at_10(self):
        medical = {
            "conditions": [
                {"name": "cancer"}, {"name": "heart failure"},
                {"name": "COPD"}, {"name": "diabetes"},
                {"name": "stroke"}, {"name": "CKD"},
            ],
            "medications": [
                {"name": "med1"}, {"name": "med2"}, {"name": "med3"},
                {"name": "med4"}, {"name": "Humira"},
            ],
            "riskFactors": [
                {"name": "smoker"}, {"name": "obese"},
                {"name": "sedentary"}, {"name": "heavy drinker"},
                {"name": "family history"},
            ],
        }
        result = user_to_features(None, medical)
        idx = FEATURE_NAMES.index("risk_score")
        assert result[idx] <= 10.0

    def test_family_risk_score(self):
        result = user_to_features(None, FULL_MEDICAL)
        idx = FEATURE_NAMES.index("family_risk_score")
        # heart disease (1.0) + cancer (1.0) = 2.0
        assert result[idx] == 2.0

    def test_family_risk_score_capped(self):
        medical = {
            "familyHistory": [
                {"name": "cancer"}, {"name": "heart disease"},
                {"name": "diabetes"}, {"name": "stroke"},
                {"name": "hypertension"}, {"name": "alzheimer"},
            ],
        }
        result = user_to_features(None, medical)
        idx = FEATURE_NAMES.index("family_risk_score")
        assert result[idx] == 5.0

    def test_family_risk_unknown_items(self):
        medical = {"familyHistory": [{"name": "something rare"}]}
        result = user_to_features(None, medical)
        idx = FEATURE_NAMES.index("family_risk_score")
        assert result[idx] == pytest.approx(0.3)


class TestFullProfile:
    def test_full_profile_values(self):
        result = user_to_features(FULL_PROFILE, FULL_MEDICAL)

        assert result[FEATURE_NAMES.index("age_band")] == 40.0
        assert result[FEATURE_NAMES.index("num_conditions")] == 2.0
        assert result[FEATURE_NAMES.index("num_medications")] == 3.0
        assert result[FEATURE_NAMES.index("has_specialty_drugs")] == 1.0
        assert result[FEATURE_NAMES.index("num_dependents")] == 2.0
        assert result[FEATURE_NAMES.index("income_band")] == 1.0
        assert result[FEATURE_NAMES.index("employment_employed")] == 1.0
        assert result[FEATURE_NAMES.index("has_employer_benefits")] == 1.0
        assert result[FEATURE_NAMES.index("immigration_citizen")] == 1.0
        assert result[FEATURE_NAMES.index("province_ON")] == 1.0
        assert result[FEATURE_NAMES.index("surgical_history_count")] == 1.0
        assert result[FEATURE_NAMES.index("allergy_count")] == 1.0

    def test_no_nans(self):
        result = user_to_features(FULL_PROFILE, FULL_MEDICAL)
        assert not np.any(np.isnan(result))

    def test_no_nans_empty_input(self):
        result = user_to_features(None, None)
        assert not np.any(np.isnan(result))
