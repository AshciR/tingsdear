# Part 4 — Supermarket Location Resolution

## Context

The parser now returns a structured `supermarket` object (`name`, `branch`, `address`, `city`, `region`, `country`), all optional. The problem: two users scanning receipts from the **same physical store** will get different free text — "Super Valu Constant Spring", "Super Valu Fresh Foods", "Constant Spring", or `{}` on a continuation page. If we insert a new `supermarket_location` row per extraction, the same store fragments into many rows and price history becomes meaningless.

**Principle: the extracted `supermarket` object is a resolution *query*, not a record.** It points at a canonical row in `supermarket_chain` / `supermarket_location`; it never becomes the source of truth by itself. The dedup decision happens at the **verify** step, while the user is present and context is freshest — confirm-with-suggestions, not silent auto-merge.

This supersedes Part 1's placeholder, where `repo.ts` find-or-creates a single location named `'Default'` per chain. That was fine for the tracer but collapses every branch into one row; this part replaces it with real resolution.

## Flow

```
upload → parse → RESOLVE → verify → save
                    │           │
                    │           └─ user confirms chain + picks a location
                    │              candidate (or "new branch")
                    └─ server matches extracted text against existing
                       chain + location rows, returns ranked candidates
```

1. **Parse** (existing) → `ParsedReceipt` with a `supermarket` object.
2. **Resolve** (new, server-side) → take `supermarket`, return:
   - the matched/created `chainId` (+ name), and
   - a ranked list of candidate `supermarket_location` rows for that chain, each with a match score, plus a synthetic "Create new branch" option pre-filled from the extraction.
3. **Verify** (UI) → the user sees the chain (editable) and a location picker defaulting to the top candidate above a confidence threshold; otherwise defaulting to "Create new branch". On a `{}` continuation page, no candidate is pre-selected — the user picks the store manually (it may be the same receipt's first page they already scanned).
4. **Save** → the chosen `locationId` (existing or newly created) flows into `saveParsedReceipt`; price rows attach to that one canonical location.

## Resolution strategy

### Chain (coarse, high-confidence)

Find-or-create on a **normalized** name, not raw text:
- lowercase, trim, collapse whitespace, strip a small stopword set (`supermarket`, `food stores`, `fresh foods`, `home centre`, trailing punctuation).
- So "Super Valu Fresh Foods" and "Super Valu Home Centre" both normalize to `super valu` → same `chainId`, different locations. ("Fresh Foods" / "Home Centre" are branch labels, not chains.)
- Keep a `chain_alias` table (or a `normalized_name` unique column on `supermarket_chain`) so manual merges stick.

### Location (fine, needs a human)

Within the resolved `chainId`, score each existing location against the extracted fields and rank:

1. **Geo proximity** (strongest) — if both the extraction and the row have lat/lng, distance < ~150 m ⇒ near-certain same store. Receipts rarely print coordinates, so this mostly helps once a location has been geocoded once.
2. **Normalized address** — normalize street lines (`road→rd`, `1/2`, unit/shop numbers) and compare; exact match ⇒ high score.
3. **Branch / city / region tokens** — weaker signal, breaks ties (e.g. branch "Constant Spring" vs "Liguanea").

Combine into a 0–1 score. Two thresholds:
- **≥ high** → pre-select that candidate in the verify UI (user just confirms).
- **between low and high** → show as a suggestion but default to "Create new branch."
- **< low / no fields / `{}`** → no pre-selection; user picks or creates.

Never auto-merge below the high threshold without a confirm — a wrong merge corrupts shared price history and is hard to unwind.

## Implementation sketch

### `src/lib/server/location-resolver.ts` (new)

```ts
export type LocationCandidate = {
  location: SupermarketLocation | null; // null = "create new"
  score: number;                        // 0–1
  reason: 'geo' | 'address' | 'branch' | 'new';
};

export function normalizeChainName(raw: string): string;
export function normalizeAddress(raw: string): string;

// Read-only: resolve chain (find-or-create) + rank location candidates.
export async function resolveSupermarket(
  db: Db,
  s: ParsedReceipt['supermarket']
): Promise<{ chainId: number; chainName: string; candidates: LocationCandidate[] }>;
```

- `resolveSupermarket` find-or-creates the chain (it's safe/idempotent), but **only ranks** locations — it does not create one. Creation happens at save, from the user's choice, so a user who abandons verify leaves no orphan branch.

### `repo.ts` change

`saveParsedReceipt` gains an explicit `locationId | { createFrom: supermarket }` input instead of always using `'Default'`:
- if `locationId` given → attach prices to it;
- if `createFrom` → insert a new `supermarket_location` (chainId + extracted address fields, lat/lng null until geocoded), then attach.

### API

- Fold resolution into the parse response, or add `POST /api/receipts/resolve` taking the `supermarket` object and returning `{ chainId, chainName, candidates }`. The save route accepts the resolved `locationId`.

### UI (extends Part 3 verify view)

- Replace the single supermarket text input with: chain field (editable, defaults to resolved name) + a location `<select>` of candidates (`"Constant Spring — 144 Constant Spring Rd (suggested)"`, …, `"+ New branch"`). Pre-select per the threshold rules above.

## Files

- **New**: `src/lib/server/location-resolver.ts`.
- **Modify**: `src/lib/server/repo.ts` (Part 1 — replace `'Default'` location logic), API routes (Part 2), `src/routes/+page.svelte` verify view (Part 3).
- **Maybe**: migration adding `supermarket_chain.normalized_name` (unique) and/or a `chain_alias` table for sticky manual merges.
- **Reuse**: `ParsedReceipt` / `supermarket` shape from `src/lib/server/receipt-parser.ts`; tables from `src/lib/server/db/schema.ts` (`supermarket_chain`, `supermarket_location` already carry address + lat/lng).

## Testing

`src/lib/server/location-resolver.test.ts` (unit, no DB needed for normalizers):
- `normalizeChainName`: "Super Valu Fresh Foods" and "Super Valu Home Centre" → `super valu`; "Loshusan Supermarket" → `loshusan`.
- `normalizeAddress`: "144 Constant Spring Road" ≈ "144 Constant Spring Rd".

`resolveSupermarket` against Testcontainers DB (reuses Part 1 harness):
- Seed chain + one location at "144 Constant Spring Rd". Resolve an extraction with city-only "Constant Spring" → that location ranks top with a sub-high score (suggested, not auto). Resolve with the exact address → high score (pre-select).
- Resolve `{}` (continuation page) → chain unresolved or carried from session; candidates list is just "create new" / empty; nothing pre-selected.
- Two different addresses under the same chain → two distinct candidates, neither auto-merged.

Manual: scan two receipts from the same Super Valu branch with differently-worded headers; confirm the verify UI suggests the existing location the second time and only one `supermarket_location` row exists after both saves.

## Open questions

- **Geocoding**: do we geocode an address (Google/Nominatim) at create time to populate lat/lng and make future geo-matching reliable? Strongest long-term dedup signal, but adds an external dependency.
- **Admin merge**: when bad dupes slip through, we'll want a "merge location A into B" operation that repoints `price.location_id`. Out of scope here, but the schema should anticipate it.
