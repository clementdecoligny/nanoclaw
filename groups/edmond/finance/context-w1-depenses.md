# Contexte Workload 1 — Dépenses mensuelles

Comptes : personnel `45507717811` / commun `45545535104` (auto-détectés par le parser).

---

## Notes de contexte importantes

### ⚠️ À TRAITER lors de l'import du relevé d'AOÛT 2026 — SS de mai payée en retard

Clément a oublié de payer la Segurança Social (SS) de mai, puis l'a réglée le
9 août 2026. Le paiement `SEGURANCA SOCIAL` (~77,26 €) apparaîtra sur le relevé
d'*août* mais doit être *rattaché au mois de MAI* : catégorie EMPREGADA /
SEGURANCA SOCIAL, avec `year=2026, month=5` (et non month=8). Ne pas le compter
dans les dépenses d'août. Retirer cette note une fois le rattachement fait.

### ⚠️ À IDENTIFIER lors de l'import du relevé de SEPTEMBRE 2026 — commande HSN

Le 3 septembre 2026, Clément a passé une commande *MB WAY* de *113,75 €* sur
*hsnstore.pt* (HSN = marque de nutrition sportive : protéines, compléments).
Commande #300643301. Quand un débit MB WAY de ~113,75 € apparaîtra sur le relevé
(perso ou commun), c'est ça : compléments sportifs. Catégorie proposée à
confirmer avec Clément (HEALTH ou LEISURE). Retirer cette note une fois la ligne
identifiée et catégorisée.

### Escola No Chiado — paiements hors ActivoBank

Les mensualités Escola No Chiado sont payées via *Coverflex* (tickets crèches, avantage entreprise). Elles n'apparaissent donc PAS dans les exports ActivoBank. Clément les saisit manuellement dans le historical xlsx (libellé "ESCOLA NO CHIADO MOIS", catégorie EDUCATION/ESCOLA).
→ Pour les agrégats mensuels complets, lire le historical xlsx EN PLUS des exports ActivoBank.

### Branca — Contexte babysitting (maj. jan 2026)

Branca a commencé début janvier 2026. Horaires : lun-ven 16h-20h + 2 soirs/sem jusqu'à 22h-23h (babysitting inclus). Depuis jan 2026 : babysitters extérieures uniquement le week-end. Baisse attendue et structurelle : ~-36% (202€/mois → 128€/mois) — pas un signal d'alarme, changement de modèle voulu.

---

## Step 0 — Revenus (collecter avant les relevés)

Types valides : SALARY, FOOD, EDUCATION, LICENCA, BONUS, HOLIDAY, IRS. Who : Clément, Lola, Joint.

Collecte : salaire + FOOD pour chaque personne. Toujours demander le subsidio de alimentação explicitement, même si l'utilisateur dit "ok" tôt. Rejeter les montants négatifs. Avertir les doublons (même Type/date/Who).

Construire `/tmp/income.json` → exécuter `income_writer.py --input /tmp/income.json --output /tmp/YYYY-MM-revenus.xlsx` → envoyer xlsx + résumé chat → attendre confirmation ("ok" / "confirme" / "c'est bon" / "parfait" / "enregistre") → copier vers `/workspace/agent/finance/historical/YYYY-MM-revenus.xlsx`.

---

## Step 1 — Parser les exports

```bash
/opt/wpenv/bin/python3 /workspace/agent/finance/excel_parser.py <fichier> --output /tmp/personal.json
/opt/wpenv/bin/python3 /workspace/agent/finance/excel_parser.py <fichier> --output /tmp/joint.json
```

Si un seul fichier reçu : traiter immédiatement, demander le deuxième. Dériver `--year`/`--month` du range Data Valor (Data Lanç. ignorée partout).

---

## Step 2 — Catégoriser

Le categorizer cherche `learned_categories.json` dans le répertoire `--history`. Avant de lancer, copier les learned patterns :

```bash
# Pour le compte personnel :
cp /workspace/agent/finance/historical/learned_categories_personal.json \
   /workspace/extra/historical/learned_categories.json

/opt/wpenv/bin/python3 /workspace/agent/finance/categorizer.py /tmp/personal.json \
  --history /workspace/extra/historical/ --year YYYY --month MM --output /tmp/personal-cat.json

# Copier retour après exécution :
cp /workspace/extra/historical/learned_categories.json \
   /workspace/agent/finance/historical/learned_categories_personal.json
```

Faire de même pour joint avec `learned_categories_joint.json`.

---

## Step 3 — Conflits

Si `conflict_count > 0` : présenter chaque conflit avec les options, attendre décision de Clément, persister dans learned_categories.

---

## Step 4 — Classifier les inconnus

Si `unknown_count > 0` : utiliser `claude_prompt` pour classifier chaque ligne inconnue.

Confidence : `high` = marchand clairement identifiable, `medium` = interprétable mais ambigu, `low` → UNCLASSIFIED. Crédits sans catégorie dépense → INCOME. Ne pas deviner les codes opaques ou références MB.

Écrire `/tmp/personal-claude.json` → réexécuter categorizer avec `--apply-claude /tmp/personal-claude.json`.

---

## Step 5 — Générer les fichiers Excel

```bash
/opt/wpenv/bin/python3 /workspace/agent/finance/excel_writer.py /tmp/personal-cat.json \
  --output /tmp/YYYY-MM-personnel-categorise.xlsx
/opt/wpenv/bin/python3 /workspace/agent/finance/excel_writer.py /tmp/joint-cat.json \
  --output /tmp/YYYY-MM-commun-categorise.xlsx
```

---

## Règle : Escola no Chiado (mensuel obligatoire)

L'escola no Chiado est une dépense mensuelle fixe (~437€) du compte commun. Elle doit être présente chaque mois sous EDUCATION / ESCOLA. Si absente du relevé commun : vérifier si la Data Valor est tombée hors du mois (possible décalage), signaler à Clément et corriger manuellement. Ne jamais laisser passer un mois sans cette ligne.

---

## Step 6 — Envoyer + attendre confirmation

Envoyer les deux fichiers. Résumé chat : ✅ exactes / 🟡 incertaines / 🟠 non classifiées. Lister explicitement les lignes medium-confidence. Attendre confirmation.

---

## Step 7 — Corrections avant confirmation

Appliquer les corrections naturelles de Clément, persister dans learned_categories, régénérer le fichier, renvoyer, attendre à nouveau. "merci" seul ne compte pas comme confirmation.

---

## Step 8 — Sauvegarder

```bash
cp /tmp/YYYY-MM-personnel-categorise.xlsx /workspace/extra/historical/YYYY-MM-personnel.xlsx
cp /tmp/YYYY-MM-commun-categorise.xlsx /workspace/extra/historical/YYYY-MM-commun.xlsx
```

JSON : `/workspace/agent/finance/historical/YYYY-MM-personal.json` et `YYYY-MM-joint.json`.

Puis mettre à jour la base SQLite :

```bash
/opt/wpenv/bin/python3 /workspace/agent/finance/db_insert_month.py \
  /workspace/agent/finance/historical/YYYY-MM-personal.json personal
/opt/wpenv/bin/python3 /workspace/agent/finance/db_insert_month.py \
  /workspace/agent/finance/historical/YYYY-MM-joint.json joint
/opt/wpenv/bin/python3 /workspace/agent/finance/db_insert_month.py \
  --income /workspace/agent/finance/historical/YYYY-MM-income.json
```

---

## Taxonomie

```
BABYSITTING → BABYSITTING
BIKE → GEAR | MAINTENANCE | RENTAL
EAT OUT → BACKERY | PADARIA | QUIOSQUE | RESTAURANT | UBER EATS
EDUCATION → ESCOLA
EMPREGADA → EMPREGADA | SEGURANCA SOCIAL
GROCERIES → SUPER | SUPER ONLINE
HEALTH → COUCHES | HOSPITAL | MEDIS | MEDIS REIMBURSMENT | PHARMACY
HOLIDAY → ALPS JULY 2026 | BIKE | FOOD | HOTELS | MISC | TRANSPORT
HOUSE → DONA AJUDA | EDP | EPAL AGUA | FURNITURE | MISC | NOS | NOS INTERNET | SPOTIFY
KIDS → BABYSITTING | LEISURE | MISC | PISCINA | ROPA | ROPA VINTED
MOBILITY → BOLT | COOLTRA | PUBLIC TRANSPORT | TRANSPORT | UBER
RENT → RENT
VOITURE → ESSENCE | MECHANIC | VIA VERDE
CASH → CASH
LEISURE → (inférer sub-category)
FURNITURE → FURNITURE
GIFT → GIFT
INCOME → SALARY | TRANSFER | REIMBURSEMENT | OTHER
MISC → MISC
UNCLASSIFIED → UNCLASSIFIED
```
