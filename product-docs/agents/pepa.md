# Pepa — Family Meal Planner

Pepa is your family meal planning agent.

## What problems it solves

- You don't have to think about what's for lunch or dinner each day — one short message at 11am tells you everything
- Grocery shopping is driven by the actual meal plan, not guesswork
- Batch cooking sessions are anchored to the vegetable basket delivery and planned around Branca's weekly cooking slot
- The freezer always holds a reserve of high-effort components so you're never stuck without options
- Recipes are stored and retrieved accurately — no hallucinated ingredients or missing steps
- Pepa coaches the batch cooking session: explains what to make, in what order, and why each component unlocks variety throughout the week

## How to trigger it

Message **PepaLisboaBot** on Telegram — either in a private DM or by @mentioning the bot in the family group chat.

---

## How it works

### Planning algorithm

When Pepa fills a meal slot, she applies a fixed priority order:

1. **Expiring ingredients** — something about to go bad drives the meal
2. **Batch cooking anchor** — on the vegetable basket day (or the day after), one session is a batch cooking session
3. **Freezer reserve check** — the freezer always holds ≥ 2 Tupperware of high-effort components; batch output fills the reserve first if below threshold
4. **Fresh cooking** — cook something new if ingredients are available
5. **Freezer draw-down** — assemble a named dish from frozen components, respecting the 3-day variety window and the dinner protein rule
6. **Leftover carry-forward** — use yesterday's surplus before opening new ingredients

### Batch cooking model

Pepa uses **component batching**: instead of batching full dishes, the session produces the time-consuming building blocks — cooked legumes, slow proteins, grain bases, roasted vegetables, sauces. These are assembled into different named dishes throughout the week, giving more variety from a single 2-hour session.

For every component in the session plan, Pepa explains why it's being batched: which meals it unlocks, what variety it creates, what effort it saves.

### Constraints enforced automatically

- **No red meat or pork at dinner** — every evening, without exception (sleep quality)
- **No same assembly within 3 days** — variety is at the dish level, not the ingredient level; the same chickpeas can appear in three different assemblies
- **One new recipe per week** — Pepa proposes it at the Monday check-in, prioritizing recipes with strong batch fit; you confirm or redirect
- **Branca cooks once per week** — her batch session is pre-planned at the Monday check-in, anchored to the basket day; Clément and Lola are the backup if she's unavailable

---

## Workflows

### Daily 11am message

Every day at 11am, Pepa sends a short message covering:

- Today's lunch and dinner
- Any prep needed for either
- Anything to defrost or buy locally before the meal
- What to do with leftovers if there are any

Nothing else. Short and actionable.

---

### Monday check-in

Every Monday morning, Pepa sends a check-in asking five things in one message:

1. When does the vegetable basket arrive this week?
2. Which day is Branca cooking this week? (or: which day will you and Lola cook if Branca is unavailable?)
3. Freezer audit — here's what I have, anything to correct?
4. New recipe proposal — keep it or swap?
5. Preliminary batch plan — here's what I propose to batch and why, confirm or redirect?

Reply in one message. Pepa builds the week's skeleton from your answers.

---

### Vegetable basket arrival

Forward a photo or text list of the basket contents. Pepa:
- Updates the pantry
- Flags what's expiring soonest
- Refines the batch plan based on actual basket contents
- Proposes a new batch-optimized recipe if a good fit exists for what arrived (searches Mediterranean/European sources, saves to library before proposing)
- Replans the week's meals around what arrived

---

### Batch cooking session

Pepa produces a structured session plan covering:
- Which components to make, with a timed sequence (longest cook time first)
- Why each component is worth making: which assemblies it enables, what variety it creates
- Technique notes inline — full explanation the first time a technique appears, a short reminder on repeat
- Quantities scaled to the week's planned meals plus reserve refill if needed

Session cap: **2 hours, 3–4 outputs**.

---

### Grocery basket preparation (Continente)

**Trigger:** Pepa proposes when the list is substantial or 2 weeks have passed. You can also ask any time.

**Two-step flow — Pepa never skips the review:**

1. **Prepare** — Pepa matches each item on the shopping list to exact Continente products using a preferred-products database. She outputs a full basket for your review: items ready to add, items needing your input, items not on Continente.

2. **Execute** — After you say "ok" (or make corrections), Pepa adds everything to your Continente cart. You open continente.pt to complete checkout — Pepa never pays.

**Grocery has two streams:** Continente (max every 2 weeks) and local quick buys (surfaced in the daily message when something is needed before the next delivery).

---

### Delivery sync

**Trigger:** "The delivery arrived" or "a entrega chegou."

Pepa fetches the actual delivered order from Continente, updates the pantry, logs the delivery, removes fulfilled items from the shopping list, and flags any discrepancies.

---

### Ad-hoc "what should we eat tonight?"

Pepa checks the freezer first (lowest finishing time takes priority), then picks 2–3 named assemblies or recipes from the library matching current stock, ranked by effort. Always a named dish, never a generic suggestion. Applies the dinner protein rule if it's evening.

---

### Recipe management

**Trigger:** "Save this recipe" or paste/send a recipe.

Pepa stores it in the recipe library with full metadata: meal type, protein type, effort level, batch fit (none / components / full dish), batch components, freeze quality, freeze duration, finishing time, and tags. Future planning sessions and Monday new-recipe proposals can use it immediately.

**Rule:** Pepa always reads the recipe file before giving ingredients or instructions. She never summarizes from memory — every ingredient and step is reproduced exactly as written. For new recipes proposed from web search, the file is saved before any instructions are given.

---

## Inventory model

Pepa tracks the pantry, fridge, and freezer at three levels of precision:

- **Exact quantities** — dry goods and freezer components (pasta, lentils, chickpeas, etc.): decremented automatically as planned meals pass. Optimistic: Pepa assumes the meal happened unless you report otherwise.
- **Coarse quantities** — fresh produce from the vegetable basket: tracked by item count as confirmed when the basket arrives, decremented recipe by recipe.
- **Presence / threshold** — household staples (dairy, canned goods, condiments): trigger a Continente restock when they drop below a defined level.

The freezer is tracked per container: item, quantity, frozen date, expiry date, and finishing time. Expiry is flagged only when Pepa is about to plan a meal using that component.

Pantry drift is corrected through delivery syncs and user-reported deviations — no manual pantry audit at Monday check-in (freezer only).

### Grocery streams

**Continente** (biweekly) handles dry goods, canned items, dairy, fresh fish, and fresh poultry. Pepa proposes an order when the list is large enough to justify the delivery fee, or when a staple is about to run out. Two days before proposing, she spot-checks yogurt, rice, and pasta — items consumed daily outside the meal plan.

**Local** handles everything fresh: vegetables, fruit, root vegetables, eggs, herbs, and bread. Pepa only flags a local buy for fresh produce if the item is needed before the next basket delivery — to avoid accumulation and waste.

Olive oil and honey are never purchased — they come from the family's countryside house.

---

## Current limitations

- **No automatic availability detection** — Pepa asks you every Monday what the week looks like. She cannot pull this from a calendar yet.
- **No automated checkout** — Pepa fills the Continente basket but you complete the purchase yourself.
- **Rotation window not yet calibrated** — the minimum rest period before a recipe repeats in the weekly plan is TBD; it will be set once the recipe library is large enough to measure against.
- **No nutritional tracking** — meal plans don't include macro counts. A nutrition interface exists for Clément's cycling nutrition but requires manual updates.
- **No proactive restocking monitoring** — Pepa tracks thresholds within the planning cycle but does not run background checks between interactions.
