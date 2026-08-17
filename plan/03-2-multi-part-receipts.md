# Part 3.2 — Multi-part receipts and the missing store header

## Context

A long supermarket receipt does not fit in one photo. `training-data/` already
records this: `receipt-3-1` … `receipt-3-5` are five photographs of a single
General Food receipt, and `receipt-8-1` … `receipt-8-5` are five of another.
Only the **first** frame contains the store header — the name, branch and
address are printed once, at the top of the paper.

The app has no concept of a receipt spanning several images. It parses one file
per scan, and every scan is treated as a complete, self-contained receipt.

### What actually happens today

Not a 404 — there is no `404` anywhere in `src/`. The failure is quieter and
worse: **a nameless receipt saves successfully under a fabricated store.**

`src/lib/server/db/repo.ts:46`

```ts
const chain = await findOrCreateChain(tx, receipt.supermarket.name ?? 'Unknown');
```

and `src/lib/server/db/repo.ts:104`

```ts
const name = supermarket.branch ?? 'Default';
```

`supermarketSchema` in `src/lib/server/receipt-parser.ts:5-14` makes every store
field `.optional()` with `.default({})`, so `POST /api/receipts/save` validates
a receipt with `supermarket: {}` without complaint. The user sees the normal
"Saved N prices" screen.

Surveying `training-data/extractions/`:

| receipt | extracted name             | line items |
| ------- | -------------------------- | ---------- |
| 3-1     | `General Food Supermarket` | 15         |
| 3-2     | _(absent)_                 | 26         |
| 3-3     | _(absent)_                 | 19         |
| 3-4     | _(absent)_                 | 0          |
| 3-5     | `General Food`             | 15         |

So scanning parts 2–4 of that one receipt files **45 prices under a chain
literally named "Unknown"**, at a location named "Default". Prices from
completely unrelated supermarkets collapse into that same bogus chain, and the
price history the whole product exists to build is silently poisoned.

Part 3-5 shows the second, subtler failure: `General Food` is not
`General Food Supermarket`, and `findOrCreateChain` matches on
`lower(name)` (`repo.ts:89`). A near-miss creates a **duplicate chain**,
splitting one store's history across two rows. A partial name is not safer than
no name — it is harder to notice.

Both failure modes are invisible. Nothing in the verify UI draws attention to an
empty store name: `VerifyView.svelte` renders the `Name` field like any other,
blank and unremarkable, and `normalizeReceipt` in `src/lib/receipt-client.ts`
actively _strips_ blank supermarket fields before POSTing.

## Goals

1. A receipt with no resolvable store must never save under a placeholder name.
2. A user should be able to scan one receipt as several photos and get one
   receipt out.
3. Near-miss names should not silently mint duplicate chains.

## Approach

Three changes, in increasing order of cost. (1) is a safety net worth having
regardless of whether (2) and (3) ever ship.

### 1. Stop inventing store names — refuse instead

Remove the `?? 'Unknown'` fallback in `repo.ts:46`. `ReceiptSaveRequest`'s
`supermarket.name` becomes required; `saveReceipt` throws if it is missing or
blank, and `POST /api/receipts/save` maps that to a **400** with a message the
UI can show. Tighten `parsedReceiptSchema` at the save boundary so a blank name
fails validation — note the _parser_ must keep `name` optional, because "the
model found no header" is a legitimate parse result for part 3 of 5.

Keep the `?? 'Default'` location-name fallback. A missing _branch_ is normal —
`receipt-1`, `4`, `5`, `6`, `7` all lack one — and unlike the chain name it is
scoped under a real chain, so it does not merge unrelated stores.

In `VerifyView.svelte`, surface the requirement before the round-trip: mark the
`Name` field as required, and disable "Confirm and save" while it is empty with
a short note explaining why. The field is already editable, so the user's
recovery path — type the store name in — costs one interaction.

### 2. Multi-image capture: one receipt, several photos

Let the upload step accept an ordered list of images instead of one file.

- `UploadView.svelte`: add `multiple` to the **Choose file** input, and let
  **Take photo** append successive shots to a list rather than replacing the
  selection. Render the list as ordered thumbnails with remove and reorder —
  order matters, since only the first frame carries the header and the parser
  needs the parts in reading order.
- `src/routes/+page.svelte`: `file: File | null` becomes `files: File[]`.
- `receipt-client.ts`: `parseReceiptFile` appends each file to the same
  `FormData` under `file`.
- `parse/+server.ts`: read `form.getAll('file')`, validate each media type
  against the existing `RECEIPT_MEDIA_TYPES`.
- `receipt-parser.ts`: send all images in one user turn as consecutive image
  blocks so the model sees the whole receipt at once — the header from frame 1
  and the tail items from frame 5 in a single context. The system prompt needs
  to say the images are ordered parts of one receipt and that the store header
  appears only on the first. One `ParsedReceipt` comes back, so `saveReceipt`
  and the verify UI need no change.

Watch the size ceiling here: the mobile test in Part 3.1 measured a single phone
photo at 2.3 MB, so five parts is ~11.5 MB and **exceeds the 10 MB base64 API
limit**. Multi-image capture is therefore the point at which the client-side
downscale deferred in Part 3.1 stops being optional. Resize each frame's long
edge to 1568 px — the cap `claude-haiku-4-5` applies anyway — before upload.

### 3. Guard against near-miss chain names

`findOrCreateChain` matches on exact `lower(name)`. Before creating a chain,
check for an existing one that is a close match (prefix, or trigram similarity
via `pg_trgm`) and return the candidates instead of inserting. The verify UI
offers them: "Did you mean _General Food Supermarket_?" This is closely related
to the location work in `plan/04-0-location-resolution.md` and may belong there
rather than here — decide when Part 4 is scoped.

## Files

- **Modify**: `src/lib/server/db/repo.ts` (drop the `'Unknown'` fallback, require
  a chain name), `src/routes/api/receipts/save/+server.ts` (400 on missing
  name), `src/lib/components/VerifyView.svelte` (required-name affordance).
- **Modify for (2)**: `src/lib/components/UploadView.svelte`,
  `src/routes/+page.svelte`, `src/lib/receipt-client.ts`,
  `src/routes/api/receipts/parse/+server.ts`,
  `src/lib/server/receipt-parser.ts`.
- **Reuse**: `RECEIPT_MEDIA_TYPES`, `parsedReceiptSchema`, `normalizeReceipt`,
  the `previewUrl` object-URL lifecycle in `UploadView`.

## Verification

1. **Regression on the silent path**: POST a receipt with `supermarket: {}` to
   `/api/receipts/save` and assert a 400 — today it returns 200. This is the
   test that should have existed; add it to
   `src/routes/api/receipts/save/server.test.ts`.
2. Assert no `supermarket_chain` row named `Unknown` exists after the suite runs.
3. Scan `receipt-3-2` alone through the UI: "Confirm and save" is disabled until
   a store name is typed.
4. Scan `receipt-3-1` … `receipt-3-5` as one multi-part capture: one receipt
   comes back, named `General Food Supermarket` from frame 1, with roughly
   75 line items — and crucially **one** chain row, not two.
5. Re-run the same five parts as `receipt-8-1` … `receipt-8-5`.
6. On-device over the ngrok tunnel, per Part 3.1: confirm five photos upload
   within the size limit after downscaling, and check the total round-trip —
   a single frame took 7.5 s, so five is the latency worth measuring.

## Out of scope

- Automatic detection that two _separate_ scans belong to the same receipt.
  Multi-part is an explicit user action here.
- Stitching images into one tall composite before parsing.
- De-duplicating overlapping line items where consecutive photos capture the
  same rows — the user resolves that in the verify step. _Revisited: it happened
  often enough to want a proper fix. See `plan/03-3-seam-duplicates.md`._
