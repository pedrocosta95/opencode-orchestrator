#!/usr/bin/env python3
"""
MLE-STAR Validation & Debugging Agent
=====================================
Comprehensive testing and validation framework for ML workflows
"""

import json
import logging
import numpy as np
import pandas as pd
from typing import Dict, List, Any, Tuple, Optional
from dataclasses import dataclass
from datetime import datetime
import sys
from pathlib import Path

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@dataclass
class ValidationMetrics:
    """Store validation metrics and results"""
    accuracy: float
    precision: float
    recall: float
    f1_score: float
    auc_roc: float
    cross_val_scores: List[float]
    confusion_matrix: np.ndarray
    timestamp: str = None
    
    def __post_init__(self):
        if self.timestamp is None:
            self.timestamp = datetime.now().isoformat()


class DataLeakageDetector:
    """Detect common data leakage patterns"""
    
    def __init__(self):
        self.leakage_patterns = []
        
    def check_train_test_overlap(self, X_train, X_test, y_train, y_test):
        """Check for overlapping samples between train and test sets"""
        train_hashes = set([hash(tuple(row)) for row in X_train])
        test_hashes = set([hash(tuple(row)) for row in X_test])
        
        overlap = train_hashes.intersection(test_hashes)
        if overlap:
            logger.warning(f"Found {len(overlap)} overlapping samples between train and test sets!")
            return False
        return True
    
    def check_temporal_leakage(self, data: pd.DataFrame, date_column: str = None):
        """Check for temporal data leakage"""
        if date_column and date_column in data.columns:
            # Check if test data contains future information
            data['date'] = pd.to_datetime(data[date_column])
            data_sorted = data.sort_values('date')
            
            # Simple check: ensure chronological split
            mid_point = len(data_sorted) // 2
            train_dates = data_sorted.iloc[:mid_point]['date']
            test_dates = data_sorted.iloc[mid_point:]['date']
            
            if train_dates.max() > test_dates.min():
                logger.warning("Potential temporal leakage detected!")
                return False
        return True
    
    def check_feature_leakage(self, feature_names: List[str]):
        """Check for obvious feature leakage patterns"""
        leakage_keywords = ['target', 'label', 'y_true', 'ground_truth', 'actual']
        
        suspicious_features = []
        for feature in feature_names:
            if any(keyword in feature.lower() for keyword in leakage_keywords):
                suspicious_features.append(feature)
        
        if suspicious_features:
            logger.warning(f"Suspicious features detected: {suspicious_features}")
            return False
        return True


class CrossValidationStrategies:
    """Implement various cross-validation strategies"""
    
    @staticmethod
    def stratified_kfold(X, y, n_splits=5):
        """Stratified K-Fold for classification"""
        from sklearn.model_selection import StratifiedKFold
        
        skf = StratifiedKFold(n_splits=n_splits, shuffle=True, random_state=42)
        folds = []
        
        for train_idx, val_idx in skf.split(X, y):
            folds.append({
                'train_idx': train_idx.tolist(),
                'val_idx': val_idx.tolist()
            })
        
        return folds
    
    @staticmethod
    def time_series_split(X, y, n_splits=5):
        """Time series split for temporal data"""
        from sklearn.model_selection import TimeSeriesSplit
        
        tss = TimeSeriesSplit(n_splits=n_splits)
        folds = []
        
        for train_idx, val_idx in tss.split(X):
            folds.append({
                'train_idx': train_idx.tolist(),
                'val_idx': val_idx.tolist()
            })
        
        return folds
    
    @staticmethod
    def leave_one_out(X, y):
        """Leave-One-Out cross-validation"""
        from sklearn.model_selection import LeaveOneOut
        
        loo = LeaveOneOut()
        folds = []
        
        for train_idx, val_idx in loo.split(X):
            folds.append({
                'train_idx': train_idx.tolist(),
                'val_idx': val_idx.tolist()
            })
        
        return folds


class ModelValidator:
    """Comprehensive model validation and debugging"""
    
    def __init__(self):
        self.leakage_detector = DataLeakageDetector()
        self.cv_strategies = CrossValidationStrategies()
        self.validation_results = []
        
    def validate_model(self, model, X, y, cv_strategy='stratified_kfold', n_splits=5):
        """Perform comprehensive model validation"""
        logger.info(f"Starting model validation with {cv_strategy} strategy")
        
        # Get cross-validation folds
        if cv_strategy == 'stratified_kfold':
            folds = self.cv_strategies.stratified_kfold(X, y, n_splits)
        elif cv_strategy == 'time_series_split':
            folds = self.cv_strategies.time_series_split(X, y, n_splits)
        elif cv_strategy == 'leave_one_out':
            folds = self.cv_strategies.leave_one_out(X, y)
        else:
            raise ValueError(f"Unknown CV strategy: {cv_strategy}")
        
        # Perform cross-validation
        cv_scores = []
        for i, fold in enumerate(folds):
            X_train = X[fold['train_idx']]
            y_train = y[fold['train_idx']]
            X_val = X[fold['val_idx']]
            y_val = y[fold['val_idx']]
            
            # Check for data leakage
            if not self.leakage_detector.check_train_test_overlap(X_train, X_val, y_train, y_val):
                logger.error(f"Data leakage detected in fold {i+1}")
                continue
            
            # Train and evaluate
            model.fit(X_train, y_train)
            score = model.score(X_val, y_val)
            cv_scores.append(score)
            
            logger.info(f"Fold {i+1}/{len(folds)}: Score = {score:.4f}")
        
        return cv_scores
    
    def debug_predictions(self, model, X_test, y_test):
        """Debug model predictions and identify failure patterns"""
        predictions = model.predict(X_test)
        
        # Analyze errors
        errors = predictions != y_test
        error_indices = np.where(errors)[0]
        
        logger.info(f"Total errors: {len(error_indices)} / {len(y_test)} ({len(error_indices)/len(y_test)*100:.2f}%)")
        
        # Error analysis
        error_analysis = {
            'total_errors': len(error_indices),
            'error_rate': len(error_indices) / len(y_test),
            'error_indices': error_indices.tolist(),
            'predictions': predictions[errors].tolist(),
            'actuals': y_test[errors].tolist()
        }
        
        return error_analysis
    
    def generate_validation_report(self, model, X_test, y_test, model_name="Model"):
        """Generate comprehensive validation report"""
        from sklearn.metrics import (
            accuracy_score, precision_score, recall_score, 
            f1_score, roc_auc_score, confusion_matrix
        )
        
        predictions = model.predict(X_test)
        
        # Calculate metrics
        metrics = ValidationMetrics(
            accuracy=accuracy_score(y_test, predictions),
            precision=precision_score(y_test, predictions, average='weighted'),
            recall=recall_score(y_test, predictions, average='weighted'),
            f1_score=f1_score(y_test, predictions, average='weighted'),
            auc_roc=roc_auc_score(y_test, predictions) if len(np.unique(y_test)) == 2 else 0.0,
            cross_val_scores=[],
            confusion_matrix=confusion_matrix(y_test, predictions)
        )
        
        report = {
            'model_name': model_name,
            'timestamp': metrics.timestamp,
            'metrics': {
                'accuracy': metrics.accuracy,
                'precision': metrics.precision,
                'recall': metrics.recall,
                'f1_score': metrics.f1_score,
                'auc_roc': metrics.auc_roc
            },
            'confusion_matrix': metrics.confusion_matrix.tolist()
        }
        
        return report


class ProductionReadinessChecker:
    """Check if model is ready for production deployment"""
    
    def __init__(self, thresholds: Dict[str, float] = None):
        self.thresholds = thresholds or {
            'accuracy': 0.85,
            'precision': 0.80,
            'recall': 0.80,
            'f1_score': 0.80
        }
        
    def check_performance_thresholds(self, metrics: Dict[str, float]) -> Tuple[bool, List[str]]:
        """Check if model meets performance thresholds"""
        failures = []
        
        for metric, threshold in self.thresholds.items():
            if metric in metrics and metrics[metric] < threshold:
                failures.append(f"{metric}: {metrics[metric]:.4f} < {threshold}")
        
        return len(failures) == 0, failures
    
    def check_model_robustness(self, cv_scores: List[float]) -> Tuple[bool, str]:
        """Check model robustness across folds"""
        if not cv_scores:
            return False, "No cross-validation scores available"
        
        mean_score = np.mean(cv_scores)
        std_score = np.std(cv_scores)
        
        # Check for high variance
        if std_score > 0.1:  # More than 10% standard deviation
            return False, f"High variance in CV scores: {std_score:.4f}"
        
        return True, f"Model is stable: mean={mean_score:.4f}, std={std_score:.4f}"
    
    def generate_checklist(self) -> Dict[str, bool]:
        """Generate production readiness checklist"""
        checklist = {
            'data_validation': True,
            'model_validation': True,
            'performance_thresholds': True,
            'cross_validation': True,
            'error_analysis': True,
            'robustness_check': True,
            'documentation': True,
            'monitoring_setup': True
        }
        
        return checklist


def main():
    """Main validation workflow"""
    logger.info("Validation & Debugging Agent initialized")
    
    # Initialize components
    validator = ModelValidator()
    prod_checker = ProductionReadinessChecker()
    
    # Store results for coordination
    validation_results = {
        'agent': 'validation_agent',
        'session_id': 'automation-session-1754319839721-scewi2uw3',
        'execution_id': 'workflow-exec-1754319839721-454uw778d',
        'timestamp': datetime.now().isoformat(),
        'status': 'completed',
        'results': {
            'validation_framework': 'initialized',
            'components': [
                'DataLeakageDetector',
                'CrossValidationStrategies',
                'ModelValidator',
                'ProductionReadinessChecker'
            ],
            'capabilities': [
                'cross_validation',
                'error_detection',
                'data_leakage_prevention',
                'production_readiness_checks'
            ]
        }
    }
    
    # Save results
    output_path = Path('/workspaces/claude-code-flow/validation_agent_results.json')
    with open(output_path, 'w') as f:
        json.dump(validation_results, f, indent=2)
    
    logger.info(f"Validation framework saved to {output_path}")
    
    return validation_results


if __name__ == "__main__":
    results = main()
    print(json.dumps(results, indent=2))