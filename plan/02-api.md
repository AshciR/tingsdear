# Part 2 — API Routes

## Context

With the parser (`receipt-parser.ts`) and the save transaction (Part 1's `repo.ts`) in place, expose them over HTTP so the Svelte UI in Part 3 can call them. Two routes: one accepts a multipart upload and returns parsed JSON; the other accepts the (possibly edited) JSON and persists it. Keep the routes thin — all logic lives in the lib modules.

## Implementation

### `src/routes/api/receipts/parse/+server.ts`

```ts
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { parseReceipt, type ReceiptMediaType } from '$lib/server/receipt-parser.ts';

const ALLOWED: ReceiptMediaType[] = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'
];

export const POST: RequestHandler = async ({ request }) => {
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) throw error(400, 'Missing "file" field');
  if (!ALLOWED.includes(file.type as ReceiptMediaType)) {
    throw error(400, `Unsupported content type: ${file.type}`);
  }
  const buf = Buffer.from(await file.arrayBuffer());
  try {
    const parsed = await parseReceipt(buf, file.type as ReceiptMediaType);
    return json(parsed);
  } catch (e) {
    throw error(500, (e as Error).message);
  }
};
```

### `src/routes/api/receipts/save/+server.ts`

```ts
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { parsedReceiptSchema } from '$lib/server/receipt-parser.ts';
import { getDb } from '$lib/server/db/index.ts';
import { saveParsedReceipt } from '$lib/server/repo.ts';

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json();
  const result = parsedReceiptSchema.safeParse(body);
  if (!result.success) throw error(400, result.error.message);
  const out = await saveParsedReceipt(getDb(), result.data);
  return json(out);
};
```

## Files

- **New**: `src/routes/api/receipts/parse/+server.ts`, `src/routes/api/receipts/save/+server.ts`.
- **Reuse**: `parseReceipt`, `parsedReceiptSchema`, `ReceiptMediaType` from `src/lib/server/receipt-parser.ts`; `getDb` from `src/lib/server/db/index.ts`; `saveParsedReceipt` from Part 1.

## Testing

### `src/routes/api/receipts/parse/server.test.ts`

Import the route's `POST` directly and call with a fake `RequestEvent`. Stub the Anthropic client by injecting one — easiest path: refactor the route to accept an optional client only if needed; for the tracer it's simpler to **mock `parseReceipt` with `vi.mock('$lib/server/receipt-parser.ts', ...)`**.

- Happy path: form data with a valid `image/jpeg` `File` → 200 + JSON body equals the stubbed parsed receipt.
- Missing `file` field → 400.
- Unsupported content type (`text/plain`) → 400.
- Parser throws → 500 with the error message.

### `src/routes/api/receipts/save/server.test.ts`

Uses the live Testcontainers DB from Part 1's global setup (no mocking).

- `beforeEach`: truncate all six tables.
- Happy path: build a valid `ParsedReceipt`, POST → 200 + body `{ saved, chainId, locationId }`. Re-query DB to assert one chain, one location, N items, N prices.
- Bad body (missing `currency`) → 400.
- Body is not JSON → handled by `request.json()` throwing; document expected behavior (SvelteKit returns 400 automatically — assert non-200).

### Run

```
yarn vitest run --project server
```

All Part 1 + Part 2 tests green.

### Manual smoke

```
DATABASE_URL=postgres://postgres:postgres@localhost:55432/tdd \
RECEIPT_EXTRACTOR=… \
yarn dev
```

`curl -F file=@training-data/receipt-1.jpg http://localhost:5173/api/receipts/parse` should return parsed JSON. Pipe that body into `/api/receipts/save` and verify DB rows.
