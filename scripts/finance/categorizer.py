#!/usr/bin/env python3
"""
categorizer.py — Auto-categorize ActivoBank transactions

Learns from historical labeled data in --history dir.
For each transaction, assigns a category and a confidence score.
Low-confidence items are flagged for user review.

Usage:
  python3 categorizer.py transactions.json \
    --history /path/to/historical/ \
    --output categorized.json \
    [--confidence-threshold 0.90]

Output JSON: list of transactions with added fields:
  category:    str — assigned category name
  confidence:  float — 0.0–1.0
  needs_review: bool — True if confidence < threshold

Requires historical data to be provided first (see Workload 1 onboarding).
Run this script only after the user has provided their labeled transaction history.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path


# ---------------------------------------------------------------------------
# Category matching — keyword-based with confidence scoring
# ---------------------------------------------------------------------------

def _load_patterns(history_dir: Path) -> list[dict]:
    """
    Load pattern rules from historical labeled data.
    Returns a list of {pattern, category, weight} dicts.
    Falls back to a minimal built-in set if no history exists.
    """
    patterns_file = history_dir / "category_patterns.json"
    if patterns_file.exists():
        return json.loads(patterns_file.read_text())

    # Minimal built-in fallback — will be replaced by user's taxonomy
    return [
        {"pattern": r"(?i)(pingo doce|continente|auchan|lidl|minipreço|froiz)", "category": "Supermercado", "weight": 0.95},
        {"pattern": r"(?i)(uber|bolt|cabify|taxi|freenow)", "category": "Transportes", "weight": 0.95},
        {"pattern": r"(?i)(edp|galp|epal|água|eletricidade|gás)", "category": "Utilities", "weight": 0.95},
        {"pattern": r"(?i)(netflix|spotify|apple|amazon prime|disney)", "category": "Subscrições", "weight": 0.95},
        {"pattern": r"(?i)(farmácia|pharmacy|farmacia|salcobrand)", "category": "Saúde", "weight": 0.90},
        {"pattern": r"(?i)(restaurante|restaurant|cafe|café|pizza|burger|mcdonald|kfc|sushi)", "category": "Restaurantes", "weight": 0.85},
        {"pattern": r"(?i)(transferencia recebida|salary|vencimento|ordenado)", "category": "Rendimento", "weight": 0.95},
        {"pattern": r"(?i)(mbway|pagamento a|referência mb)", "category": "Pagamentos MB/MBWay", "weight": 0.70},
        {"pattern": r"(?i)(atm|levantamento|multibanco)", "category": "Levantamentos ATM", "weight": 0.95},
        {"pattern": r"(?i)(seguro|seguros|companhia de seguros)", "category": "Seguros", "weight": 0.90},
        {"pattern": r"(?i)(renda|rua|arrendamento)", "category": "Habitação", "weight": 0.90},
    ]


def categorize_transaction(description: str, amount: float, patterns: list[dict]) -> tuple[str, float]:
    """
    Return (category, confidence) for a single transaction.
    Uses regex pattern matching against description.
    """
    best_category = "Outros"
    best_confidence = 0.0

    for rule in patterns:
        if re.search(rule["pattern"], description):
            if rule["weight"] > best_confidence:
                best_category = rule["category"]
                best_confidence = rule["weight"]

    return best_category, best_confidence


def categorize_transactions(
    transactions: list[dict],
    history_dir: Path,
    confidence_threshold: float = 0.90,
) -> list[dict]:
    """
    Categorize a list of transaction dicts (from excel_parser output).
    Adds category, confidence, and needs_review fields.
    """
    patterns = _load_patterns(history_dir)
    results = []

    for t in transactions:
        category, confidence = categorize_transaction(
            t.get("description", ""),
            t.get("amount", 0.0),
            patterns,
        )
        results.append({
            **t,
            "category": category,
            "confidence": round(confidence, 4),
            "needs_review": confidence < confidence_threshold,
        })

    return results


def save_patterns(patterns: list[dict], history_dir: Path) -> None:
    """Persist updated patterns back to disk."""
    history_dir.mkdir(parents=True, exist_ok=True)
    (history_dir / "category_patterns.json").write_text(
        json.dumps(patterns, ensure_ascii=False, indent=2)
    )


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="Categorize ActivoBank transactions")
    parser.add_argument("transactions_json", help="Path to parsed transactions JSON (from excel_parser.py)")
    parser.add_argument("--history", required=True, help="Path to historical labeled data directory")
    parser.add_argument("--output", required=True, help="Output path for categorized JSON")
    parser.add_argument("--confidence-threshold", type=float, default=0.90)
    args = parser.parse_args()

    transactions = json.loads(Path(args.transactions_json).read_text())
    history_dir = Path(args.history)

    categorized = categorize_transactions(transactions, history_dir, args.confidence_threshold)

    needs_review = [t for t in categorized if t["needs_review"]]
    auto_categorized = len(categorized) - len(needs_review)

    Path(args.output).write_text(json.dumps(categorized, ensure_ascii=False, indent=2))

    print(f"Categorized {len(categorized)} transactions:")
    print(f"  Auto-categorized: {auto_categorized}")
    print(f"  Needs review:     {len(needs_review)}")

    if needs_review:
        print("\nItems needing review:")
        for t in needs_review[:10]:
            print(f"  [{t['confidence']:.0%}] {t['description'][:50]}  → {t['category']}")


if __name__ == "__main__":
    main()
