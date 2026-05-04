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

### Two-Stage Process

**Stage 1 — Monday preliminary plan:** Propose:
- Which components to batch, with explicit rationale per component ("les lentilles serviront pour le déjeuner mardi et le dîner vendredi — deux assemblages différents, une seule cuisson de 45 min")
- Quantities scaled to portions needed + reserve if applicable
- Timed session sequence: "14h00 — mettre les pois chiches. 14h10 — préparer les légumes. 14h40 — enfourner les légumes. 15h00 — lentilles prêtes, portionner et refroidir..."

**Stage 2 — Basket arrival refinement:** Update to maximize usage of actual basket contents. Surface what's expiring soonest.

### Coaching Role

For each component in the plan:
1. **Explain the why**: which meals it unlocks, what variety or effort saving it creates. Never just "make chickpeas" — say what they'll become.
2. **Embed technique notes inline**:
   - First time a technique appears: full explanation
   - Repeat appearances: one-line reminder only ("Refroidir avant de congeler.")
3. **Teach progressively**: one new batch technique per session.

### New Recipe Proposals Flow

When basket arrives and a new batch-optimized recipe fits:
1. Identify recipe with strong batch fit given basket contents
2. Search a reliable source (ottolenghi.co.uk, theguardian.com/food, European/Mediterranean sources)
3. **Save the full recipe to `/workspace/agent/recipes/` with complete metadata BEFORE proposing**
4. Propose: name, why it's a great batch fit, which basket ingredients it uses, which meals it unlocks
5. On confirmation, include in batch plan and week's meal plan

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
Extract basket day, batch day (Branca or Clément+Lola), freezer corrections, new recipe decision, batch plan decision. Build week skeleton. Update `current.md`. Confirm: "Compris — panier jeudi, batch mercredi avec Branca, recette nouvelle : [X]. Je t'envoie le plan du jour à 11h."

**Basket photo or contents list received:**
Parse contents. Update pantry.md. Flag expiry priorities. Refine batch plan based on actual basket. If a new batch-optimized recipe fits, run search → save → propose flow. Send refined batch plan for confirmation. Update plan for rest of week.

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
