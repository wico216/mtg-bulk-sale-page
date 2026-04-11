# Phase 6: Database Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-11
**Phase:** 06-database-foundation
**Areas discussed:** Card primary key, Schema extras, Neon driver choice, Initial seed strategy, Migration strategy, Build pipeline changes, DB directory structure

---

## Card Primary Key

| Option | Description | Selected |
|--------|-------------|----------|
| Keep composite string PK | Use existing string ID as DB primary key. Cart, orders, URLs keep working. | ✓ |
| Auto-increment + unique constraint | Numeric PK with composite string as unique index. | |
| UUID primary key | Random UUID PK with composite string as unique index. | |

**User's choice:** Keep composite string PK
**Notes:** Simple, deterministic, backward-compatible with all existing references.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Integer cents | Avoids floating-point rounding. Standard for money in databases. | ✓ |
| Decimal column (numeric) | Exact dollars using NUMERIC type. Matches current app usage. | |
| You decide | Claude picks. | |

**User's choice:** Integer cents
**Notes:** None.

---

| Option | Description | Selected |
|--------|-------------|----------|
| TEXT[] array | Native Postgres array. Drizzle supports it. Enables array operators. | ✓ |
| JSON column | Flexible but less queryable for filtering. | |
| Comma-separated string | Simplest but requires parsing on read. | |

**User's choice:** TEXT[] array column
**Notes:** User mentioned wanting Scryfall-style query support in the future — TEXT[] enables this natively.

---

## Schema Extras

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, both timestamps | created_at and updated_at with auto-defaults. | ✓ |
| Only created_at | Know when card entered DB. | |
| No timestamps | Keep schema minimal. | |

**User's choice:** Both timestamps
**Notes:** None.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, add status column | Enum: pending, confirmed, completed. | ✓ |
| No status column | Orders are just records. | |
| You decide | Claude picks. | |

**User's choice:** Yes, add status column
**Notes:** None.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Hard delete | Row removed. CSV import does full replace anyway. | ✓ |
| Soft delete | Set deleted_at timestamp. | |
| You decide | Claude picks. | |

**User's choice:** Hard delete
**Notes:** None.

---

| Option | Description | Selected |
|--------|-------------|----------|
| No extras, keep it lean | 12 Card fields + timestamps is sufficient. | |
| Add Scryfall ID column | Store Scryfall UUID. Makes re-enrichment easier. | ✓ |
| You decide | Claude picks. | |

**User's choice:** Add Scryfall ID column
**Notes:** Manabox CSV already exports this field (currently ignored in parsing).

---

| Option | Description | Selected |
|--------|-------------|----------|
| Essential fields only | name, set, price, condition, qty, lineTotal. | |
| Full snapshot including image | Also store imageUrl and oracleText. | |
| You decide | Claude picks based on Phase 11 needs. | ✓ |

**User's choice:** You decide
**Notes:** Deferred to Claude's discretion for Phase 11 order history UI.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Basic indexes now | cards.name, cards.set_code, orders.created_at. | ✓ |
| Primary keys only | Skip indexes, table scans fine for small data. | |
| You decide | Claude picks. | |

**User's choice:** Basic indexes now
**Notes:** None.

---

## Neon Driver Choice

| Option | Description | Selected |
|--------|-------------|----------|
| HTTP driver | One-shot queries over HTTP. Perfect for serverless. | |
| WebSocket driver | Persistent pooled connections. Better for transactions. | |
| Both — HTTP default, WS for transactions | Best of both worlds. More setup. | |
| You decide | Claude picks based on Drizzle + Neon docs. | ✓ |

**User's choice:** You decide
**Notes:** Claude will validate during implementation per STATE.md concern.

---

## Migration Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Drizzle Kit push | Direct apply, no migration files. | ✓ |
| Generated SQL migrations | SQL migration files for traceability. | |
| You decide | Claude picks. | |

**User's choice:** Drizzle Kit push
**Notes:** Solo-dev project, less ceremony preferred.

---

## Build Pipeline Changes

| Option | Description | Selected |
|--------|-------------|----------|
| Keep both for now | Phase 6 adds DB, storefront still reads static JSON. | ✓ |
| Remove generate-data.ts in Phase 6 | Would break storefront before Phase 7. | |
| You decide | Claude handles transition. | |

**User's choice:** Keep both for now
**Notes:** generate-data.ts removal is Phase 7's job.

---

## DB Directory Structure

| Option | Description | Selected |
|--------|-------------|----------|
| src/db/ folder | Dedicated folder: schema.ts, client.ts, seed.ts. | ✓ |
| Under src/lib/ | Add to existing lib pattern. | |
| You decide | Claude picks. | |

**User's choice:** src/db/ folder
**Notes:** None.

---

## Initial Seed Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Seed script reads cards.json | One-time migration using enriched data. | ✓ |
| Seed from CSV + re-enrich | Re-fetch Scryfall data. Slower. | |
| Manual via future CSV import UI | DB empty until Phase 10. | |
| You decide | Claude picks. | |

**User's choice:** Seed script reads cards.json
**Notes:** None.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, upsert on conflict | INSERT ... ON CONFLICT DO UPDATE. Safe to re-run. | ✓ |
| Truncate and re-insert | Wipe then insert. Loses manual edits. | |
| You decide | Claude picks. | |

**User's choice:** Upsert on conflict (idempotent)
**Notes:** None.

---

## Claude's Discretion

- Neon driver choice (HTTP vs WebSocket vs both)
- Order_items snapshot depth (essential vs full including image/oracle)

## Deferred Ideas

- Scryfall-style query system — user wants Scryfall query syntax for searching (e.g., `id:WU`, `c>=RG`)
