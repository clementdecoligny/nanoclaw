# Pepa — Procédures Techniques

Lire ce fichier pour : commandes Continente, commandes Pharmeestore, sync livraison, carte Branca.

---

## Commandes Continente

**Credentials :** variables d'environnement — `$CONTINENTE_EMAIL` et `$CONTINENTE_PASSWORD`. Les scripts les récupèrent automatiquement.

**Step 1 — Prepare :**
```bash
CONTINENTE_GROUP_PATH=/workspace/agent npx tsx /workspace/extra/continente/index.ts prepare
```
Relayer au user :
> 🛒 *Panier prêt — N articles*
>
> À ajouter : ✅ [produit] ×N
> Décision requise : ❓ [produit] — [raison / options]
> Non dispo Continente : [articles]
>
> Réponds *ok* pour confirmer, ou dis-moi ce qui change.

**Step 2 — Execute (uniquement après confirmation explicite) :**
```bash
CONTINENTE_GROUP_PATH=/workspace/agent npx tsx /workspace/extra/continente/index.ts execute
```
Rapporter le résultat. Dire au user d'ouvrir continente.pt pour finaliser le paiement.

Règles :
- JAMAIS lancer `execute` sans confirmation explicite ("ok", "go ahead", "confirma", etc.)
- Si le user modifie des articles pendant la revue, mettre à jour `/workspace/agent/inventory/continente-pending-basket.json` avant de lancer execute
- Après execute : marquer les articles de la liste courses comme traités, mettre à jour pantry.md

---

## Pharmeestore — Couches & Lingettes

**Credentials :** `$PHARMEESTORE_EMAIL`, `$PHARMEESTORE_PASSWORD`, `$PHARMEESTORE_PHONE`. Scripts automatiques.

**Produits fixes (toujours ces 3) :**
- Bambo Nature Fraldas T4 (L) 7-14kg (3×48) — pour G
- Bambo Nature Fraldas T5 (XL) 12-18kg (3×44) — pour Inés
- Bambo Nature Toalhitas Sem Perfume 80un (×12)

**Fréquence :** 4 semaines après la dernière commande. Une tâche récurrente déclenche automatiquement.

**Step 1 — Prepare :**
```bash
PHARMEESTORE_GROUP_PATH=/workspace/agent npx tsx /workspace/extra/pharmeestore/index.ts prepare
```
Relayer le bloc `PHARMEESTORE_BASKET_REVIEW` :
> 🧷 *Panier Pharmeestore prêt — 3 articles*
> Dernière commande : [date] — €XX.XX
> • Bambo Nature Fraldas T4 ×N
> • Bambo Nature Fraldas T5 ×N
> • Bambo Nature Toalhitas ×N
> Ok pour confirmer, ou dis-moi les quantités à changer.

**Step 2 — Execute (uniquement après confirmation explicite) :**
```bash
PHARMEESTORE_GROUP_PATH=/workspace/agent npx tsx /workspace/extra/pharmeestore/index.ts execute
```
Relayer le bloc `PHARMEESTORE_ORDER_DONE` :
> ✅ Commande envoyée — N articles, €XX.XX
> Accepte le paiement MBWay sur ton téléphone.

Règles :
- JAMAIS execute sans confirmation
- Si modification quantités : mettre à jour `/workspace/agent/pharmeestore-pending-basket.json` avant execute
- Après execute : `pharmeestore-last-order.json` est mis à jour automatiquement

---

## Sync Livraison Continente

Déclencheur : user dit "a entrega chegou", "delivery arrived", "já chegou", "confirma entrega"

```bash
CONTINENTE_GROUP_PATH=/workspace/agent npx tsx /workspace/extra/continente/index.ts sync-delivery
```

Après execution :
1. Parser le bloc `DELIVERED_ITEMS_JSON`
2. Mettre à jour `inventory/pantry.md` — ajouter les quantités reçues
3. Supprimer les articles reçus de `inventory/shopping-list.md`
4. Vérifier les seuils, reporter les articles manquants si écart avec la commande

---

## Carte Branca

Générer en portugais quand une session batch confirmée tombe le jour de Branca :

```
📋 TAREFA PARA BRANCA — [Dia da semana]

O QUE FAZER: [Descrição clara]

INGREDIENTES:
- [item — quantidade — onde encontrar]

PASSOS:
1. [Passo claro]
2. [...]

GUARDAR: [recipiente] no [frigorífico/congelador]
TEMPO: [X minutos]
```

Uniquement pour la session batch pré-planifiée confirmée lors du check-in lundi. Ne jamais assigner des tâches Branca en milieu de semaine.

---

## Seuils Réapprovisionnement Continente

| Article | Commander quand < | Quantité à commander |
|---|---|---|
| Pasta | 2 packs (500g) | 3 packs |
| Riz | 500g | 1kg |
| Lentilles | 400g | 1kg |
| Pois chiches (boîte cuite) | 1 boîte | 3 boîtes |
| Farine | 500g | 1kg |
| Tomates en boîte | 2 boîtes | 4 boîtes |
| Tahini | ½ pot | 1 pot |
| Lait de coco | 1 boîte | 2 boîtes |
| Thon | 2 boîtes | 4 boîtes |
| Olives | 1 pot | 2 pots |
| Sauce soja | ½ bouteille | 1 bouteille |
| Bouillon | 1 pack | 2 packs |
| Fromage dur | low | 1 pièce |
| Yaourt grec | 2 unités | 6 unités (max 6×1kg — pas de place frigo pour plus) |

Poisson et volaille : pas de seuil fixe — ajouter à la liste seulement si une recette planifiée dans la fenêtre en a besoin et qu'il n'y en a pas au congélateur.
