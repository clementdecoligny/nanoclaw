# Contexte Workload 2 — Salaire Branca

**Employeur :** Clément Rouault de Coligny — NIF 291628788 — Rua Eduardo Coelho, 46 2D, 1200-168 Lisboa
**Employée :** Branca Manuel Gaspar — NIF 323404138 — Empregada Doméstica

---

## Source de vérité : `/workspace/agent/salary/history.json`

Ce fichier contient TOUS les mois (année, mois, heures, base_salary) depuis janvier.
C'est la source unique pour le calcul des subsídios. **À chaque nouveau mois validé,
y ajouter l'entrée du mois.**

**Règle subsídios :** subsídio de férias = subsídio de natal = 1/12 de la moyenne des
salaires base de janvier au mois courant *inclus*. Les scripts lisent ce fichier
automatiquement — plus besoin de passer `--history` à la main.

---

## Calcul du salaire

```bash
/opt/wpenv/bin/python3 /workspace/agent/finance/salary.py \
  <heures> --year YYYY --month MM --json
```

`salary.py` charge automatiquement tous les mois antérieurs depuis `history.json`
(exclut le mois courant, qui est recalculé à partir des heures → pas de double
comptage même si le mois est déjà enregistré). `--history` reste disponible comme
override manuel pour un test ou une correction ponctuelle.

---

## Génération du reçu

```bash
/opt/wpenv/bin/python3 /workspace/agent/finance/receipt_v2.py \
  <heures> --year YYYY --month MM \
  --output /workspace/agent/salary/YYYY-MM-recibo.pdf
```

Même logique auto que `salary.py` (lit `history.json`).

**CRITIQUE : Ne jamais utiliser chromium, wkhtmltopdf ou tout autre outil externe.**
`receipt_v2.py` génère le PDF en interne via weasyprint — passer directement `--output path.pdf`.

---

## Approbation et archivage

Envoyer le PDF pour approbation. Après confirmation de Clément :

1. Le PDF reste dans `/workspace/agent/salary/YYYY-MM-recibo.pdf` (dossier persistant).
   Il n'existe pas de `/mnt/data` — ne pas tenter d'y copier.
2. Ajouter l'entrée du mois dans `/workspace/agent/salary/history.json`
   (`{"year":YYYY,"month":MM,"hours":<h>,"base_salary":<b>}`).
3. Sauvegarder `{"base_salary": <valeur>}` dans
   `/workspace/agent/finance/historical/YYYY-MM-salary.json`.
