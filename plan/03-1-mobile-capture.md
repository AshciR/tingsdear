# Part 3.1 — Mobile Capture

## Context

Part 3 shipped the verify UI and it works on desktop. But the actual product is someone standing in a Jamaican supermarket carpark photographing a receipt with their phone — and that path has never been exercised. Desktop testing uses `training-data/*.jpg`: files that were already cropped, already well-lit, already a sane resolution. A real phone photo is none of those.

This part adds an explicit "take a picture" control and validates the whole loop end-to-end on a physical device over an ngrok tunnel. The goal is not new features — it is finding out what breaks when the input is a 12-megapixel handheld photo of a curled thermal receipt.

This is a **separate work effort** from Part 4. Nothing here blocks location resolution.

## Current state

`src/lib/components/UploadView.svelte` already has:

```svelte
<input type="file" accept="image/*,application/pdf" capture="environment" ... />
```

So the camera is technically reachable on mobile today — but the behaviour is inconsistent and undiscoverable:

- **iOS Safari**: `capture` on an input that also accepts `application/pdf` is unreliable; Safari tends to fall back to its standard action sheet (Photo Library / Take Photo / Choose File) rather than opening the camera directly.
- **Android Chrome**: `capture="environment"` usually jumps straight to the camera, which means a user who wanted to pick an existing photo has no way to do so.

One input cannot serve both intents well. The fix is two controls.

## The real risk: image resolution, not the button

The parser uses `claude-haiku-4-5` (`src/lib/server/receipt-parser.ts:228`), which is a **standard-resolution tier** model: images are downscaled to a **1568 px long edge / 1568 visual token** cap before the model sees them. High-resolution tier (2576 px, 4784 tokens) is Claude 4.7 and later only.

A modern phone camera shoots ~4032×3024. That gets downscaled to roughly 1456×819 — **a ~64% linear reduction**. Small print on a thermal receipt (item codes, unit prices) may not survive that. Every existing `training-data` image is far smaller, so this failure mode has never been visible.

Two other hard limits worth knowing before testing:

- **10 MB per image, base64-encoded**, on the Claude API direct. Base64 inflates by ~33%, so the practical ceiling is a **~7.5 MB source file**. A high-quality phone JPEG can exceed this; today it would surface as an opaque 500 from `/api/receipts/parse`.
- **8000×8000 px** max dimensions. Not a practical concern for phone cameras.

So the two candidate mitigations, to be chosen based on what the device testing actually shows:

1. **Client-side downscale before upload** — resize the long edge to ~1568 px in a canvas before POSTing. Cuts upload time on mobile data and sidesteps the size limit entirely. But it hands the model the same pixels it would have gotten anyway, so it does not improve legibility.
2. **Move the parser to a high-resolution-tier model** for receipts — doubles the effective long edge to 2576 px and roughly triples visual tokens per image. Better small-print fidelity, materially higher per-receipt cost.

Do not pick between these up front. Test first, measure extraction accuracy on real photos, then decide. It is entirely possible Haiku at 1568 px is fine for these receipts and neither change is needed.

## Implementation

### `src/lib/components/UploadView.svelte`

Split the single file input into two labelled controls feeding the same `onFile` callback:

- **Take photo** — `<input type="file" accept="image/*" capture="environment">`, visually a primary button (wrap the input in a `<label>` and hide the input; a bare file input cannot be styled as a button). Image types only — `capture` behaves more predictably without `application/pdf` in the accept list.
- **Choose file** — `<input type="file" accept="image/*,application/pdf">`, no `capture`. This is the desktop path and the "photo I already took" path.

Both hidden inputs need distinct `id`s for their labels. Keep the existing preview and error rendering unchanged.

### Mobile layout

`LineItemRow.svelte` is the problem. Its current row is a horizontal flex with a name input plus three `w-24` number inputs and a delete button — roughly 420 px of fixed-width content before the name field gets anything. On a 390 px viewport (iPhone 15) that overflows horizontally, which is the one thing the page must never do.

Restructure to stack on small screens: checkbox + name on the first line, then the three numbers in a `grid-cols-3` row beneath, reverting to the current single-line layout at `sm:`. The three column headers in `VerifyView.svelte` are positioned for the desktop layout and need to hide below `sm:` — with the stacked layout each number input should carry its own inline label instead.

Also worth checking on-device: `type="number"` inputs should get `inputmode="decimal"` so phones show a numeric keypad rather than the full keyboard.

### `vite.config.ts` — allow the tunnel host

Vite 8 rejects requests whose `Host` header it does not recognise, so the dev server will refuse ngrok traffic with a blocked-host error until it is allowlisted. Add a `server` block:

```ts
server: {
  host: true,                          // bind 0.0.0.0 so the tunnel can reach it
  allowedHosts: ['.ngrok-free.app']    // or the specific reserved subdomain
}
```

This is dev-only configuration and does not affect the production build. Prefer the narrowest host pattern that works.

## Files

- **Modify**: `src/lib/components/UploadView.svelte` (two capture controls), `src/lib/components/LineItemRow.svelte` (responsive row), `src/lib/components/VerifyView.svelte` (responsive headers), `vite.config.ts` (`server.allowedHosts`).
- **Possibly modify, pending test results**: `src/lib/receipt-client.ts` (client-side downscale) or `src/lib/server/receipt-parser.ts` (model change).
- **Reuse**: the existing `onFile` / `previewUrl` plumbing in `UploadView`; `parseReceiptFile` / `saveReceipt` unchanged.

## Verification

`ngrok` is already installed (`/opt/homebrew/bin/ngrok`).

1. Start the database: `docker compose up -d --wait`.
2. `RECEIPT_EXTRACTOR=… yarn dev --host`.
3. `ngrok http 5173` — note the `https://…ngrok-free.app` URL. HTTPS matters: iOS restricts camera access on insecure origins, and the tunnel provides a valid certificate.
4. Open the URL on the phone. Expect the ngrok interstitial on first visit; continue through it.
5. **Take photo** → confirm the camera opens directly (not the photo library), and the preview renders right-side-up. Phone photos carry EXIF orientation; if the preview appears rotated, `img { image-orientation: from-image }` is the fix, and note that the bytes sent to the parser are unrotated regardless.
6. Photograph a real receipt. Watch for: upload time on cellular vs wifi, whether the parse succeeds at all, and a 500 that indicates the 10 MB base64 ceiling.
7. **Compare extraction quality against the desktop baseline.** This is the actual point of the exercise. Same receipt, phone photo vs the `training-data` scan: are item names truncated? Are unit prices misread? Are lines dropped entirely? Record what fails — that evidence decides between the two mitigations above.
8. Verify view on the device: no horizontal page scroll, all inputs reachable, number keypad appears, checkbox and delete targets are tappable.
9. Confirm and check the database, as in Part 3.
10. Repeat on both iOS Safari and Android Chrome if both are available — the capture behaviour differs and only device testing shows which.

## Out of scope

- Camera preview inside the page via `getUserMedia` — the native file-capture flow is enough and avoids a permissions surface.
- In-browser cropping or perspective correction.
- Offline capture / queued uploads for poor supermarket signal.
- PWA install, home-screen icon, service worker.
