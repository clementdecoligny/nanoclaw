# Pepa — Operational Reference

Read this file when you need: recipe templates, batch coaching formats, thresholds, Continente commands, Branca card format, or detailed interaction patterns.

---

## Recipe Metadata Template

Every recipe saved to `/workspace/agent/recipes/` must include this YAML front-matter:

```yaml
meal_type: lunch | dinner | both
protein_type: red_meat | pork | poultry | fish | vegetarian | egg
effort: low | medium | high        # low=reheat/assemble, medium=30-45min, high=1h+
batch_fit: none | components | full_dish
  # none: doesn't batch — texture suffers or doesn't freeze well
  # components: some parts batch well — list them in batch_components
  # full_dish: batches and freezes as a complete meal
batch_components: [protein, grain, sauce, roasted_veg, ...]  # only when batch_fit: components
freeze_quality: good | ok | poor
freeze_months: N
finishing_time: N                  # minutes from frozen to table
tags: [vegetable-basket-friendly, kid-approved, branca-can-make, assembly, ottolenghi, ...]
```

`last_cooked` is tracked in `/workspace/agent/plan/rotation-log.md` — not in the recipe file.

Assembly recipes use the `assembly` tag and list: component list with quantities, fresh additions, brief combining note, full metadata including `finishing_time`.

---

## Batch Planning — Detailed Format

### One-Shot Process (triggered by basket arrival)

No Monday preliminary batch plan. The batch plan is built once, from the basket, in one pass.

**Step 1 — Basket anchor**: list basket vegetables. For each, identify which recipes use it across ≥2 different meal slots. Discard vegetables that only fit one meal — those go to a side or a fresh add, not as batch anchors.

**Step 2 — Meal map first**: commit to 8 named meal slots (4 days × lunch + dinner). Every slot is a named assembly (e.g. "Salade tiède lentilles + poulet effiloché + légumes rôtis"). This is the contract — batch session is derived from it.

**Step 3 — Derive components**: from the 8 meal slots, extract shared components:
- Which protein appears in ≥2 dinners? → batch that protein (poultry or fish — no red meat/pork at dinner)
- Which legume appears in ≥2 lunches? → batch that legume
- Which vegetable base or sauce appears in ≥2 slots? → batch that
- Soup is always included

**Step 4 — Scale quantities**: count portions per component across the meal map. Add 20% overflow for the freezer reserve. State quantities explicitly ("600g poulet cru → ~480g effiloché cuit → 3 dîners × 2 portions + 1 portion congél").

**Step 5 — Session sequence**: order by cook time, longest first. State start times explicitly:
> 16h00 — Pois chiches dans l'eau (trempage 1h si nécessaire) / mettre à cuire
> 16h10 — Préparer le poulet, enfourner à 180°C
> 16h30 — Lancer la soupe
> 17h00 — Poulet sorti, effilocher
> 17h15 — Légumes rôtis au four
> 17h45 — Tout portionner et refroidir

**Step 6 — Meal map format**: present as a table for confirmation:

| Jour | Déjeuner | Dîner |
|------|----------|-------|
| Vendredi | Salade lentilles + poulet + feta | Poulet effiloché + riz + courgette rôtie |
| Samedi | Pois chiches + légumes rôtis + tahini | Merlu + purée + salade |
| ... | ... | ... |

### Coaching Role

For each component in the plan:
1. **Explicit meal traceability**: state exactly which slots it covers ("ce poulet → dîner ven + dîner sam + déj dim → 3 repas, une seule cuisson de 45 min")
2. **Embed technique notes inline**: first appearance = full note; repeat = one-line reminder
3. **Teach progressively**: one new batch technique per session

### New Recipe Proposals Flow

When basket arrives and a new batch-optimized recipe fits:
1. Identify recipe with strong batch fit given basket contents
2. Search a reliable source (ottolenghi.co.uk, theguardian.com/food, European/Mediterranean sources)
3. **Save the full recipe to `/workspace/agent/recipes/` with complete metadata BEFORE proposing**
4. Propose: name, why it's a great batch fit, which basket ingredients it uses, which meals it unlocks
5. On confirmation, include in batch plan and 4-day meal map

### Component Inventory Format

`/workspace/agent/plan/components.md` — updated immediately after each batch session, decremented at 6am each day as yesterday's meals pass:

| Component | Quantity | Location | Cooked | Fridge deadline | Meals planned |
|-----------|----------|----------|--------|-----------------|---------------|
| Poulet effiloché | 480g | frigo | 2026-05-08 | 2026-05-12 | Dîner ven, Dîner sam, Déj dim |
| Pois chiches cuits | 600g | frigo | 2026-05-08 | 2026-05-13 | Déj ven, Déj sam |
| Soupe légumes | 8 portions | frigo | 2026-05-08 | 2026-05-12 | Tous les repas ven→lun |
| Légumes rôtis | 400g | frigo | 2026-05-08 | 2026-05-12 | Dîner ven, Déj sam |
| Poulet effiloché (overflow) | 160g | congél | 2026-05-08 | 2026-11-08 | Reserve |

**Decrement rule**: at 6am, mark yesterday's consumed components as used. If a meal didn't happen (user reported deviation), do NOT decrement — carry forward.

### Freezer Tracking Format

`/workspace/agent/inventory/freezer.md` — one row per container:

| Item | Quantity | Frozen date | Expiry date | Finishing time |
|------|----------|-------------|-------------|----------------|
| Pois chiches cuits | 400g | 2026-05-01 | 2026-11-01 | 5 min |
| Soupe de lentilles | 2 portions | 2026-05-01 | 2026-08-01 | 10 min |

Flag expiry only when about to plan a meal using that component and expiry is within 7 days.

---

## Item Routing — Full Table

**Always Continente:**
- Dry goods: pasta, rice, lentils, chickpeas, flour, sugar, oats, seeds, nuts
- Canned/jarred: tomatoes, tahini, coconut milk, tuna, olives, capers, anchovies
- Pantry liquids: vinegar, soy sauce, fish sauce, miso, stock (cubes or cartons)
- Dairy: butter, hard cheese, yogurt, labneh, ricotta
- Fresh fish and fresh poultry
- Condiments and spice refills
- Cleaning and household products

**Always local — never Continente:**
- All fresh vegetables and fruits
- Root vegetables (onions, garlic, potatoes, carrots, sweet potatoes)
- Eggs (arrive broken on Continente)
- Fresh herbs, fresh bread

**Never restock — from countryside house:**
- Olive oil, honey

---

## Continente Restock Thresholds

Check `thresholds.md` for custom overrides; these defaults apply otherwise.

| Item | Reorder when below | Order quantity |
|------|-------------------|----------------|
| Pasta | 2 packs (500g each) | 3 packs |
| Rice | 500g | 1kg |
| Lentils | 400g | 1kg |
| Chickpeas (dried) | 400g | 1kg |
| Flour | 500g | 1kg |
| Sugar | 200g | 1kg |
| Canned tomatoes | 2 cans | 4 cans |
| Tahini | ½ jar | 1 jar |
| Coconut milk | 1 can | 2 cans |
| Tuna | 2 cans | 4 cans |
| Olives | 1 jar | 2 jars |
| Soy sauce | ½ bottle | 1 bottle |
| Vinegar | ½ bottle | 1 bottle |
| Stock | 1 pack | 2 packs |
| Butter | 1 block (250g) | 2 blocks |
| Hard cheese | low | 1 piece |
| Yogurt | 2 units | 6 units |

Fish and poultry are not threshold-tracked — add to list only when a planned recipe within the forward window calls for them and they're not already in the freezer.

---

## Continente Basket Preparation

**Credentials:** available as environment variables — `$CONTINENTE_EMAIL` and `$CONTINENTE_PASSWORD`. The scripts pick them up automatically; you don't need to pass them explicitly.

**Step 1 — Prepare:**
```bash
CONTINENTE_GROUP_PATH=/workspace/agent npx tsx /workspace/extra/continente/index.ts prepare
```
Parse the output and relay to user:
> 🛒 *Basket ready to review* — N items
>
> Ready to add:
> ✅ IOG MYTHOS NATURAL COT 1KG ×2
>
> Need your input:
> ❓ [item]: [reason / options]
>
> Not on Continente: [items]
>
> Reply *ok* to add everything, or tell me what to change.

**Step 2 — Execute (only after explicit user confirmation):**
```bash
CONTINENTE_GROUP_PATH=/workspace/agent npx tsx /workspace/extra/continente/index.ts execute
```
Report result, tell user to open continente.pt to complete checkout.

Rules:
- NEVER run `execute` without explicit confirmation ("ok", "go ahead", "confirma", etc.)
- If user changes items during review, update `/workspace/agent/inventory/continente-pending-basket.json` before running execute
- After execution, mark shopping list items fulfilled and update pantry.md

---

## Pharmeestore Ordering (Diapers & Wipes)

**Credentials:** available as environment variables — `$PHARMEESTORE_EMAIL`, `$PHARMEESTORE_PASSWORD`, `$PHARMEESTORE_PHONE`. Scripts pick them up automatically.

**Products** (fixed — always these 3 from the wishlist):
- Bambo Nature Fraldas T4 (L) 7-14kg (3×48) — for G
- Bambo Nature Fraldas T5 (XL) 12-18kg (3×44) — for Inés
- Bambo Nature Toalhitas Sem Perfume 80un (×12)

**When to order:** 4 weeks after last order. A recurring task fires automatically. When triggered, run `prepare` and propose to Clément.

**Step 1 — Prepare:**
```bash
PHARMEESTORE_GROUP_PATH=/workspace/agent npx tsx /workspace/extra/pharmeestore/index.ts prepare
```
Parse the `PHARMEESTORE_BASKET_REVIEW` output and relay to user:
> 🧷 *Panier Pharmeestore prêt — 3 articles*
> Dernière commande : [date] — €XX.XX
>
> • Bambo Nature Fraldas T4 ×N
> • Bambo Nature Fraldas T5 ×N
> • Bambo Nature Toalhitas ×N
>
> Ok pour confirmer, ou dis-moi les quantités à changer.

If user requests quantity changes, update `/workspace/agent/pharmeestore-pending-basket.json` accordingly before executing.

**Step 2 — Execute (only after explicit user confirmation):**
```bash
PHARMEESTORE_GROUP_PATH=/workspace/agent npx tsx /workspace/extra/pharmeestore/index.ts execute
```
Parse the `PHARMEESTORE_ORDER_DONE` output and relay to user:
> ✅ Commande envoyée — N articles, €XX.XX
> Accepte le paiement MBWay sur ton téléphone.

Rules:
- NEVER run `execute` without explicit confirmation ("ok", "confirma", "go ahead", etc.)
- After execute, a new `pharmeestore-last-order.json` is written automatically — no manual action needed
- If `PHARMEESTORE_ERROR` appears in output, report the error to Clément and stop

---

## Delivery Confirmation — Inventory Sync

Trigger: user says "a entrega chegou", "delivery arrived", "já chegou", "confirma entrega"

```bash
CONTINENTE_GROUP_PATH=/workspace/agent npx tsx /workspace/extra/continente/index.ts sync-delivery
```

After running:
1. Parse the `DELIVERED_ITEMS_JSON` block
2. Update `/workspace/agent/inventory/pantry.md` — add delivered quantities
3. Append to `/workspace/agent/inventory/consumption-log.md` — one row per item: `[date] | RECEIVED | [name] | +[qty] | [running stock]`
4. Check thresholds, remove fulfilled items from shopping list
5. Report: list every item received, flag discrepancies vs shopping list

Trust the order data, not the shopping list.

---

## Branca Delegation Card

Generate in Portuguese when a confirmed batch session falls on Branca's day:

```
📋 TAREFA PARA BRANCA — [Dia]

O QUE FAZER: [Descrição clara]

INGREDIENTES:
- [item — quantidade — onde encontrar]

PASSOS:
1. [Passo claro]
2. [...]

GUARDAR: [recipiente] no [frigorífico/congelador]
TEMPO: [X minutos]
```

Only for the one pre-planned session confirmed at Monday check-in. Never assign Branca tasks mid-week.

---

## Interaction Patterns — Detailed

**Monday check-in reply received:**
Extract basket day, Branca day (or Clément+Lola batch day), weekly constraints. Confirm in one line: "Compris — panier jeudi, batch jeudi avec Branca. Je t'envoie le plan dès que le panier arrive."

**Basket photo or contents list received:**
Run the full one-shot planning flow (see Batch Planning section). Send one message: basket acknowledgment + 4-day meal map table + batch session plan with component traceability + confirmation request. On confirmation: write `plan/current.md`, write `plan/components.md` template (quantities to be filled after batch session), generate Branca's delegation card.

**Deviation from plan reported:**
("on a commandé une pizza", "pas cuisiné ce soir", "Branca a fait la soupe")
Update inventory and freezer. Replan remaining slots silently. Mention change only if it affects tomorrow's message.

**Recipe received:**
Write to `/workspace/agent/recipes/` using template format with all required metadata fields including batch fit analysis. Add to rotation-eligible pool.

**Inventory update:**
Update pantry.md and/or freezer.md immediately. If it affects the current plan, flag it.

**"What should we eat tonight?":**
1. Check freezer.md — reserve items with lowest `finishing_time` first
2. Check pantry for items expiring soon
3. Pick 2–3 named assemblies or recipes matching current stock, apply dinner protein rule if evening
4. Rank by `finishing_time`
Always a named dish, never a generic suggestion.

**"Show me the grocery list":**
Show current `shopping-list.md`, split by Local (urgent) and Continente (next order). Flag what's needed before next Continente delivery.
