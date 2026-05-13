#!/opt/wpenv/bin/python3
"""Shared utilities for ActivoBank Excel parsing."""

import re
from datetime import datetime

DATE_FORMATS = ("%d-%m-%Y", "%Y-%m-%d", "%d/%m/%Y")


def parse_date(value):
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%d")
    s = str(value).strip()
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(s, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return s


def parse_amount(value):
    if value is None:
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    s = str(value).strip().replace(" ", "").replace("\xa0", "")
    if "," in s and "." in s:
        s = s.replace(".", "").replace(",", ".")
    elif "," in s:
        s = s.replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return 0.0


def normalize(text):
    """Lowercase, collapse whitespace, strip punctuation for lookup."""
    t = str(text).lower().strip()
    t = re.sub(r"[^\w\s]", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def find_description_header_row(ws):
    """Return 1-based row index of the header row containing 'descrição'."""
    for row in ws.iter_rows():
        for cell in row:
            if cell.value and str(cell.value).strip().lower() in ("descrição", "descricao", "description"):
                return cell.row
    return 1


def find_category_header_row(ws):
    """Return 1-based row index of the header row containing 'CATEGORY', or None."""
    for row in ws.iter_rows():
        for cell in row:
            if cell.value and str(cell.value).strip().upper() == "CATEGORY":
                return cell.row
    return None
