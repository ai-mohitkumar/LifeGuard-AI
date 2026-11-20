/**
 * Complete 8 trained production model metadata records for LifeGuard AI ML Governance.
 */
export const DEFAULT_MODELS_REGISTRY = [
  {
    "module": "aqi",
    "sub_model": "regressor",
    "model_name": "Random Forest Regressor",
    "version": "1.0.0",
    "dataset": {
      "source_file": "daily_air_quality.csv",
      "consecutive_day_pairs": 17441,
      "stations": 12,
      "date_range": "2013-03-01 -> 2017-02-27"
    },
    "splits": {
      "split_method": "strict_chronological_by_date",
      "train_val_rows": 13947,
      "train_val_dates": "2013-03-01 -> 2016-05-11",
      "test_rows": 3494,
      "test_dates": "2016-05-12 -> 2017-02-27"
    },
    "thresholds": {
      "uncertainty_band_mae": 69.13
    },
    "metrics": {
      "mae": 69.13,
      "rmse": 88.7,
      "r2": 0.3657
    },
    "comparison_table": [
      {
        "model": "Baseline: Persistence (t+1 = t)",
        "cv_mae_mean": 72.7,
        "cv_mae_std": 11.53,
        "cv_rmse_mean": 103.47,
        "cv_rmse_std": 14.78,
        "cv_r2_mean": 0.0321,
        "cv_r2_std": 0.1589
      },
      {
        "model": "Ridge Regression (Baseline)",
        "cv_mae_mean": 72.96,
        "cv_mae_std": 7.82,
        "cv_rmse_mean": 87.68,
        "cv_rmse_std": 10.0,
        "cv_r2_mean": 0.3063,
        "cv_r2_std": 0.065
      },
      {
        "model": "Random Forest Regressor",
        "cv_mae_mean": 69.69,
        "cv_mae_std": 4.13,
        "cv_rmse_mean": 85.79,
        "cv_rmse_std": 6.56,
        "cv_r2_mean": 0.3284,
        "cv_r2_std": 0.0896
      },
      {
        "model": "XGBoost Regressor",
        "cv_mae_mean": 70.28,
        "cv_mae_std": 4.61,
        "cv_rmse_mean": 86.38,
        "cv_rmse_std": 6.85,
        "cv_r2_mean": 0.3184,
        "cv_r2_std": 0.0989
      },
      {
        "model": "LightGBM Regressor",
        "cv_mae_mean": 70.09,
        "cv_mae_std": 4.46,
        "cv_rmse_mean": 87.12,
        "cv_rmse_std": 6.7,
        "cv_r2_mean": 0.305,
        "cv_r2_std": 0.1127
      }
    ],
    "error_analysis": {
      "seasonal_mae": {
        "winter_haze_months_nov_feb": {
          "count": 1428,
          "mae": 76.14
        },
        "non_winter_months": {
          "count": 2066,
          "mae": 64.28
        }
      },
      "median_abs_error": 56.13,
      "worst_spikes_sample": [
        {
          "station": "Gucheng",
          "date": "2017-01-27",
          "today_aqi": 129.6,
          "actual_next_aqi": 447.6,
          "predicted_next_aqi": 95.2,
          "abs_error": 352.4
        },
        {
          "station": "Wanshouxigong",
          "date": "2017-01-27",
          "today_aqi": 147.9,
          "actual_next_aqi": 464.7,
          "predicted_next_aqi": 113.6,
          "abs_error": 351.1
        },
        {
          "station": "Dongsi",
          "date": "2017-01-27",
          "today_aqi": 116.1,
          "actual_next_aqi": 449.5,
          "predicted_next_aqi": 113.2,
          "abs_error": 336.3
        },
        {
          "station": "Nongzhanguan",
          "date": "2017-01-27",
          "today_aqi": 107.6,
          "actual_next_aqi": 447.8,
          "predicted_next_aqi": 116.4,
          "abs_error": 331.4
        },
        {
          "station": "Tiantan",
          "date": "2017-01-27",
          "today_aqi": 98.4,
          "actual_next_aqi": 439.6,
          "predicted_next_aqi": 120.0,
          "abs_error": 319.5
        }
      ]
    },
    "limitations": [
      "Trained on 2013\u20132017 Beijing 12-station daily records; city-specific emission profiles and future policy changes cause distribution drift over years.",
      "Sudden synoptic pollution episodes (fireworks, sandstorms, abrupt stagnation inversions) produce larger residuals in winter haze months.",
      "Forecast relies on today's pollutant and weather conditions rather than external numerical weather prediction (NWP) tomorrow-wind forecasts."
    ],
    "artifact_path": "ml/aqi/artifacts/aqi_regressor_bundle.joblib",
    "trained_at": "2026-11-11T17:23:26.427127+00:00",
    "id": 1
  },
  {
    "module": "aqi",
    "sub_model": "classifier",
    "model_name": "Random Forest Classifier",
    "version": "1.0.0",
    "dataset": {
      "source_file": "daily_air_quality.csv",
      "consecutive_day_pairs": 17441,
      "stations": 12,
      "date_range": "2013-03-01 -> 2017-02-27"
    },
    "splits": {
      "split_method": "strict_chronological_by_date",
      "train_val_rows": 13947,
      "train_val_dates": "2013-03-01 -> 2016-05-11",
      "test_rows": 3494,
      "test_dates": "2016-05-12 -> 2017-02-27"
    },
    "thresholds": {
      "unhealthy_alert_min": 0.25
    },
    "metrics": {
      "macro_f1": 0.3472,
      "weighted_f1": 0.4443,
      "accuracy": 0.4662,
      "adjacent_1_accuracy": 0.7533,
      "unhealthy_recall": 0.9603,
      "unhealthy_pr_auc": 0.7388
    },
    "comparison_table": [
      {
        "model": "Baseline: Persistence Category",
        "cv_macro_f1_mean": 0.3509,
        "cv_macro_f1_std": 0.0518,
        "cv_weighted_f1_mean": 0.4576,
        "cv_accuracy_mean": 0.4575,
        "cv_adjacent_acc_mean": 0.791,
        "cv_unhealthy_recall_mean": 0.6776
      },
      {
        "model": "Logistic Regression (Balanced)",
        "cv_macro_f1_mean": 0.2945,
        "cv_macro_f1_std": 0.0367,
        "cv_weighted_f1_mean": 0.3985,
        "cv_accuracy_mean": 0.3909,
        "cv_adjacent_acc_mean": 0.7658,
        "cv_unhealthy_recall_mean": 0.7216
      },
      {
        "model": "Logistic Regression (SMOTE)",
        "cv_macro_f1_mean": 0.2966,
        "cv_macro_f1_std": 0.0386,
        "cv_weighted_f1_mean": 0.4003,
        "cv_accuracy_mean": 0.3928,
        "cv_adjacent_acc_mean": 0.768,
        "cv_unhealthy_recall_mean": 0.7158
      },
      {
        "model": "Random Forest Classifier",
        "cv_macro_f1_mean": 0.3516,
        "cv_macro_f1_std": 0.0311,
        "cv_weighted_f1_mean": 0.4818,
        "cv_accuracy_mean": 0.5055,
        "cv_adjacent_acc_mean": 0.7933,
        "cv_unhealthy_recall_mean": 0.7596
      },
      {
        "model": "XGBoost Classifier",
        "cv_macro_f1_mean": 0.3206,
        "cv_macro_f1_std": 0.0171,
        "cv_weighted_f1_mean": 0.4729,
        "cv_accuracy_mean": 0.5014,
        "cv_adjacent_acc_mean": 0.7852,
        "cv_unhealthy_recall_mean": 0.7252
      },
      {
        "model": "LightGBM Classifier",
        "cv_macro_f1_mean": 0.3358,
        "cv_macro_f1_std": 0.0309,
        "cv_weighted_f1_mean": 0.4704,
        "cv_accuracy_mean": 0.4786,
        "cv_adjacent_acc_mean": 0.7854,
        "cv_unhealthy_recall_mean": 0.715
      }
    ],
    "error_analysis": {
      "per_class_f1": {
        "Good": 0.0,
        "Satisfactory": 0.5907,
        "Moderate": 0.3047,
        "Poor": 0.2296,
        "Very Poor": 0.5503,
        "Severe": 0.4078
      },
      "adjacent_1_accuracy": 0.7533,
      "note": "Rare extremes (Good=41 test rows) have lower F1 due to boundary transitions near AQI 50, while adjacent-1 category accuracy remains high."
    },
    "limitations": [
      "6-class CPCB category distribution is imbalanced (Good < 1% of station-days in industrial/urban Beijing), reducing exact Good vs Satisfactory boundary F1.",
      "Boundary discretization around fixed AQI cutoffs (50, 100, 200, 300, 400) causes minor 1-tier label shifts; numeric AQI prediction should always be inspected alongside category.",
      "Chronological generalization tested on May 2016\u2013Feb 2017 future window; multi-year air-policy changes require periodic retraining."
    ],
    "artifact_path": "ml/aqi/artifacts/aqi_classifier_bundle.joblib",
    "trained_at": "2026-11-11T17:23:51.302362+00:00",
    "id": 2
  },
  {
    "module": "health",
    "sub_model": "diabetes",
    "model_name": "Logistic Regression (SMOTE + Sigmoid Calibrated)",
    "version": "1.0.0",
    "disclaimer": "Awareness and educational screening only \u2014 NOT a medical diagnosis, clinical decision, or substitute for professional medical advice. Consult a qualified healthcare professional for testing and diagnosis.",
    "dataset": {
      "source_file": "diabetes.csv",
      "rows": 768,
      "positive_rate": 0.349,
      "biological_zeros_treated_as_nan": {
        "Glucose": 5,
        "BloodPressure": 35,
        "SkinThickness": 227,
        "Insulin": 374,
        "BMI": 11
      }
    },
    "splits": {
      "train_val_rows": 614,
      "test_rows": 154,
      "test_positive_rate": 0.3506
    },
    "thresholds": {
      "moderate_risk_min": 0.154,
      "elevated_risk_min": 0.28
    },
    "metrics": {
      "recall": 0.8148,
      "precision": 0.5641,
      "f1": 0.6667,
      "roc_auc": 0.8174,
      "brier_score": 0.1698,
      "test_at_0_50": {
        "recall": 0.537,
        "precision": 0.617,
        "f1": 0.5743,
        "roc_auc": 0.8174,
        "brier_score": 0.1698
      },
      "test_at_tuned_elevated": {
        "recall": 0.8148,
        "precision": 0.5641,
        "f1": 0.6667,
        "roc_auc": 0.8174,
        "brier_score": 0.1698
      },
      "test_alert_recall_including_moderate": 0.963,
      "calibration_curve_cv_oof": {
        "n_bins": 8,
        "mean_predicted_prob": [
          0.0768,
          0.1783,
          0.3127,
          0.4396,
          0.5703,
          0.6916,
          0.8106,
          0.9164
        ],
        "fraction_of_positives": [
          0.0462,
          0.1892,
          0.2881,
          0.4407,
          0.5952,
          0.7255,
          0.9149,
          0.7895
        ]
      },
      "calibration_curve_test": {
        "n_bins": 6,
        "mean_predicted_prob": [
          0.0912,
          0.2521,
          0.4058,
          0.5872,
          0.762,
          0.89
        ],
        "fraction_of_positives": [
          0.0364,
          0.3636,
          0.5789,
          0.4118,
          0.7368,
          0.7273
        ]
      }
    },
    "comparison_table": [
      {
        "model": "Baseline: Dummy (Prior)",
        "cv_recall_mean": 0.0,
        "cv_recall_std": 0.0,
        "cv_roc_auc_mean": 0.5,
        "cv_roc_auc_std": 0.0,
        "cv_f1_mean": 0.0,
        "cv_brier_mean": 0.2271,
        "cv_brier_std": 0.0006
      },
      {
        "model": "Logistic Regression (SMOTE, Uncalibrated)",
        "cv_recall_mean": 0.7152,
        "cv_recall_std": 0.0507,
        "cv_roc_auc_mean": 0.839,
        "cv_roc_auc_std": 0.0232,
        "cv_f1_mean": 0.6856,
        "cv_brier_mean": 0.161,
        "cv_brier_std": 0.0145
      },
      {
        "model": "Logistic Regression (SMOTE + Sigmoid Calibrated)",
        "cv_recall_mean": 0.5607,
        "cv_recall_std": 0.0184,
        "cv_roc_auc_mean": 0.8379,
        "cv_roc_auc_std": 0.0237,
        "cv_f1_mean": 0.6439,
        "cv_brier_mean": 0.1525,
        "cv_brier_std": 0.0094
      },
      {
        "model": "Random Forest (SMOTE + Sigmoid Calibrated)",
        "cv_recall_mean": 0.6123,
        "cv_recall_std": 0.0552,
        "cv_roc_auc_mean": 0.8332,
        "cv_roc_auc_std": 0.0207,
        "cv_f1_mean": 0.6465,
        "cv_brier_mean": 0.157,
        "cv_brier_std": 0.0081
      },
      {
        "model": "XGBoost (SMOTE + Sigmoid Calibrated)",
        "cv_recall_mean": 0.5936,
        "cv_recall_std": 0.0364,
        "cv_roc_auc_mean": 0.8291,
        "cv_roc_auc_std": 0.0207,
        "cv_f1_mean": 0.634,
        "cv_brier_mean": 0.1606,
        "cv_brier_std": 0.007
      }
    ],
    "error_analysis": {
      "confusion_matrix_at_t_high": {
        "tn": 66,
        "fp": 34,
        "fn": 10,
        "tp": 44
      },
      "missed_positives_even_below_moderate_band": 2,
      "false_negatives_sample": [
        {
          "Pregnancies": 7.0,
          "Glucose": 114.0,
          "BloodPressure": 64.0,
          "SkinThickness": 0.0,
          "Insulin": 0.0,
          "BMI": 27.4,
          "DiabetesPedigreeFunction": 0.732,
          "Age": 34.0,
          "risk_prob": 0.2651
        },
        {
          "Pregnancies": 3.0,
          "Glucose": 121.0,
          "BloodPressure": 52.0,
          "SkinThickness": 0.0,
          "Insulin": 0.0,
          "BMI": 36.0,
          "DiabetesPedigreeFunction": 0.127,
          "Age": 25.0,
          "risk_prob": 0.2796
        },
        {
          "Pregnancies": 7.0,
          "Glucose": 107.0,
          "BloodPressure": 74.0,
          "SkinThickness": 0.0,
          "Insulin": 0.0,
          "BMI": 29.6,
          "DiabetesPedigreeFunction": 0.254,
          "Age": 31.0,
          "risk_prob": 0.1847
        }
      ],
      "false_positives_sample": [
        {
          "Pregnancies": 7.0,
          "Glucose": 159.0,
          "BloodPressure": 64.0,
          "SkinThickness": 0.0,
          "Insulin": 0.0,
          "BMI": 27.4,
          "DiabetesPedigreeFunction": 0.294,
          "Age": 40.0,
          "risk_prob": 0.5728
        },
        {
          "Pregnancies": 2.0,
          "Glucose": 122.0,
          "BloodPressure": 76.0,
          "SkinThickness": 27.0,
          "Insulin": 200.0,
          "BMI": 35.9,
          "DiabetesPedigreeFunction": 0.483,
          "Age": 26.0,
          "risk_prob": 0.2848
        },
        {
          "Pregnancies": 0.0,
          "Glucose": 165.0,
          "BloodPressure": 76.0,
          "SkinThickness": 43.0,
          "Insulin": 255.0,
          "BMI": 47.9,
          "DiabetesPedigreeFunction": 0.259,
          "Age": 26.0,
          "risk_prob": 0.7828
        }
      ]
    },
    "limitations": [
      "Trained on the Pima Indians Diabetes cohort (768 female patients aged >= 21); population prevalence and demographics may not generalize uniformly.",
      "High missingness in Serum Insulin (48.7%) and Triceps Skin Thickness (29.6%), recorded as 0 in raw data, requires median imputation inside the pipeline.",
      "This risk probability supports preventive health awareness only \u2014 fasting lab confirmation (HbA1c / OGTT) by a doctor is essential."
    ],
    "artifact_path": "ml/health/artifacts/diabetes_health_bundle.joblib",
    "trained_at": "2026-11-11T17:11:17.660130+00:00",
    "id": 3
  },
  {
    "module": "health",
    "sub_model": "heart",
    "model_name": "Logistic Regression (SMOTE + Sigmoid Calibrated)",
    "version": "1.0.0",
    "disclaimer": "Awareness and educational screening only \u2014 NOT a medical diagnosis, clinical decision, or substitute for professional medical advice. Consult a qualified healthcare professional for testing and diagnosis.",
    "dataset": {
      "source_file": "heart_cleveland.csv",
      "rows": 303,
      "positive_rate": 0.4587,
      "missing_values_imputed_in_pipeline": {
        "ca": 4,
        "thal": 2
      }
    },
    "splits": {
      "train_val_rows": 242,
      "test_rows": 61,
      "test_positive_rate": 0.459
    },
    "thresholds": {
      "moderate_risk_min": 0.154,
      "elevated_risk_min": 0.28
    },
    "metrics": {
      "recall": 1.0,
      "precision": 0.6829,
      "f1": 0.8116,
      "roc_auc": 0.9481,
      "brier_score": 0.0986,
      "test_at_0_50": {
        "recall": 0.9286,
        "precision": 0.8125,
        "f1": 0.8667,
        "roc_auc": 0.9481,
        "brier_score": 0.0986
      },
      "test_at_tuned_elevated": {
        "recall": 1.0,
        "precision": 0.6829,
        "f1": 0.8116,
        "roc_auc": 0.9481,
        "brier_score": 0.0986
      },
      "test_alert_recall_including_moderate": 1.0,
      "calibration_curve_cv_oof": {
        "n_bins": 8,
        "mean_predicted_prob": [
          0.0815,
          0.1819,
          0.3096,
          0.4264,
          0.5681,
          0.6765,
          0.8095,
          0.9324
        ],
        "fraction_of_positives": [
          0.0278,
          0.1042,
          0.3125,
          0.3448,
          0.8462,
          0.7619,
          0.8966,
          0.9412
        ]
      },
      "calibration_curve_test": {
        "n_bins": 6,
        "mean_predicted_prob": [
          0.0729,
          0.2533,
          0.4072,
          0.5759,
          0.7261,
          0.9262
        ],
        "fraction_of_positives": [
          0.0,
          0.0909,
          0.2,
          0.2,
          0.8889,
          0.9444
        ]
      }
    },
    "comparison_table": [
      {
        "model": "Baseline: Dummy (Prior)",
        "cv_recall_mean": 0.0,
        "cv_recall_std": 0.0,
        "cv_roc_auc_mean": 0.5,
        "cv_roc_auc_std": 0.0,
        "cv_f1_mean": 0.0,
        "cv_brier_mean": 0.2483,
        "cv_brier_std": 0.0005
      },
      {
        "model": "Logistic Regression (SMOTE, Uncalibrated)",
        "cv_recall_mean": 0.819,
        "cv_recall_std": 0.0512,
        "cv_roc_auc_mean": 0.9076,
        "cv_roc_auc_std": 0.0144,
        "cv_f1_mean": 0.8344,
        "cv_brier_mean": 0.12,
        "cv_brier_std": 0.0109
      },
      {
        "model": "Logistic Regression (SMOTE + Sigmoid Calibrated)",
        "cv_recall_mean": 0.7656,
        "cv_recall_std": 0.0451,
        "cv_roc_auc_mean": 0.908,
        "cv_roc_auc_std": 0.0155,
        "cv_f1_mean": 0.8177,
        "cv_brier_mean": 0.1258,
        "cv_brier_std": 0.0067
      },
      {
        "model": "Random Forest (SMOTE + Sigmoid Calibrated)",
        "cv_recall_mean": 0.7644,
        "cv_recall_std": 0.0982,
        "cv_roc_auc_mean": 0.9016,
        "cv_roc_auc_std": 0.0251,
        "cv_f1_mean": 0.7875,
        "cv_brier_mean": 0.129,
        "cv_brier_std": 0.0131
      },
      {
        "model": "XGBoost (SMOTE + Sigmoid Calibrated)",
        "cv_recall_mean": 0.7739,
        "cv_recall_std": 0.0775,
        "cv_roc_auc_mean": 0.8831,
        "cv_roc_auc_std": 0.024,
        "cv_f1_mean": 0.7836,
        "cv_brier_mean": 0.1401,
        "cv_brier_std": 0.0128
      }
    ],
    "error_analysis": {
      "confusion_matrix_at_t_high": {
        "tn": 20,
        "fp": 13,
        "fn": 0,
        "tp": 28
      },
      "missed_positives_even_below_moderate_band": 0,
      "false_negatives_sample": [],
      "false_positives_sample": [
        {
          "age": 66.0,
          "sex": 1.0,
          "cp": 4.0,
          "trestbps": 160.0,
          "chol": 228.0,
          "fbs": 0.0,
          "restecg": 2.0,
          "thalach": 138.0,
          "exang": 0.0,
          "oldpeak": 2.3,
          "slope": 1.0,
          "ca": 0.0,
          "thal": 6.0,
          "risk_prob": 0.5385
        },
        {
          "age": 54.0,
          "sex": 1.0,
          "cp": 3.0,
          "trestbps": 150.0,
          "chol": 232.0,
          "fbs": 0.0,
          "restecg": 2.0,
          "thalach": 165.0,
          "exang": 0.0,
          "oldpeak": 1.6,
          "slope": 1.0,
          "ca": 0.0,
          "thal": 7.0,
          "risk_prob": 0.3697
        },
        {
          "age": 45.0,
          "sex": 0.0,
          "cp": 4.0,
          "trestbps": 138.0,
          "chol": 236.0,
          "fbs": 0.0,
          "restecg": 2.0,
          "thalach": 152.0,
          "exang": 1.0,
          "oldpeak": 0.2,
          "slope": 2.0,
          "ca": 0.0,
          "thal": 3.0,
          "risk_prob": 0.3716
        }
      ]
    },
    "limitations": [
      "UCI Cleveland Heart Disease dataset contains 303 clinical records from diagnostic referrals (45.9% disease prevalence), higher than the general population.",
      "Includes hospital-derived indicators such as exercise ST depression (`oldpeak`), fluoroscopy vessels (`ca`), and thallium scan (`thal`) not available in routine home checkups.",
      "Output reflects calibrated statistical correlation in the cohort \u2014 awareness only, never a clinical cardiac clearance or diagnosis."
    ],
    "artifact_path": "ml/health/artifacts/heart_health_bundle.joblib",
    "trained_at": "2026-11-11T17:11:27.761114+00:00",
    "id": 4
  },
  {
    "module": "price",
    "sub_model": "car",
    "model_name": "XGBoost Regressor",
    "version": "1.0.0",
    "dataset": {
      "source_file": "car_details.csv",
      "raw_rows": 4340,
      "deduplicated_rows": 3577,
      "duplicates_removed": 763,
      "median_price_inr": 350000.0
    },
    "splits": {
      "train_val_rows": 2861,
      "test_rows": 716
    },
    "thresholds": {
      "uncertainty_band_mae_inr": 88865.07
    },
    "metrics": {
      "mae": 88865.07,
      "rmse": 162507.01,
      "r2": 0.8654
    },
    "comparison_table": [
      {
        "model": "Baseline: Dummy (Median)",
        "cv_mae_mean": 276849.37,
        "cv_mae_std": 12380.54,
        "cv_rmse_mean": 532999.31,
        "cv_rmse_std": 82698.8,
        "cv_r2_mean": -0.0599,
        "cv_r2_std": 0.0088
      },
      {
        "model": "Ridge Regression (Baseline)",
        "cv_mae_mean": 150908.58,
        "cv_mae_std": 11700.45,
        "cv_rmse_mean": 306769.76,
        "cv_rmse_std": 85170.86,
        "cv_r2_mean": 0.6564,
        "cv_r2_std": 0.0782
      },
      {
        "model": "Random Forest Regressor",
        "cv_mae_mean": 123439.33,
        "cv_mae_std": 12862.78,
        "cv_rmse_mean": 275725.77,
        "cv_rmse_std": 92439.0,
        "cv_r2_mean": 0.7219,
        "cv_r2_std": 0.0972
      },
      {
        "model": "XGBoost Regressor",
        "cv_mae_mean": 108062.33,
        "cv_mae_std": 11921.05,
        "cv_rmse_mean": 248750.52,
        "cv_rmse_std": 87329.12,
        "cv_r2_mean": 0.7743,
        "cv_r2_std": 0.0848
      },
      {
        "model": "LightGBM Regressor",
        "cv_mae_mean": 139701.9,
        "cv_mae_std": 11913.9,
        "cv_rmse_mean": 301551.1,
        "cv_rmse_std": 80962.57,
        "cv_r2_mean": 0.667,
        "cv_r2_std": 0.0725
      }
    ],
    "error_analysis": {
      "tier_mae": [
        {
          "tier": "Budget",
          "count": 251,
          "mae_inr": 45088.22
        },
        {
          "tier": "Mid-range",
          "count": 238,
          "mae_inr": 65622.54
        },
        {
          "tier": "Premium",
          "count": 227,
          "mae_inr": 161639.13
        }
      ],
      "median_abs_error_inr": 51444.31,
      "worst_residuals_sample": [
        {
          "name": "Volvo XC 90 D5 Inscription BSIV",
          "year": 2017,
          "actual_inr": 4500000.0,
          "predicted_inr": 2489898.75,
          "error_inr": -2010101.25
        },
        {
          "name": "BMW 3 Series 320d Luxury Line",
          "year": 2016,
          "actual_inr": 2150000.0,
          "predicted_inr": 3467114.5,
          "error_inr": 1317114.5
        },
        {
          "name": "BMW 3 Series 320d Luxury Line",
          "year": 2015,
          "actual_inr": 2200000.0,
          "predicted_inr": 3454798.5,
          "error_inr": 1254798.5
        },
        {
          "name": "Hyundai Tucson 2.0 e-VGT 2WD AT GL",
          "year": 2018,
          "actual_inr": 1600000.0,
          "predicted_inr": 2407052.5,
          "error_inr": 807052.5
        },
        {
          "name": "Volkswagen Jetta 1.9 TDI Trendline",
          "year": 2009,
          "actual_inr": 940000.0,
          "predicted_inr": 234543.12,
          "error_inr": -705456.88
        }
      ]
    },
    "limitations": [
      "Trained on 2020-snapshot CarDekho listings (INR); post-2020 inflation and newer model trims are not reflected.",
      "Only brand and primary model token are extracted from vehicle name; subtle trim/variant differences (e.g. VXI vs ZXI+) and accident/service history are unobserved.",
      "Luxury cars (> Rs 25 Lakh) have fewer samples, resulting in wider absolute MAE in the premium bracket."
    ],
    "ui_options": {
      "fuels": [
        "CNG",
        "Diesel",
        "Electric",
        "LPG",
        "Petrol"
      ],
      "seller_types": [
        "Dealer",
        "Individual",
        "Trustmark Dealer"
      ],
      "transmissions": [
        "Automatic",
        "Manual"
      ],
      "owners": [
        "First Owner",
        "Fourth & Above Owner",
        "Second Owner",
        "Test Drive Car",
        "Third Owner"
      ],
      "year_min": 1992,
      "year_max": 2020,
      "sample_names": [
        "Maruti Swift Dzire VDI",
        "Maruti Alto 800 LXI",
        "Maruti Alto LXi",
        "Maruti Alto LX",
        "Maruti Swift VDI BSIV",
        "Hyundai EON Era Plus",
        "Maruti Wagon R VXI BS IV",
        "Maruti Swift VDI",
        "Maruti Wagon R LXI Minor",
        "Hyundai Santro Xing GLS",
        "Maruti Alto K10 VXI",
        "Maruti 800 AC"
      ]
    },
    "artifact_path": "ml/price/artifacts/car_price_bundle.joblib",
    "trained_at": "2026-11-11T17:00:28.650029+00:00",
    "id": 5
  },
  {
    "module": "price",
    "sub_model": "bike",
    "model_name": "XGBoost Regressor",
    "version": "1.0.0",
    "dataset": {
      "source_file": "bike_details.csv",
      "raw_rows": 1061,
      "deduplicated_rows": 1055,
      "duplicates_removed": 6,
      "median_price_inr": 45000.0,
      "ex_showroom_missing_imputed_in_pipeline": 433
    },
    "splits": {
      "train_val_rows": 844,
      "test_rows": 211
    },
    "thresholds": {
      "uncertainty_band_mae_inr": 10925.74
    },
    "metrics": {
      "mae": 10925.74,
      "rmse": 16829.56,
      "r2": 0.873
    },
    "comparison_table": [
      {
        "model": "Baseline: Dummy (Median)",
        "cv_mae_mean": 31891.14,
        "cv_mae_std": 4145.07,
        "cv_rmse_mean": 58125.72,
        "cv_rmse_std": 16817.04,
        "cv_r2_mean": -0.0771,
        "cv_r2_std": 0.0323
      },
      {
        "model": "Ridge Regression (Baseline)",
        "cv_mae_mean": 14887.03,
        "cv_mae_std": 1666.25,
        "cv_rmse_mean": 24384.11,
        "cv_rmse_std": 5243.58,
        "cv_r2_mean": 0.7983,
        "cv_r2_std": 0.0487
      },
      {
        "model": "Random Forest Regressor",
        "cv_mae_mean": 11111.0,
        "cv_mae_std": 1195.67,
        "cv_rmse_mean": 23077.07,
        "cv_rmse_std": 8092.2,
        "cv_r2_mean": 0.8289,
        "cv_r2_std": 0.0563
      },
      {
        "model": "XGBoost Regressor",
        "cv_mae_mean": 10621.49,
        "cv_mae_std": 1577.48,
        "cv_rmse_mean": 20261.72,
        "cv_rmse_std": 8694.96,
        "cv_r2_mean": 0.874,
        "cv_r2_std": 0.0479
      },
      {
        "model": "LightGBM Regressor",
        "cv_mae_mean": 15629.69,
        "cv_mae_std": 2376.7,
        "cv_rmse_mean": 34167.31,
        "cv_rmse_std": 14968.75,
        "cv_r2_mean": 0.6463,
        "cv_r2_std": 0.1153
      }
    ],
    "error_analysis": {
      "tier_mae": [
        {
          "tier": "Budget",
          "count": 85,
          "mae_inr": 7203.8
        },
        {
          "tier": "Mid-range",
          "count": 56,
          "mae_inr": 7754.93
        },
        {
          "tier": "Premium",
          "count": 70,
          "mae_inr": 17981.9
        }
      ],
      "median_abs_error_inr": 8119.91,
      "worst_residuals_sample": [
        {
          "name": "Royal Enfield Bullet 350 [2007-2011]",
          "year": 2008,
          "actual_inr": 180000.0,
          "predicted_inr": 67453.59,
          "error_inr": -112546.41
        },
        {
          "name": "TVS Apache RR310",
          "year": 2019,
          "actual_inr": 200000.0,
          "predicted_inr": 98855.34,
          "error_inr": -101144.66
        },
        {
          "name": "KTM 390 Duke ABS [2013-2016]",
          "year": 2015,
          "actual_inr": 180000.0,
          "predicted_inr": 122427.34,
          "error_inr": -57572.66
        },
        {
          "name": "Royal Enfield Electra 5 S",
          "year": 2006,
          "actual_inr": 99000.0,
          "predicted_inr": 53378.43,
          "error_inr": -45621.57
        },
        {
          "name": "Aprilia SR 125",
          "year": 2019,
          "actual_inr": 75000.0,
          "predicted_inr": 112918.68,
          "error_inr": 37918.68
        }
      ]
    },
    "limitations": [
      "Dataset contains 1,055 unique bikes, with 41% missing ex_showroom_price (handled via median imputation + missingness indicator inside Pipeline).",
      "Trained on 2020-snapshot listings; electric scooters and newer BS6 Phase-2 models are underrepresented.",
      "Physical condition, city/state registration, and aftermarket accessories are not captured in tabular features."
    ],
    "ui_options": {
      "seller_types": [
        "Dealer",
        "Individual"
      ],
      "owners": [
        "1st owner",
        "2nd owner",
        "3rd owner",
        "4th owner"
      ],
      "year_min": 1988,
      "year_max": 2020,
      "sample_names": [
        "Bajaj Pulsar 150",
        "Royal Enfield Classic 350",
        "Honda Activa [2000-2015]",
        "Honda CB Hornet 160R",
        "Bajaj Pulsar 180",
        "Royal Enfield Thunderbird 350",
        "Hero Honda Splendor Plus",
        "Bajaj Discover 125",
        "Yamaha FZ S V 2.0",
        "Honda Activa 3G",
        "Honda Shine",
        "Honda CB Unicorn 150"
      ]
    },
    "artifact_path": "ml/price/artifacts/bike_price_bundle.joblib",
    "trained_at": "2026-11-11T17:00:32.319644+00:00",
    "id": 6
  },
  {
    "module": "scam",
    "sub_model": "sms",
    "model_name": "TF-IDF + Multinomial Naive Bayes",
    "version": "1.0.0",
    "dataset": {
      "source_file": "SMSSpamCollection",
      "raw_rows": 5574,
      "deduplicated_rows": 5160,
      "duplicates_removed": 414,
      "scam_rate": 0.1244
    },
    "splits": {
      "train_val_rows": 4128,
      "test_rows": 1032
    },
    "thresholds": {
      "suspicious_min": 0.0675,
      "scam_min": 0.2034
    },
    "metrics": {
      "test_at_0_50": {
        "precision": 0.9909,
        "recall": 0.8516,
        "f1": 0.916,
        "f2": 0.8762,
        "pr_auc": 0.9642
      },
      "test_at_tuned_scam": {
        "precision": 0.9435,
        "recall": 0.9141,
        "f1": 0.9286,
        "f2": 0.9198,
        "pr_auc": 0.9642
      },
      "test_alert_recall_including_suspicious": 0.9688,
      "precision": 0.9435,
      "recall": 0.9141,
      "f1": 0.9286,
      "pr_auc": 0.9642
    },
    "comparison_table": [
      {
        "model": "Baseline: Dummy (Most Frequent)",
        "cv_pr_auc_mean": 0.1245,
        "cv_pr_auc_std": 0.0005,
        "cv_f1_mean": 0.0,
        "cv_f2_mean": 0.0,
        "cv_recall_mean": 0.0,
        "cv_precision_mean": 0.0
      },
      {
        "model": "TF-IDF + Logistic Regression",
        "cv_pr_auc_mean": 0.9514,
        "cv_pr_auc_std": 0.0229,
        "cv_f1_mean": 0.914,
        "cv_f2_mean": 0.9107,
        "cv_recall_mean": 0.9086,
        "cv_precision_mean": 0.9199
      },
      {
        "model": "TF-IDF + Linear SVM (Calibrated)",
        "cv_pr_auc_mean": 0.9627,
        "cv_pr_auc_std": 0.0129,
        "cv_f1_mean": 0.9209,
        "cv_f2_mean": 0.911,
        "cv_recall_mean": 0.9047,
        "cv_precision_mean": 0.9385
      },
      {
        "model": "TF-IDF + Multinomial Naive Bayes",
        "cv_pr_auc_mean": 0.9666,
        "cv_pr_auc_std": 0.0149,
        "cv_f1_mean": 0.9008,
        "cv_f2_mean": 0.8524,
        "cv_recall_mean": 0.823,
        "cv_precision_mean": 0.9955
      }
    ],
    "error_analysis": {
      "confusion_matrix_at_t_high": {
        "tn": 897,
        "fp": 7,
        "fn": 11,
        "tp": 117
      },
      "missed_scams_even_after_suspicious_band": 4,
      "false_negatives_sample": [
        {
          "text": "Sorry I missed your call let's talk when you have the time. I'm on 07090201529",
          "scam_prob": 0.0093
        },
        {
          "text": "Babe: U want me dont u baby! Im nasty and have a thing 4 filthyguys. Fancy a rude time with a sexy bitch. How about we go slo n hard! Txt XXX SLO(4msgs)",
          "scam_prob": 0.0116
        },
        {
          "text": "CLAIRE here am havin borin time & am now alone U wanna cum over 2nite? Chat now 09099725823 hope 2 C U Luv CLAIRE xx Calls\u00a31/minmoremobsEMSPOBox45PO139WA",
          "scam_prob": 0.0382
        },
        {
          "text": "Guess who am I?This is the first time I created a web page WWW.ASJESUS.COM read all I wrote. I'm waiting for your opinions. I want to be your friend 1/1",
          "scam_prob": 0.0566
        },
        {
          "text": "dating:i have had two of these. Only started after i sent a text to talk sport radio last week. Any connection do you think or coincidence?",
          "scam_prob": 0.0683
        }
      ],
      "false_positives_sample": [
        {
          "text": "Nokia phone is lovly..",
          "scam_prob": 0.6651
        },
        {
          "text": "Have you laid your airtel line to rest?",
          "scam_prob": 0.3771
        },
        {
          "text": "K:)eng rocking in ashes:)",
          "scam_prob": 0.3637
        },
        {
          "text": "Are you free now?can i call now?",
          "scam_prob": 0.3355
        },
        {
          "text": "Unlimited texts. Limited minutes.",
          "scam_prob": 0.2739
        }
      ]
    },
    "limitations": [
      "Trained on UCI SMS Spam Collection (English messages from 2012); modern slang, regional languages, or newer UPI/OTP phishing templates may cause drift.",
      "Lexical TF-IDF cannot resolve shortened URLs inside SMS messages or verify sender reputation.",
      "Dual-threshold 'suspicious' zone is calibrated on out-of-fold validation probabilities rather than a separate human-labeled 3rd class."
    ],
    "artifact_path": "ml/scam/artifacts/sms_scam_bundle.joblib",
    "trained_at": "2026-11-11T16:52:27.734399+00:00",
    "id": 7
  },
  {
    "module": "scam",
    "sub_model": "url",
    "model_name": "Lexical + XGBoost",
    "version": "1.0.0",
    "dataset": {
      "source_file": "PhiUSIIL_Phishing_URL_Dataset.csv",
      "raw_rows": 235795,
      "deduplicated_rows": 235370,
      "duplicates_removed": 425,
      "unique_domains": 219094,
      "scam_rate": 0.4271
    },
    "splits": {
      "train_val_rows": 188784,
      "test_rows": 46586
    },
    "thresholds": {
      "suspicious_min": 0.1569,
      "scam_min": 0.2069
    },
    "metrics": {
      "test_at_0_50": {
        "precision": 0.9995,
        "recall": 0.9915,
        "f1": 0.9955,
        "f2": 0.9931,
        "pr_auc": 0.9986
      },
      "test_at_tuned_scam": {
        "precision": 0.9966,
        "recall": 0.9932,
        "f1": 0.9949,
        "f2": 0.9939,
        "pr_auc": 0.9986
      },
      "test_alert_recall_including_suspicious": 0.9934,
      "precision": 0.9966,
      "recall": 0.9932,
      "f1": 0.9949,
      "pr_auc": 0.9986
    },
    "comparison_table": [
      {
        "model": "Baseline: Dummy (Most Frequent)",
        "cv_pr_auc_mean": 0.4285,
        "cv_pr_auc_std": 0.0064,
        "cv_f1_mean": 0.0,
        "cv_f2_mean": 0.0,
        "cv_recall_mean": 0.0,
        "cv_precision_mean": 0.0
      },
      {
        "model": "Lexical + Logistic Regression",
        "cv_pr_auc_mean": 0.9965,
        "cv_pr_auc_std": 0.0004,
        "cv_f1_mean": 0.9797,
        "cv_f2_mean": 0.9712,
        "cv_recall_mean": 0.9657,
        "cv_precision_mean": 0.9943
      },
      {
        "model": "Lexical + Random Forest",
        "cv_pr_auc_mean": 0.9981,
        "cv_pr_auc_std": 0.0003,
        "cv_f1_mean": 0.9946,
        "cv_f2_mean": 0.9921,
        "cv_recall_mean": 0.9904,
        "cv_precision_mean": 0.9988
      },
      {
        "model": "Lexical + XGBoost",
        "cv_pr_auc_mean": 0.9982,
        "cv_pr_auc_std": 0.0003,
        "cv_f1_mean": 0.9947,
        "cv_f2_mean": 0.992,
        "cv_recall_mean": 0.9903,
        "cv_precision_mean": 0.9991
      }
    ],
    "error_analysis": {
      "confusion_matrix_at_t_high": {
        "tn": 26903,
        "fp": 67,
        "fn": 133,
        "tp": 19483
      },
      "missed_scams_even_after_suspicious_band": 129,
      "false_negatives_sample": [
        {
          "url": "https://www.mzone.com.ua",
          "scam_prob": 0.0012
        },
        {
          "url": "https://www.tkow.ink",
          "scam_prob": 0.0015
        },
        {
          "url": "https://www.zernina.com.ua",
          "scam_prob": 0.0019
        },
        {
          "url": "https://www.gtn.cl",
          "scam_prob": 0.0022
        },
        {
          "url": "https://www.zexdex.app",
          "scam_prob": 0.0026
        }
      ],
      "false_positives_sample": [
        {
          "url": "https://www.non-man-entry-tank-cleaning-oil-recovery.com",
          "scam_prob": 0.9051
        },
        {
          "url": "https://www.st-johntisbury.wilts.sch.uk",
          "scam_prob": 0.8041
        },
        {
          "url": "https://www.cisss-lanaudiere.gouv.qc.ca",
          "scam_prob": 0.8041
        },
        {
          "url": "https://www.springfieldeducationalfurniture.co.uk",
          "scam_prob": 0.7126
        },
        {
          "url": "https://www.check24-partnerprogramm.de",
          "scam_prob": 0.7043
        }
      ]
    },
    "limitations": [
      "Dataset artifact in PhiUSIIL: 100% of legitimate training URLs use HTTPS (`is_https=1`), so legitimate legacy `http://` URLs are flagged as elevated risk.",
      "Model uses purely lexical URL features (no live webpage scraping, SSL certificate lookup, or WHOIS domain-age check) for safe offline inference.",
      "Lookalike homograph attacks on short HTTPS domains (e.g., `https://paypa1.com`) may look lexically similar to legitimate short domains."
    ],
    "artifact_path": "ml/scam/artifacts/url_scam_bundle.joblib",
    "trained_at": "2026-11-11T16:53:26.366956+00:00",
    "id": 8
  }
];
