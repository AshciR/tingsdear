# Part 3.3 — Duplicate line items at multi-part photo seams

## Context

Part 3.2 shipped multi-part capture: several photos of one long receipt go to the
model in a single turn and come back as one `ParsedReceipt`. It listed seam
de-duplication under _Out of scope_, on the assumption the user would resolve it at
the verify step. Real use says otherwise — consecutive photos overlap, a line or two
repeats at the seam, and the user has to spot and delete each one by hand.

`SYSTEM_PROMPT` already asked the model to merge seam repeats. It did not reliably
do so, and prompt-only de-duplication is treated here as ruled out.

The difficulty is genuine rather than a prompting failure. Two identical rows on the
paper are indistinguishable from one row photographed twice — the only thing that
separates them is position relative to the frame boundary, and the merged parse threw
that away.

### What the training data says

Any rule of the form "same name, same unit price, adjacent" is unusable on real
receipts from these stores:

| receipt       | run                            | genuine? |
| ------------- | ------------------------------ | -------- |
| `receipt-3-5` | 6 × `B/Kist Vanilla` @ `56.03` | yes      |
| `receipt-3-1` | 4 × `Sophie Tissue` @ `93.63`  | yes      |
| `receipt-3-1` | 2 × `Sophie Tissue` @ `95.15`  | yes      |

Adjacency alone would mark all of those. Whatever detects duplicates has to know
where one photo ends and the next begins.

## Approach

### The model reports, the code decides

The model is asked for one new per-line field, `image` — the 1-based index of the
photograph it read that line from — and is explicitly told **not** to merge seam
repeats but to transcribe every line in every photo. Reporting what a photo shows is
something it is reliably good at; deciding which repeats are one purchase is not.

`markSeamDuplicates` in `src/lib/server/receipt-seams.ts` then compares **only** across
frame boundaries: the longest run of lines that ends one photo and repeats at the start
of the next. A run inside a single photo is never a candidate, so receipt 3's six
identical snacks are untouched. The run is bounded by each frame's own extent, so it can
never reach past a neighbouring seam, and capped at 12 lines.

`image` is optional in the schema: a single-photo parse has no seams, and a response
that omits the field simply yields no seams and no marks.

### A separate flag, and it does not exclude

`flagged` means two things today — "this is suspicious" and "leave it out of the save"
(`save/+server.ts` filters on it) — and `LineItemRow` hardcodes its one reason. Reusing
it for duplicates would make that warning text wrong and would pre-exclude lines.

So seam suspicion gets its own field, `possible_duplicate`, and the two are computed
independently in `parseReceipt`. A suspected duplicate **stays ticked**: spotting is the
hard part, unticking is one click, and a false positive then costs a glance rather than a
lost purchase. `VerifyView` says how many there are so they are findable in a 75-line
receipt; `LineItemRow` gives them their own note in a colour distinct from the yellow
exclusion warning.

## Files

- **Add**: `src/lib/server/receipt-seams.ts`, `src/lib/server/receipt-seams.test.ts`.
- **Modify**: `src/lib/server/receipt-parser.ts` (schema, prompt, annotation),
  `src/lib/components/LineItemRow.svelte`, `src/lib/components/VerifyView.svelte`,
  `scripts/smoke-parse.ts` (which was still on the pre-3.2 single-file signature and
  could not reproduce a multi-part parse at all). It also could not run under `tsx`,
  which cannot resolve the `$env/dynamic/private` virtual module — hence
  `scripts/env-shim.ts`, `scripts/tsconfig.json`, and the `smoke:parse` script.
- **Unchanged**: `save/+server.ts` and `repo.ts` — `toSaveRequest` already narrows to
  `{ name, unit_price }`, so the new fields never reach the database.

## Verification

1. `yarn test`, `yarn check`, `yarn lint`.
2. `yarn smoke:parse training-data receipt-3` — the five parts now go in as one call and
   write `training-data/extractions/receipt-3-result.json`. Check the seam repeats are
   marked and the in-frame runs are not.
3. The same for `receipt-8`.

Both were run against the live API. Receipt 3 came back as 73 lines under
`General Food Supermarket`, with the four `Sophie Tissue` @ `93.63` and five
`B/Kist Vanilla` @ `56.03` runs correctly left alone; its frames barely overlap, so
nothing was marked. Receipt 8 came back as 64 lines under `Sovereign Supermarket` with
exactly one mark: `Holiday Cheese Puff 20g` @ `63.12`, repeated across the image 2→3
seam. The same product at the same price further inside image 3 was left alone.

## Out of scope

- Dropping duplicates automatically. The user confirms; see the reasoning above.
- Stitching images into one tall composite before parsing.
