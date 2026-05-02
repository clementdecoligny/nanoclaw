# Pepa — Family Meal Planner

Pepa is your family meal planning agent.

## What problems it solves

- You don't have to think about what's for dinner each night
- Grocery shopping is driven by the actual meal plan, not guesswork
- Batch cooking sessions are planned to minimize time in the kitchen across the week
- Recipes are stored and retrieved accurately — no hallucinated ingredients or missing steps
- Your cleaning assistant's cooking tasks are produced as clear Portuguese instruction cards

## How to trigger it

Message **PepaLisboaBot** on Telegram — either in a private DM or by @mentioning the bot in the family group chat.

---

## Workflows

### Weekly meal planning

**Trigger:** Tell Pepa you want to plan the week, or send your availability ("this week we're home every evening except Thursday").

**What Pepa needs from you:**
- Which evenings you're home for dinner
- Any meals already planned (dinner out, guests, etc.)
- Any constraints for the week (diet, what's already in the fridge)

**What you get back:**
- A 7-day rolling plan covering dinners every day and lunches on weekends
- Each meal linked to a specific recipe from the library
- Batch cooking chains highlighted — meals that reuse the same base component
- A cooking schedule fitted to your available time windows
- Instruction cards for your cleaning assistant (in Portuguese) for any delegated prep
- A grocery list: only what the plan needs minus what's already in stock

**How it works internally:**
Pepa reads the recipe library index (one file with all recipes and their metadata), selects 5–7 meals that batch well together, cross-checks against the pantry, and builds the shopping list from the delta. She never plans from the fridge first — recipes drive the plan, inventory is a constraint.

---

### Grocery basket preparation (Continente)

**Trigger:** "Prepare the Continente basket" or "add the shopping list to the cart."

**Two-step flow — Pepa never skips the review:**

1. **Prepare** — Pepa matches each item on the shopping list to exact Continente products using a preferred-products database built from past orders. She outputs a full basket for your review:
    - Items ready to add (matched to a known product)
    - Items needing your input (ambiguous match or multiple options)
    - Items not available on Continente (buy elsewhere)

2. **Execute** — After you say "ok" (or make any corrections), Pepa adds everything to your Continente cart. You open continente.pt to complete checkout — Pepa never pays.

**What you get back:** A filled cart on Continente.pt, ready for checkout.

---

### Delivery sync

**Trigger:** "The delivery arrived" or "a entrega chegou."

**What happens:**
Pepa fetches the actual delivered order from Continente (quantities may differ from what was ordered), updates the pantry with everything received, logs the delivery, and removes fulfilled items from the shopping list. She flags any discrepancies.

---

### Ad-hoc "what should we eat tonight?"

**Trigger:** Any message asking what to cook now.

**What happens:**
Pepa checks what's already prepped (batch cooking log) — assembly-only meals come first. Then picks 2–3 options from the recipe library that match current stock, ranked by effort (lowest first). Always a named recipe, never a generic suggestion.

---

### Recipe management

**Trigger:** "Save this recipe" or paste/send a recipe.

**What happens:**
Pepa stores it in the recipe library with full metadata: ingredients with exact quantities, step-by-step instructions, effort level, batch-friendliness, family suitability. Future planning sessions can use it immediately.

**Rule:** Pepa always reads the recipe file before giving ingredients or instructions. She never summarizes from memory.

---

## Current limitations

- **No automatic availability detection** — Pepa asks you at the start of each planning session what the week looks like. She cannot pull this from a calendar yet.
- **No automated checkout** — Pepa fills the Continente basket but you complete the purchase yourself.
- **No nutritional tracking** — meal plans don't include macro counts or nutritional breakdowns beyond basic per-recipe notes.
- **No proactive restocking** — Pepa alerts on low stock when you update inventory, but doesn't monitor in the background.
