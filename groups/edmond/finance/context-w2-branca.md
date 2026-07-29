# Contexte Workload 2 — Salaire Branca

**Employeur :** Clément Rouault de Coligny — NIF 291628788 — Rua Eduardo Coelho, 46 2D, 1200-168 Lisboa
**Employée :** Branca Manuel Gaspar — NIF 323404138 — Empregada Doméstica

---

## Calcul du salaire

Lire les `base_salary` dans `/workspace/agent/finance/historical/YYYY-MM-salary.json` pour construire l'argument `--history`.

```bash
/opt/wpenv/bin/python3 /workspace/agent/finance/salary.py \
  <heures> --year YYYY --month MM --history <base1>,<base2>,... --json
```

---

## Génération du reçu

```bash
/opt/wpenv/bin/python3 /workspace/agent/finance/receipt_v2.py \
  <heures> --year YYYY --month MM --history <base1>,<base2>,... \
  --output /workspace/agent/salary/YYYY-MM-recibo.pdf
```

**CRITIQUE : Ne jamais utiliser chromium, wkhtmltopdf ou tout autre outil externe.** `receipt_v2.py` génère le PDF en interne via weasyprint — passer directement `--output path.pdf`.

---

## Approbation et archivage

Envoyer le PDF pour approbation. Après confirmation de Clément :

```bash
cp /workspace/agent/salary/YYYY-MM-recibo.pdf /mnt/data/salary/YYYY-MM-recibo.pdf
```

Sauvegarder `{"base_salary": <valeur>}` dans `/workspace/agent/finance/historical/YYYY-MM-salary.json`.
