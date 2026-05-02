# Pepa — Family Meal Planner

Pepa is your family meal planning agent.

## What problems it solves

- You don't have to think about what's for lunch or dinner each day — one short message at 11am tells you everything
- Grocery shopping is driven by the actual meal plan, not guesswork
- Batch cooking sessions are anchored to the vegetable basket delivery and planned around Branca's weekly cooking slot
- The freezer always holds a reserve of ready meals so you're never stuck without options
- Recipes are stored and retrieved accurately — no hallucinated ingredients or missing steps

## How to trigger it

Message **PepaLisboaBot** on Telegram — either in a private DM or by @mentioning the bot in the family group chat.

---

## How it works

### Planning algorithm

When Pepa fills a meal slot, she applies a fixed priority order:

1. **Expiring ingredients** — something about to go bad drives the meal
2. **Batch cooking anchor** — on the vegetable basket day, one meal is a batch session
3. **Freezer reserve check** — the freezer always holds ≥ 2 ready meals; batch output goes there first if below threshold
4. **Fresh cooking** — cook something new if ingredients are available
5. **Freezer draw-down** — pull from the freezer, respecting the 3-day variety window and no red meat/pork at dinner
6. **Leftover carry-forward** — use yesterday's surplus before opening new ingredients

### Constraints enforced automatically

- **No red meat or pork at dinner** — every evening, without exception (sleep quality)
- **No same dish within 3 days**
- **One new recipe per week** — Pepa proposes it at the Monday check-in; you confirm or redirect
- **Branca cooks once per week** — her batch session is pre-planned at the Monday check-in, anchored to the basket day

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

Every Monday morning, Pepa sends a check-in asking four things in one message:

1. When does the vegetable basket arrive this week?
2. Which day is Branca cooking this week?
3. Freezer audit — here's what I have, anything to correct?
4. New recipe proposal — keep it or swap?

Reply in one message. Pepa builds the week's skeleton from your answers.

---

### Vegetable basket arrival

Forward a photo or text list of the basket contents. Pepa:
- Updates the pantry
- Flags what's expiring soonest
- Proposes a batch cooking session anchored to that day
- Replans the week's meals around what arrived

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

Pepa checks the freezer first (assembly-only meals take priority), then picks 2–3 options from the recipe library matching current stock, ranked by effort. Always a named recipe, never a generic suggestion. Applies the dinner protein rule if it's evening.

---

### Recipe management

**Trigger:** "Save this recipe" or paste/send a recipe.

Pepa stores it in the recipe library with full metadata: meal type, protein type, effort level, batch eligibility, typical yield, and tags. Future planning sessions and Monday new-recipe proposals can use it immediately.

**Rule:** Pepa always reads the recipe file before giving ingredients or instructions. She never summarizes from memory — every ingredient and step is reproduced exactly as written.

---

## Inventory model

Pepa tracks the freezer and pantry with three mechanisms:

- **Plan-derived** — when a meal is planned and the day passes, ingredients are marked consumed; batch output is added to the freezer
- **User overrides** — tell Pepa mid-week if you deviate ("ordered pizza instead", "Branca made soup today") and she updates immediately
- **Monday audit** — the weekly check-in includes a freezer review to resync any drift

---

## Current limitations

- **No automatic availability detection** — Pepa asks you every Monday what the week looks like. She cannot pull this from a calendar yet.
- **No automated checkout** — Pepa fills the Continente basket but you complete the purchase yourself.
- **Rotation window not yet calibrated** — the minimum rest period before a recipe repeats in the weekly plan is TBD; it will be set once the recipe library is large enough to measure against.
- **No nutritional tracking** — meal plans don't include macro counts. A nutrition interface exists for Clément's cycling nutrition but requires manual updates.
- **No proactive restocking monitoring** — Pepa alerts on low stock when you update inventory, but doesn't monitor in the background.
