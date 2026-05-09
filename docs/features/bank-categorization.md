# Bank Transaction Categorization — Edmond Feature Spec

## HMW
How might we give Edmond a way to receive monthly Excel bank exports from two accounts and get every transaction row categorized automatically, using 18 months of historical labeled data to maximize accuracy?

## Solution Hypothesis
We build three Python scripts mounted into Edmond's container (`/workspace/extra/finance/`) that implement a hybrid categorization pipeline: exact-match lookup against 18 months of historical data for known merchants, Claude-powered inference for unknowns. On the 1st of each month, a scheduled message prompts Edmond to ask the user for both Excel files. Edmond parses them, categorizes every row (CATEGORY + SUB-CATEGORY), and sends back two Excel files with the new columns appended. Confirmed categorizations are persisted so accuracy improves over time.

**Success signal:** User uploads two `.xlsx` files → Edmond replies with two `.xlsx` files, each with a `CATEGORY` and `SUB-CATEGORY` column filled in for every row, with no manual intervention required for previously-seen merchants.

## Non-goals
- Analytics, summaries, or trend reports (separate feature to follow)
- Learning from Edmond's corrections at runtime (static lookup table for now)
- Handling non-ActivoBank export formats
- Any host-side changes (this is container-only)

## Category / Sub-category Taxonomy

```
BABYSITTING
  └── BABYSITTING

EAT OUT
  ├── BACKERY
  ├── PADARIA
  ├── QUIOSQUE
  ├── RESTAURANT
  └── UBER EATS

EDUCATION
  └── ESCOLA

EMPREGADA
  ├── EMPREGADA
  └── SEGURANCA SOCIAL

GROCERIES
  ├── SUPER
  └── SUPER ONLINE

HEALTH
  ├── COUCHES
  ├── HOSPITAL
  ├── MEDIS
  ├── MEDIS REIMBURSMENT
  └── PHARMACY

HOLIDAY
  ├── ALPS JULY 2026
  ├── HOTELS
  ├── MISC
  └── TRANSPORT

HOUSE
  ├── DONA AJUDA
  ├── EDP
  ├── EPAL AGUA
  ├── FURNITURE
  ├── MISC
  ├── NOS
  ├── NOS INTERNET
  └── SPOTIFY

KIDS
  ├── BABYSITTING
  ├── LEISURE
  ├── MISC
  ├── PISCINA
  ├── ROPA
  └── ROPA VINTED

MOBILITY
  ├── BOLT
  ├── COOLTRA
  ├── PUBLIC TRANSPORT
  ├── TRANSPORT
  └── UBER

RENT
  └── RENT

VOITURE
  ├── ESSENCE
  ├── MECHANIC
  └── VIA VERDE

CASH
  └── CASH

LEISURE
  └── (free-form — Claude infers sub-category)

FURNITURE
  └── FURNITURE

GIFT
  └── GIFT

MISC
  └── MISC

UNCLASSIFIED
  └── UNCLASSIFIED
```

## Entity Model Changes
None — this is container-side only. No host DB changes.

## Session DB Contract
None — standard file-upload flow via Telegram attachment → Edmond reads from `/workspace/extra/bank-exports/` or `/tmp/`. No new DB fields.

## Container Boundary
- **Host → container:** User uploads `.xlsx` files via Telegram; the Telegram adapter delivers them as file attachments that Edmond downloads to `/tmp/`.
- **Container → host:** Edmond sends categorized `.xlsx` files back via `mcp__nanoclaw__send_document`.
- **Persistent mount:** `/workspace/extra/finance/` ← `groups/finance/finance/` (readonly, scripts live here)
- **Persistent mount:** `/workspace/extra/bank-exports/` ← `/home/clem/finance-data/bank-exports/` (read-write, drop zone for historical data)

## API Contract

### excel_parser.py
```
Usage: python3 excel_parser.py <file_path> --account personal|joint [--json]

Input:  ActivoBank .xlsx with columns: Data Lanc., Data Valor, Descrição, Valor, Saldo
Output: JSON array of transaction objects:
  {
    "date": "YYYY-MM-DD",       # Data Lanc.
    "value_date": "YYYY-MM-DD", # Data Valor
    "description": "...",
    "amount": -47.30,           # negative = debit, positive = credit
    "balance": 1234.56,
    "account": "personal"|"joint"
  }
```

### categorizer.py
```
Usage: python3 categorizer.py <transactions_json> \
         --history <history_dir> \
         --output <output_json> \
         [--model claude-sonnet-4-6]

Input:  JSON array from excel_parser.py
        history_dir: directory of historical .xlsx files (Date, Description, Valor, CATEGORY, SUB-CATEGORY)
Output: Same array with two new fields per transaction:
  {
    ...,
    "category": "GROCERIES",
    "sub_category": "SUPER",
    "confidence": "exact"|"claude"
  }

Strategy:
  1. Build lookup table: normalize(description) → {category, sub_category} from all history files
  2. For each transaction: if normalize(description) in lookup → assign, confidence="exact"
  3. Remaining transactions: batch-call Claude with taxonomy + 20 random historical examples as few-shot
  4. Parse Claude's JSON response, assign, confidence="claude"
  5. Persist new "claude" categorizations back to lookup (learned_categories.json in history_dir)
```

### excel_writer.py
```
Usage: python3 excel_writer.py <transactions_json> \
         --output <output_xlsx> \
         --account personal|joint

Input:  Categorized JSON array
Output: .xlsx file with columns:
  Data Lanc. | Data Valor | Descrição | Valor | Saldo | CATEGORY | SUB-CATEGORY
```

## Affected Files

### New files (to create)
| File | Purpose |
|------|---------|
| `groups/finance/finance/excel_parser.py` | Parse ActivoBank .xlsx → JSON |
| `groups/finance/finance/categorizer.py` | Hybrid lookup + Claude categorization |
| `groups/finance/finance/excel_writer.py` | Write categorized JSON → .xlsx |

### Existing files (to update)
| File | Change |
|------|--------|
| `groups/finance/CLAUDE.local.md` | Update script paths, add monthly schedule trigger, add sub-category handling |
| `groups/finance/container.json` | Add historical data mount + pip packages (openpyxl, anthropic) |

## Monthly Schedule Trigger
On the 1st of each month, Edmond sends:
> "Novo mês! Por favor envia-me os dois extratos do ActivoBank (conta pessoal e conta conjunta) para categorizar as despesas de [mês anterior]."

Implemented via `mcp__nanoclaw__schedule_message` (recurring, day 1 of month). Edmond sets this up on first run if not already scheduled.

## Historical Data Bootstrap
The user has 18 months of pre-categorized data in the format:
`Date | Description | Valor | CATEGORY | SUB-CATEGORY`

These files should be placed in `/home/clem/finance-data/bank-exports/historical/` (mounted at `/workspace/extra/bank-exports/historical/`). The categorizer reads all `.xlsx` files in that directory to build the lookup table.

## Implementation Notes — Backend
*(filled in after Phase 3)*

## Implementation Notes — Frontend / Scripts
*(filled in after Phase 4)*
