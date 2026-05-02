# Scripts Customizations

Scripts are data-like — copy them wholesale from the v1 tree. They are not compiled and don't interact with the NanoClaw source directly. The only dependency is the container Dockerfile layer that installs their runtime dependencies.

---

## Finance Scripts — Copy Verbatim

**Intent:** Python modules for the Edmond finance agent: salary calculation, PDF receipt generation, expense parsing, categorization, and monthly aggregation.

**Source directory:** `scripts/finance/`

**How to apply:**

Copy the entire directory into the upgrade worktree:
```bash
cp -r "$PROJECT_ROOT/scripts/finance/" "$WORKTREE/scripts/finance/"
```

**Contents:**
- `salary.py` — Portuguese domestic worker salary calculator (Decimal arithmetic, hourly €5.75 base, social security, férias/natal provisions)
- `receipt.py` — HTML/PDF receipt generator using WeasyPrint at `/opt/wpenv/bin/python3`
- `excel_parser.py` — ActivoBank Excel export parser
- `categorizer.py` — Transaction categorizer with historical learning
- `aggregator.py` — Monthly expense aggregation with trend comparison
- `test_salary.py`, `test_receipt.py`, `test_excel_parser.py`, `test_categorizer.py`, `test_aggregator.py` — pytest test suites
- `finance.test.ts` — TypeScript integration test wrapper

**Runtime:** All scripts use `/opt/wpenv/bin/python3` (baked into container image via Dockerfile customization).

**Mount:** Finance scripts must be mounted into the finance group's container at `/workspace/extra/finance/`. In v2 this is configured via `groups/finance/container.json` on disk. Create this file after upgrade:

```json
{
  "additionalMounts": [
    {
      "hostPath": "scripts/finance",
      "containerPath": "finance",
      "readonly": true
    }
  ]
}
```

The `containerPath` value is relative to `/workspace/extra/` inside the container, so `"finance"` maps to `/workspace/extra/finance/`. All Edmond's CLAUDE.md references to `/workspace/extra/finance/salary.py` etc. will resolve correctly.

In v1 the equivalent was `containerConfig.additionalMounts` stored in the `registered_groups` table — this moves to the file on disk in v2.

---

## Continente Scripts — Copy Verbatim

**Intent:** TypeScript modules for automated grocery ordering via Continente.pt — resolves shopping lists to product IDs, adds to cart.

**Source directory:** `scripts/continente/`

**How to apply:**

Copy the entire directory into the upgrade worktree:
```bash
cp -r "$PROJECT_ROOT/scripts/continente/" "$WORKTREE/scripts/continente/"
```

**Contents:**
- `index.ts` — Two-phase basket workflow (prepare: match items → execute: add to cart)
- `client.ts` — Continente e-commerce API HTTP client
- `matcher.ts` — Shopping list item → product ID resolver with caching
- `auth.ts` — Email/password authentication
- `orders.ts` — Order history retrieval
- `types.ts` — Type definitions (BasketItem, MatchResult, etc.)
- `matcher.test.ts`, `orders.test.ts` — Test suites
- `debug-cart*.ts` — Debugging utilities (4 files)

**Credentials:** `CONTINENTE_EMAIL` and `CONTINENTE_PASSWORD` are injected from `data/env/env` (see container-runner customization in customizations-src.md). In v2, consider migrating these to OneCLI.

---

## Voice Transcription Script — Copy Verbatim

**Intent:** Local Whisper-based voice transcription, invoked by `src/transcription.ts` on the host.

**Source:** `scripts/transcribe.py`

**How to apply:**

```bash
cp "$PROJECT_ROOT/scripts/transcribe.py" "$WORKTREE/scripts/transcribe.py"
```

**Runtime:** Uses `faster-whisper` (Tiny model, int8, CPU) in a local virtualenv at `.venv/whisper/`. This runs on the HOST, not inside containers.

**Setup (if .venv/whisper doesn't exist on the v2 install):**
```bash
python3 -m venv .venv/whisper
.venv/whisper/bin/pip install faster-whisper
```

---

## Other Scripts — Copy Selectively

**`scripts/cleanup-sessions.sh`** — WhatsApp session cleanup utility. Copy verbatim; may need path adjustments if v2 session storage location changes.

**`scripts/run-migrations.ts`** — Database migration runner. In v2 the DB schema is completely different (`data/v2.db`). Do NOT copy — let v2 handle its own migrations. This script is obsolete after upgrade.
