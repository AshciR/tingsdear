# Part 1 — Save Transaction (`repo.ts`)

## Context

The receipt parser already returns a validated `ParsedReceipt`. We now need the **save half** of the loop: take that object and persist it into the Postgres schema (manufacturer, supermarket_chain, supermarket_location, item, price) inside a single transaction with find-or-create semantics. This is foundational — the API routes and UI in Parts 2 and 3 both depend on it. Tests for this part also drive the Testcontainers Postgres setup that the rest of the integration testing will reuse.

## Implementation

### `src/lib/server/repo.ts`

Export:

```ts
export async function saveParsedReceipt(
  db: Db,
  parsed: ParsedReceipt
): Promise<{ saved: number; chainId: number; locationId: number }>
```

Inside `db.transaction(async (tx) => { ... })`:

1. **Manufacturer** — find row where `lower(name) = 'unknown'`; insert if missing. → `unknownMfrId`.
2. **Chain** — find row where `lower(name) = lower(parsed.supermarket_name)`; insert if missing. → `chainId`.
3. **Location** — find row where `chain_id = chainId AND name = 'Default'`; insert if missing. → `locationId`.
4. **For each `line_item`** (repo does not filter `flagged`; the UI decides what to send):
   - Find `item` where `lower(name) = lower(item.name)`; if missing, insert with `manufacturer_id = unknownMfrId`, `category_id = NULL`, `size_amount = '1'`, `size_unit = 'ct'`, `unit_type = 'count'`, `size_in_base_unit = '1'`. → `itemId`.
   - Insert one `price` row: `location_id = locationId`, `item_id = itemId`, `amount = unit_price.toFixed(2)`, `source = 'receipt_ocr'`, `source_ref = NULL`, `timestamp = new Date(\`${parsed.purchase_date}T00:00:00Z\`)`.
5. Return `{ saved: parsed.line_items.length, chainId, locationId }`.

Notes:
- Use Drizzle helpers from `src/lib/server/db/schema.ts` (already in place).
- Case-insensitive matching via `sql\`lower(${col}) = lower(${value})\`` from `drizzle-orm`.
- All inserts use `.returning({ id: <table>.id })`.
- The PostGIS `geog` column is maintained by the existing trigger — we never write it.

## Files

- **New**: `src/lib/server/repo.ts`
- **Reuse**: `ParsedReceipt` from `src/lib/server/receipt-parser.ts:20`; `Db`, `getDb`, `schema` from `src/lib/server/db/index.ts`; tables from `src/lib/server/db/schema.ts`.

## Testing

### Testcontainers global setup (needed by these tests and Part 2's)

`src/test-setup/global-setup.ts`:

```ts
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import { migrate } from '../lib/server/db/migrate.ts';

export default async function () {
  const container = await new PostgreSqlContainer('postgis/postgis:17-3.5')
    .withStartupTimeout(120_000)
    .start();
  process.env.DATABASE_URL = container.getConnectionUri();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await migrate(pool, 'drizzle/migrations');
  await pool.end();
  return async () => { await container.stop(); };
}
```

Update the **server project** in `vite.config.ts`:

```ts
globalSetup: ['src/test-setup/global-setup.ts'],
testTimeout: 120_000,
pool: 'forks',
fileParallelism: false
```

(postgis/postgis:17-3.5 is amd64-only; under Rosetta the container takes ~30–60 s to come up.)

### `src/lib/server/db/db.test.ts`

- Build a `Pool` from `process.env.DATABASE_URL`; close in `afterAll`.
- Assert all six tables exist (`information_schema.tables`) and the `postgis` extension is installed (`pg_extension`).
- Insert chain + location (with `latitude`/`longitude`) via raw SQL → re-select and assert `geog IS NOT NULL` (proves the trigger fires).
- Insert manufacturer → item → price round-trip via Drizzle to prove typed queries work end-to-end.

### `src/lib/server/repo.test.ts`

- `beforeEach`: `TRUNCATE manufacturer, category, supermarket_chain, supermarket_location, item, price RESTART IDENTITY CASCADE`.
- **Case A — first save**: synthetic `ParsedReceipt` with 2 line items. Assert `chains=1`, `locations=1`, `items=2`, `prices=2`, `manufacturers=1` (Unknown). Verify returned `chainId`/`locationId`/`saved`.
- **Case B — same receipt twice**: after 2nd save, chain/location/item/manufacturer counts unchanged; `prices=4`.
- **Case C — second receipt, same chain, one shared + one new item**: chain/location stable; items grows by 1; prices grows by 2.
- **Case D — case-insensitive matching**: save "HI-LO" then "hi-lo" — `chains=1`.

### Run

```
yarn vitest run --project server
```

Both files green = save transaction works and the integration harness is ready for Part 2.
