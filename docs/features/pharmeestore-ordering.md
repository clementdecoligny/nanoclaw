# Pharmeestore Ordering

## HMW

How might we let Pepa place a pharmeestore.com diaper/wipes order with a single user confirmation, the same way she handles Continente?

## Solution hypothesis

Mirror the Continente script pattern exactly. A `scripts/pharmeestore/` directory contains `index.ts` with two commands:
- `prepare` — fetches the user's favourites list from pharmeestore.com, proposes quantities (defaulting to last-order quantities), outputs a structured basket review for Pepa to relay
- `execute` — fills the cart with confirmed quantities, enters the MBWay phone number, outputs confirmation for the user to accept payment on their phone

Pepa calls `prepare`, relays the basket, waits for user confirmation (optionally with quantity corrections), then calls `execute`. A recurring task fires 4 weeks after each successful execute.

## Non-goals

- Placing orders without user confirmation
- Handling products outside the pharmeestore favourites list
- Tracking delivery or syncing post-delivery (no sync-delivery command — pharmeestore doesn't have an order history API we can scrape at this stage)
- Supporting multiple accounts or multiple phone numbers

## Edge cases & decisions

| Edge case | Decision |
|-----------|----------|
| Quantities — who decides? | Pepa proposes last-order qty as default; user corrects before confirming |
| First order — no history | Script proposes qty=1 for all items; Pepa asks user to confirm or adjust |
| Last-order quantities stored where? | Script writes `pharmeestore-last-order.json` to `PHARMEESTORE_GROUP_PATH` after each execute |
| Site down / login fail | Script exits with explicit error message; Pepa reports to user and stops |
| Product missing from favourites on site | Script lists it as `NOT_FOUND`; Pepa surfaces it to user before proceeding |
| Double execute | Pending basket file deleted after execute; second call exits with "no pending basket" error |
| Correction before confirmation | User states changes in natural language; Pepa updates `pharmeestore-pending-basket.json` and re-proposes |
| MBWay phone number | Passed via `PHARMEESTORE_PHONE` env var; script enters it at checkout |
| Recurring reminder — when? | 4 weeks after last execute timestamp (stored in `pharmeestore-last-order.json`) |
| Recurring reminder — what does it say? | Pepa sends a message proposing to prepare the pharmeestore basket; user replies to trigger `prepare` |

## Entity model changes

None. No central DB changes.

## Session DB contract

None. Script communicates via stdout/files only.

## Container boundary

- Script mounted read-only at `/workspace/extra/pharmeestore/` inside Pepa's container
- Credentials injected as env vars: `PHARMEESTORE_EMAIL`, `PHARMEESTORE_PASSWORD`, `PHARMEESTORE_PHONE`
- State files written to `PHARMEESTORE_GROUP_PATH` (defaults to `./groups/pepa`, resolves to `/workspace/agent/` inside container):
  - `pharmeestore-pending-basket.json` — proposed basket awaiting confirmation
  - `pharmeestore-last-order.json` — quantities and timestamp from last successful execute

## API contract

### CLI

```bash
PHARMEESTORE_GROUP_PATH=/workspace/agent npx tsx /workspace/extra/pharmeestore/index.ts prepare
PHARMEESTORE_GROUP_PATH=/workspace/agent npx tsx /workspace/extra/pharmeestore/index.ts execute
```

### prepare output

```
PHARMEESTORE_BASKET_REVIEW
READY: N items, est. total €XX.XX
- [product name] ×Q (last order: Q)

NOT_FOUND:
- [product name]

Confirm quantities or request changes.
```

### execute output

```
PHARMEESTORE_ORDER_DONE
Items added: N
Grand total: €XX.XX
MBWay: +351XXXXXXXXX entered. Accept payment on your phone.
```

### pharmeestore-pending-basket.json

```json
[
  { "id": "string", "name": "string", "qty": 2 }
]
```

### pharmeestore-last-order.json

```json
{
  "executedAt": "ISO timestamp",
  "items": [
    { "id": "string", "name": "string", "qty": 2 }
  ]
}
```

## Affected files

- `scripts/pharmeestore/index.ts` — new
- `scripts/pharmeestore/auth.ts` — new
- `scripts/pharmeestore/client.ts` — new
- `scripts/pharmeestore/types.ts` — new
- `groups/pepa/container.json` — add mount + env vars
- `groups/pepa/reference/pepa-ops.md` — add pharmeestore section

## Products

Fixed list (from user's pharmeestore favourites):
- Diapers size 4 (for Inés)
- Diapers size 5 (for G)
- Wet wipes

Script fetches these from the account's favourites list on the site rather than hardcoding product IDs, so it stays correct if product IDs change.

## Success signal

1. Pepa sends: "🧷 Panier Pharmeestore prêt — 3 articles, ~€XX. Couches T4 ×N, Couches T5 ×N, Lingettes ×N. Ok ?"
2. User replies: "ok"
3. Pepa runs `execute`
4. Pepa sends: "Panier ajouté. Accepte le paiement MBWay sur ton téléphone."
5. User accepts MBWay push → order placed
