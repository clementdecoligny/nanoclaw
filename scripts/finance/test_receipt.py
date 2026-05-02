"""
test_receipt.py — tests for HTML receipt generation

Reference receipt: recibo_Branca_marco_2026.pdf (91.95h, março 2026)
"""

import pytest
from receipt import generate_receipt


# ---------------------------------------------------------------------------
# Reference receipt verification (91.95h — março 2026)
# ---------------------------------------------------------------------------

def test_reference_contains_correct_total_a_pagar():
    """Reference: total_a_pagar = 656,83"""
    html = generate_receipt(hours_worked=91.95, year=2026, month=3)
    assert "656,83" in html


def test_reference_total_remuneracoes():
    """Reference: total_remuneracoes = 616,83"""
    html = generate_receipt(hours_worked=91.95, year=2026, month=3)
    assert "616,83" in html


def test_reference_ss_worker():
    """Reference: ss_worker = 26,81"""
    html = generate_receipt(hours_worked=91.95, year=2026, month=3)
    assert "26,81" in html


def test_reference_base_salary():
    """Reference: base = 528,71"""
    html = generate_receipt(hours_worked=91.95, year=2026, month=3)
    assert "528,71" in html


def test_reference_ferias():
    """Reference: férias = 44,06"""
    html = generate_receipt(hours_worked=91.95, year=2026, month=3)
    assert "44,06" in html


def test_reference_navegante():
    """Reference: Pass Navegante = 40,00"""
    html = generate_receipt(hours_worked=91.95, year=2026, month=3)
    assert "40,00" in html


# ---------------------------------------------------------------------------
# Header layout
# ---------------------------------------------------------------------------

def test_employer_name_present():
    html = generate_receipt(hours_worked=80.0, year=2025, month=4)
    assert "Clément Rouault de Coligny" in html


def test_employee_name_present():
    html = generate_receipt(hours_worked=80.0, year=2025, month=4)
    assert "Branca Manuel Gaspar" in html


def test_employer_nif():
    html = generate_receipt(hours_worked=80.0, year=2025, month=4)
    assert "291628788" in html


def test_employee_nif():
    html = generate_receipt(hours_worked=80.0, year=2025, month=4)
    assert "323404138" in html


def test_exmo_label():
    """Employee block has Portuguese honorific prefix"""
    html = generate_receipt(hours_worked=80.0, year=2025, month=4)
    assert "Exmo(a). Senhor(a)" in html


def test_employer_address():
    html = generate_receipt(hours_worked=80.0, year=2025, month=4)
    assert "Rua Eduardo Coelho" in html
    assert "1200-168 Lisboa" in html


# ---------------------------------------------------------------------------
# Info bar
# ---------------------------------------------------------------------------

def test_info_bar_nif_trabalhador_label():
    html = generate_receipt(hours_worked=80.0, year=2025, month=4)
    assert "NIF Trabalhador" in html


def test_info_bar_data_pagamento_label():
    html = generate_receipt(hours_worked=80.0, year=2025, month=4)
    assert "Data Pagamento" in html


def test_info_bar_forma_de_pagamento_label():
    html = generate_receipt(hours_worked=80.0, year=2025, month=4)
    assert "Forma de Pagamento" in html


def test_info_bar_funcao_label():
    html = generate_receipt(hours_worked=80.0, year=2025, month=4)
    assert "Função" in html


def test_info_bar_funcao_value():
    html = generate_receipt(hours_worked=80.0, year=2025, month=4)
    assert "Empregada Doméstica" in html


def test_info_bar_mbway_payment_method():
    html = generate_receipt(hours_worked=80.0, year=2025, month=4)
    assert "MBWay" in html


def test_info_bar_payment_date_last_day_of_month():
    """Payment date = last day of the month"""
    html = generate_receipt(hours_worked=80.0, year=2025, month=4)
    assert "30/04/2025" in html


def test_info_bar_payment_date_march():
    html = generate_receipt(hours_worked=91.95, year=2026, month=3)
    assert "31/03/2026" in html


def test_info_bar_payment_date_february_leap():
    html = generate_receipt(hours_worked=80.0, year=2024, month=2)
    assert "29/02/2024" in html


# ---------------------------------------------------------------------------
# Section heading
# ---------------------------------------------------------------------------

def test_nota_de_remuneracoes_heading():
    html = generate_receipt(hours_worked=80.0, year=2025, month=4)
    assert "NOTA DE REMUNERAÇÕES E DEDUÇÕES" in html


def test_portuguese_month_name_marco():
    html = generate_receipt(hours_worked=91.95, year=2026, month=3)
    assert "Março / 2026" in html


def test_portuguese_month_name_abril():
    html = generate_receipt(hours_worked=80.0, year=2025, month=4)
    assert "Abril / 2025" in html


# ---------------------------------------------------------------------------
# Earnings table (left panel)
# ---------------------------------------------------------------------------

def test_earnings_table_designacao_header():
    html = generate_receipt(hours_worked=80.0, year=2025, month=4)
    assert "Designação" in html


def test_earnings_table_quant_header():
    html = generate_receipt(hours_worked=80.0, year=2025, month=4)
    assert "Quant." in html


def test_earnings_table_valor_header():
    html = generate_receipt(hours_worked=80.0, year=2025, month=4)
    assert "Valor" in html


def test_salary_base_label():
    html = generate_receipt(hours_worked=80.0, year=2025, month=4)
    assert "Salário Base" in html


def test_hours_quantity_format():
    """Hours shown as e.g. '91.95h' in the Quant. column"""
    html = generate_receipt(hours_worked=91.95, year=2026, month=3)
    assert "91.95h" in html


def test_ferias_label():
    html = generate_receipt(hours_worked=80.0, year=2025, month=4)
    assert "Subsídio de Férias" in html
    assert "1/12" in html
    assert "provisão" in html


def test_natal_label():
    html = generate_receipt(hours_worked=80.0, year=2025, month=4)
    assert "Subsídio de Natal" in html


def test_unit_quantity_for_subsidies():
    """Subsidies and navegante use '1 U' as quantity"""
    html = generate_receipt(hours_worked=80.0, year=2025, month=4)
    assert "1 U" in html


def test_pass_navegante_label():
    """Must be 'Pass Navegante' (not 'Passe Navegante')"""
    html = generate_receipt(hours_worked=80.0, year=2025, month=4)
    assert "Pass Navegante" in html
    assert "isento SS" in html


# ---------------------------------------------------------------------------
# Deductions table (right panel)
# ---------------------------------------------------------------------------

def test_deductions_vbase_header():
    html = generate_receipt(hours_worked=80.0, year=2025, month=4)
    assert "V. Base" in html


def test_ss_trabalhador_label():
    """Exact label from reference PDF"""
    html = generate_receipt(hours_worked=80.0, year=2025, month=4)
    assert "Seg. Social trabalhador (quota mensal)" in html


def test_ss_subsidios_label():
    html = generate_receipt(hours_worked=80.0, year=2025, month=4)
    assert "SS s/ subsídios" in html


# ---------------------------------------------------------------------------
# Note paragraph
# ---------------------------------------------------------------------------

def test_note_italic_present():
    """Note paragraph is present and mentions SS"""
    html = generate_receipt(hours_worked=80.0, year=2025, month=4)
    assert "Nota:" in html
    assert "SS calculado sobre salário base" in html


def test_note_mentions_quota_trabalhador():
    html = generate_receipt(hours_worked=91.95, year=2026, month=3)
    assert "26,81" in html  # ss_worker amount in note


def test_note_mentions_encargo_patronal():
    html = generate_receipt(hours_worked=91.95, year=2026, month=3)
    # ss_employer amount appears in note
    assert "Encargo patronal" in html


# ---------------------------------------------------------------------------
# Summary table
# ---------------------------------------------------------------------------

def test_summary_total_remuneracoes_label():
    html = generate_receipt(hours_worked=80.0, year=2025, month=4)
    assert "Total Remunerações" in html


def test_summary_desconto_ss_label():
    html = generate_receipt(hours_worked=80.0, year=2025, month=4)
    assert "Desconto SS Trabalhador" in html


def test_summary_encargo_ss_patronal_label():
    html = generate_receipt(hours_worked=80.0, year=2025, month=4)
    assert "Encargo SS Patronal" in html


def test_summary_total_a_pagar_label():
    html = generate_receipt(hours_worked=80.0, year=2025, month=4)
    assert "Total a Pagar" in html


def test_summary_eur_label():
    html = generate_receipt(hours_worked=80.0, year=2025, month=4)
    assert "EUR" in html


# ---------------------------------------------------------------------------
# Payment table
# ---------------------------------------------------------------------------

def test_payment_table_valor_a_transferir_label():
    html = generate_receipt(hours_worked=80.0, year=2025, month=4)
    assert "Valor a Transferir" in html


# ---------------------------------------------------------------------------
# Signature lines
# ---------------------------------------------------------------------------

def test_signature_trabalhador_line():
    html = generate_receipt(hours_worked=80.0, year=2025, month=4)
    assert "O/A Trabalhador/a" in html
    assert "Branca Manuel Gaspar" in html


def test_signature_entidade_patronal_line():
    html = generate_receipt(hours_worked=80.0, year=2025, month=4)
    assert "A Entidade Patronal" in html
    assert "Clément Rouault de Coligny" in html


# ---------------------------------------------------------------------------
# Historical average (April 2026 — 96h, history = [431.25, 500.25, 528.71])
# ---------------------------------------------------------------------------

def test_historical_average_ferias_in_receipt():
    """April 2026: férias should be 41,92 (1/12 of average base)"""
    html = generate_receipt(
        hours_worked=96.0,
        year=2026,
        month=4,
        historical_base_salaries=[431.25, 500.25, 528.71],
    )
    assert "41,92" in html


def test_historical_average_total_a_pagar_in_receipt():
    """April 2026: total_a_pagar = 552 + 41.92 + 41.92 + 40 = 675.84"""
    html = generate_receipt(
        hours_worked=96.0,
        year=2026,
        month=4,
        historical_base_salaries=[431.25, 500.25, 528.71],
    )
    assert "675,84" in html


# ---------------------------------------------------------------------------
# HTML validity
# ---------------------------------------------------------------------------

def test_receipt_is_valid_html():
    html = generate_receipt(hours_worked=80.0, year=2025, month=4)
    assert html.strip().startswith("<!DOCTYPE html>")
    assert "</html>" in html
