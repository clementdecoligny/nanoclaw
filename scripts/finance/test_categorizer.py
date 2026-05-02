"""
test_categorizer.py — TDD tests for transaction categorization
"""

import json
import tempfile
from pathlib import Path

import pytest
from categorizer import categorize_transaction, categorize_transactions, _load_patterns


@pytest.fixture
def builtin_patterns():
    return _load_patterns(Path("/nonexistent"))  # triggers built-in fallback


# ---------------------------------------------------------------------------
# Single transaction matching
# ---------------------------------------------------------------------------

def test_pingo_doce_is_supermarket(builtin_patterns):
    cat, conf = categorize_transaction("PINGO DOCE SALDANHA", -45.30, builtin_patterns)
    assert cat == "Supermercado"
    assert conf >= 0.90


def test_uber_is_transport(builtin_patterns):
    cat, conf = categorize_transaction("UBER *TRIP", -12.50, builtin_patterns)
    assert cat == "Transportes"
    assert conf >= 0.90


def test_netflix_is_subscricao(builtin_patterns):
    cat, conf = categorize_transaction("NETFLIX.COM", -15.99, builtin_patterns)
    assert cat == "Subscrições"
    assert conf >= 0.90


def test_unknown_description_returns_outros(builtin_patterns):
    cat, conf = categorize_transaction("XYZABC 123 UNKNOWN", -50.00, builtin_patterns)
    assert cat == "Outros"
    assert conf == 0.0


def test_case_insensitive_matching(builtin_patterns):
    cat, _ = categorize_transaction("pingo doce colombo", -30.00, builtin_patterns)
    assert cat == "Supermercado"


# ---------------------------------------------------------------------------
# Batch categorization
# ---------------------------------------------------------------------------

def test_categorize_transactions_adds_fields():
    transactions = [
        {"description": "CONTINENTE ONLINE", "amount": -87.60},
        {"description": "NETFLIX.COM", "amount": -15.99},
    ]
    results = categorize_transactions(transactions, Path("/nonexistent"))
    for r in results:
        assert "category" in r
        assert "confidence" in r
        assert "needs_review" in r


def test_needs_review_flagged_for_low_confidence():
    transactions = [
        {"description": "XYZABC TOTALMENTE DESCONHECIDO", "amount": -50.00},
    ]
    results = categorize_transactions(transactions, Path("/nonexistent"), confidence_threshold=0.90)
    assert results[0]["needs_review"] is True


def test_high_confidence_not_flagged():
    transactions = [
        {"description": "PINGO DOCE SALDANHA", "amount": -45.30},
    ]
    results = categorize_transactions(transactions, Path("/nonexistent"), confidence_threshold=0.90)
    assert results[0]["needs_review"] is False


def test_preserves_original_fields():
    transactions = [
        {"description": "CONTINENTE", "amount": -87.60, "posting_date": "2025-01-15", "balance": 900.0},
    ]
    results = categorize_transactions(transactions, Path("/nonexistent"))
    r = results[0]
    assert r["amount"] == -87.60
    assert r["posting_date"] == "2025-01-15"


# ---------------------------------------------------------------------------
# Custom patterns from history
# ---------------------------------------------------------------------------

def test_loads_custom_patterns_from_history(tmp_path):
    patterns = [
        {"pattern": r"(?i)minha_loja_especial", "category": "Categoria Especial", "weight": 0.99},
    ]
    (tmp_path / "category_patterns.json").write_text(json.dumps(patterns))
    loaded = _load_patterns(tmp_path)
    assert any(p["category"] == "Categoria Especial" for p in loaded)


def test_custom_pattern_overrides_builtin(tmp_path):
    patterns = [
        {"pattern": r"(?i)minha_loja_especial", "category": "Categoria Especial", "weight": 0.99},
    ]
    (tmp_path / "category_patterns.json").write_text(json.dumps(patterns))
    loaded = _load_patterns(tmp_path)
    cat, conf = categorize_transaction("MINHA_LOJA_ESPECIAL", -50.00, loaded)
    assert cat == "Categoria Especial"
    assert conf == 0.99
