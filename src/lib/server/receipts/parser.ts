import Anthropic from '@anthropic-ai/sdk';
import { env } from '$env/dynamic/private';
import { z } from 'zod';
import { SUPERMARKET_NAME_REQUIRED } from '$lib/receipt-messages';
import { markSeamDuplicates } from './seams.ts';

const supermarketFields = z.object({
	name: z.string().optional(),
	branch: z.string().optional(),
	address: z.string().optional(),
	city: z.string().optional(),
	region: z.string().optional(),
	country: z.string().optional()
});

// The parser keeps every field optional: "this page has no supermarket header" is a legitimate
// parse result for part 3 of a 5-part receipt.
const supermarketSchema = supermarketFields.default({});

export const parsedReceiptSchema = z.object({
	supermarket: supermarketSchema,
	purchase_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
	line_items: z.array(
		z.object({
			name: z.string().min(1),
			quantity: z.number(),
			unit_price: z.number(),
			total: z.number(),
			// Which photograph this line was read from, 1-based. Optional: a single-image parse
			// has no seams, and a response that omits it still validates — seam detection then
			// has nothing to work with and leaves every line alone.
			image: z.number().int().min(1).optional(),
			flagged: z.boolean().default(false),
			possible_duplicate: z.boolean().default(false)
		})
	),
	currency: z.string().length(3),
	confidence: z.enum(['low', 'medium', 'high'])
});

export type ParsedReceipt = z.infer<typeof parsedReceiptSchema>;

// Saving is a stricter boundary than parsing: a blank supermarket name would otherwise be filed
// under an invented chain, mixing unrelated supermarkets into one price history. Note the
// absent `.default({})` — an omitted `supermarket` key must fail here, not default to `{}`.
export const receiptSaveSchema = parsedReceiptSchema.extend({
	supermarket: supermarketFields.extend({
		name: z.string().trim().min(1, SUPERMARKET_NAME_REQUIRED)
	})
});

export type ReceiptSaveBody = z.infer<typeof receiptSaveSchema>;

// Lines whose name starts with one of these tokens are almost always not products:
// section/department headers, subtotals, taxes, payment rows, bundle-pricing artifacts.
// We flag rather than drop so the verify UI can show them and the user can confirm.
const NON_ITEM_PATTERN =
	/^(discount|sub[\s-]?total|total|tax|gct|vat|change|tender|cash|card|balance|payment|package\s+price|grocery[\s-]?(non[\s-]?)?foods?|produce|dairy|meat|frozen|bakery|deli)\b/i;

export const RECEIPT_MEDIA_TYPES = [
	'image/jpeg',
	'image/png',
	'image/webp',
	'image/gif',
	'application/pdf'
] as const;

export type ReceiptMediaType = (typeof RECEIPT_MEDIA_TYPES)[number];

const SYSTEM_PROMPT = `You are a receipt-parsing assistant. Your job is to extract structured data from a photograph of a supermarket receipt and return it as valid JSON.

The receipt is most likely from a Jamaican supermarket — common chains include Hi-Lo Food Stores, MegaMart, PriceSmart, Progressive Grocers, Loshusan, General Food Supermarket, Shoppers Fair, and SuperPlus. It may also be from any other retailer worldwide. Do not assume the chain; read it from the receipt header.

## Input

You may be given **one image or several**. When there are several, they are consecutive
photographs of a **single** receipt, in reading order: image 1 is the top of the paper, image 2
continues where image 1 ended, and so on. Treat them as one continuous receipt and return
**one** JSON object covering all of them.

- The store header — name, branch, address — is printed once, at the top, so it appears **only
  on the first image**. Apply it to the whole receipt.
- Consecutive photos often **overlap**, repeating a line or two at the seam. Do **not** try to
  merge those repeats. Transcribe every line you can see in every image, exactly as it appears
  there. If a line is visible at the end of image 2 and again at the start of image 3, emit it
  **twice** — once for each image. Sorting out which repeats are one purchase is handled later,
  and it can only be done if you report what each photo actually shows.
- Tag every line with \`image\`: the 1-based index of the photograph you read it from. This is
  the only record of where one photo ends and the next begins, so it must be accurate.
- Read the line items in image order, so the output preserves the order printed on the paper.

## Your task

Given the receipt image(s), extract:

1. The supermarket — its name and, if printed, its location (branch, address, city, region, country)
2. The purchase date
3. Every line item with its quantity, unit price, and line total
4. The currency
5. Your confidence in the extraction

Then return a single JSON object matching the schema below. Return ONLY the JSON — no preamble, no explanation, no markdown code fences.

## Output schema

\`\`\`json
{
  "supermarket": {
    "name": "string",
    "branch": "string",
    "address": "string",
    "city": "string",
    "region": "string",
    "country": "string"
  },
  "purchase_date": "YYYY-MM-DD",
  "line_items": [
    {
      "name": "string",
      "quantity": number,
      "unit_price": number,
      "total": number,
      "image": number
    }
  ],
  "currency": "JMD" | "USD" | "<other ISO-4217 code>",
  "confidence": "low" | "medium" | "high"
}
\`\`\`

## Field rules

**supermarket**: An object describing the store. All fields are optional — include only what is legibly printed and omit any field you can't read (do not guess).
- \`name\`: The chain's recognizable name (e.g. "Hi-Lo", "MegaMart"), not the specific branch.
- \`branch\`: The specific branch or store label if shown (e.g. "Barbican", "Liguanea").
- \`address\`: The street address line as printed.
- \`city\`, \`region\`, \`country\`: Fill in if discernible from the address (region = parish/state).

**Split receipts**: A long receipt may be photographed across several parts, and only the first carries the store header. If you were given several images, take the store details from the first one that shows them. If NONE of the images you were given has readable supermarket information — a lone continuation page, say — return \`"supermarket": {}\` (an empty object). This is expected and normal: do NOT invent a name, and do NOT lower confidence merely because the header is absent.

**purchase_date**: Always ISO format \`YYYY-MM-DD\`. Jamaican receipts commonly print dates as DD/MM/YYYY or DD-MM-YYYY — interpret them as day-first, not month-first. If the date is ambiguous or missing, use today's date and set confidence to at most "medium".

**line_items**: One entry per purchased product. Skip subtotals, taxes (GCT), discounts, totals, change due, payment method, loyalty messages, **section/department headers** (e.g. "Grocery-Foods", "Grocery Non-Foods", "Produce", "Dairy", "Meat"), and **package/bundle pricing rows** (e.g. "Package Price", "Package Price Discount"). If a single line shows a quantity multiplier (e.g. "2 @ 250.00"), record \`quantity: 2\`, \`unit_price: 250.00\`, \`total: 500.00\`. If quantity isn't shown, default to \`1\` and set \`unit_price\` equal to \`total\`. Strip trailing product codes, SKUs, and department numbers from \`name\` — keep just the human-readable product description, title-cased.

**image**: The 1-based index of the photograph this line was read from — \`1\` for the first image you were given, \`2\` for the second, and so on. Omit it when you were given only one image. Never guess: if the same line appears in two photos, that is two entries with two different \`image\` values, not one entry.

**unit_price** and **total**: Numeric values, no currency symbols, no thousand separators. Use a period as the decimal mark.

**currency**: Infer from context. Jamaican receipts almost always show JMD (often without a symbol, sometimes with \`$\` meaning JMD locally). PriceSmart often shows USD. If you see explicit "USD" or US-style pricing on a non-Jamaican-looking receipt, use "USD". When unsure, default to "JMD" and reduce confidence.

**confidence**:
- \`"high"\`: All fields clearly extracted, math checks out (line totals sum near the receipt total within rounding).
- \`"medium"\`: Most fields extracted but some line items are ambiguous, or the date format was ambiguous.
- \`"low"\`: Image is blurry, partial, not a receipt, or you had to guess most fields. It's fine to return mostly-empty data here — the user will correct it.

## Edge cases

- **Not a receipt**: Return \`confidence: "low"\`, \`line_items: []\`, \`"supermarket": {}\`, and best-guess values for the remaining fields.
- **Multiple receipts in one image**: Parse only the most prominent one.
- **Weighed items** (e.g. "BANANAS 1.45 kg @ 220.00/kg = 319.00"): Use \`quantity: 1.45\`, \`unit_price: 220.00\`, \`total: 319.00\`. Include the unit in the name: "Bananas (kg)".
- **Discount lines**: Skip them. Do not subtract discounts from item prices — record items at their listed prices.
- **Illegible item**: Include it with \`name: "[unreadable]"\` so the user can fix it during verification. Don't silently drop lines.
- **Math doesn't add up**: Record what you see anyway. Lower confidence to "medium" or "low" depending on severity.

## Examples

### Example 1 — Clean Hi-Lo receipt

Input: A clear photo of a Hi-Lo receipt dated 14/03/2026 with three items.

Output:
\`\`\`json
{
  "supermarket": { "name": "Hi-Lo", "branch": "Barbican", "address": "24 Barbican Rd", "city": "Kingston", "region": "St. Andrew", "country": "Jamaica" },
  "purchase_date": "2026-03-14",
  "line_items": [
    { "name": "Grace Coconut Milk 400ml", "quantity": 2, "unit_price": 385.00, "total": 770.00 },
    { "name": "Lasco Soya Drink 1L", "quantity": 1, "unit_price": 450.00, "total": 450.00 },
    { "name": "Bananas (kg)", "quantity": 1.45, "unit_price": 220.00, "total": 319.00 }
  ],
  "currency": "JMD",
  "confidence": "high"
}
\`\`\`

### Example 2 — PriceSmart receipt in USD

Input: A PriceSmart receipt showing prices like "$24.99" with a USD subtotal.

Output:
\`\`\`json
{
  "supermarket": { "name": "PriceSmart", "city": "Kingston", "country": "Jamaica" },
  "purchase_date": "2026-04-02",
  "line_items": [
    { "name": "Kirkland Almonds 1.36kg", "quantity": 1, "unit_price": 24.99, "total": 24.99 },
    { "name": "Member's Selection Olive Oil 3L", "quantity": 1, "unit_price": 32.50, "total": 32.50 }
  ],
  "currency": "USD",
  "confidence": "high"
}
\`\`\`

### Example 3 — Blurry, partially unreadable receipt

Input: A receipt where the chain name is cut off and two of four items are smudged.

Output:
\`\`\`json
{
  "supermarket": {},
  "purchase_date": "2026-05-20",
  "line_items": [
    { "name": "Excelsior Water Crackers", "quantity": 1, "unit_price": 380.00, "total": 380.00 },
    { "name": "[unreadable]", "quantity": 1, "unit_price": 0, "total": 0 },
    { "name": "[unreadable]", "quantity": 1, "unit_price": 0, "total": 0 },
    { "name": "Tropicana Orange Juice 1L", "quantity": 1, "unit_price": 690.00, "total": 690.00 }
  ],
  "currency": "JMD",
  "confidence": "low"
}
\`\`\`

### Example 4 — Image is not a receipt

Input: A photo of a cat.

Output:
\`\`\`json
{
  "supermarket": {},
  "purchase_date": "2026-05-26",
  "line_items": [],
  "currency": "JMD",
  "confidence": "low"
}
\`\`\`

### Example 5 — Continuation page of a split receipt (no store header)

Input: The second page of a long receipt. It starts mid-list with items and shows a date, but the store name/header is not on this page.

Output:
\`\`\`json
{
  "supermarket": {},
  "purchase_date": "2026-06-01",
  "line_items": [
    { "name": "Betty Crocker Brownie Mix", "quantity": 1, "unit_price": 620.00, "total": 620.00 },
    { "name": "Grace Tomato Ketchup 400g", "quantity": 2, "unit_price": 310.00, "total": 620.00 }
  ],
  "currency": "JMD",
  "confidence": "high"
}
\`\`\`

### Example 6 — Two photos of one receipt, overlapping at the seam

Input: Two images. Image 1 ends with "Sophie Bathroom Tissue 400s" and "Forka Oats 400G". Image 2 was taken slightly higher up the paper, so it **starts** with those same two lines before continuing.

Note both what is repeated and what is not: the two "Sophie Bathroom Tissue 400s" lines within image 1 are two separate purchases printed twice on the paper, and both are recorded. The seam repeat is recorded too, tagged with the image it appeared in — do not drop it.

Output:
\`\`\`json
{
  "supermarket": { "name": "General Food Supermarket" },
  "purchase_date": "2026-07-04",
  "line_items": [
    { "name": "Sophie Bathroom Tissue 400s", "quantity": 1, "unit_price": 93.63, "total": 93.63, "image": 1 },
    { "name": "Sophie Bathroom Tissue 400s", "quantity": 1, "unit_price": 93.63, "total": 93.63, "image": 1 },
    { "name": "Forka Oats 400G", "quantity": 1, "unit_price": 304.27, "total": 304.27, "image": 1 },
    { "name": "Sophie Bathroom Tissue 400s", "quantity": 1, "unit_price": 93.63, "total": 93.63, "image": 2 },
    { "name": "Forka Oats 400G", "quantity": 1, "unit_price": 304.27, "total": 304.27, "image": 2 },
    { "name": "J.F. Mills Festival Mix", "quantity": 1, "unit_price": 616.04, "total": 616.04, "image": 2 }
  ],
  "currency": "JMD",
  "confidence": "high"
}
\`\`\`

## Reminders

- Output ONLY the JSON object. No \`\`\`json fences. No "Here is the parsed receipt:". Nothing before or after.
- Numbers are numbers, not strings. \`385.00\`, not \`"385.00"\`.
- Given several images, every line carries an \`image\` index, and lines repeated at a seam are recorded once per image. Do not merge them and do not leave the index off.
- The user will verify your output before it's saved — it's better to include a flagged-but-imperfect line than to silently drop it.`;

type AnthropicLike = Pick<Anthropic, 'messages'>;

// One photograph of a receipt. Several of these, in reading order, make up one receipt.
export type ReceiptPart = {
	data: Buffer;
	mediaType: ReceiptMediaType;
};

export async function parseReceipt(
	parts: ReceiptPart[],
	client?: AnthropicLike
): Promise<ParsedReceipt> {
	if (parts.length === 0) throw new Error('Receipt parser: no images to parse');
	const c: AnthropicLike = client ?? new Anthropic({ apiKey: receiptExtractorKey() });
	const response = await c.messages.create({
		model: 'claude-haiku-4-5',
		max_tokens: 8192,
		system: SYSTEM_PROMPT,
		messages: [
			{
				role: 'user',
				// All parts in one turn: the model needs the header from part 1 and the tail
				// items from part 5 in a single context to return one merged receipt.
				content: [...parts.map(toFileBlock), { type: 'text', text: extractionPrompt(parts.length) }]
			},
			{ role: 'assistant', content: '{' }
		]
	});

	const textBlock = response.content.find((b) => b.type === 'text');
	if (!textBlock || textBlock.type !== 'text') {
		throw new Error(
			`Receipt parser: no text block in response (stop_reason=${response.stop_reason})`
		);
	}

	let raw = textBlock.text
		.replace(/^```(?:json)?\s*/i, '')
		.replace(/\s*```$/i, '')
		.trim();
	if (!raw.startsWith('{')) raw = '{' + raw;

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (err) {
		const snippet = raw.length > 500 ? raw.slice(0, 500) + '…' : raw;
		throw new Error(
			`Receipt parser: model returned invalid JSON: ${(err as Error).message}. Raw: ${snippet}`,
			{
				cause: err
			}
		);
	}

	const result = parsedReceiptSchema.safeParse(parsed);
	if (!result.success) {
		throw new Error(`Receipt parser: response did not match schema: ${result.error.message}`);
	}
	return { ...result.data, line_items: annotate(result.data.line_items) };
}

// Two independent signals, deliberately kept apart. `flagged` means "not a product, leave it
// out of the save"; `possible_duplicate` means "this may be the previous photo's line again"
// and does not exclude anything on its own.
function annotate(items: ParsedReceipt['line_items']): ParsedReceipt['line_items'] {
	const flagged = items.map((item) => ({
		...item,
		flagged: NON_ITEM_PATTERN.test(item.name.trim())
	}));
	return markSeamDuplicates(flagged);
}

function toFileBlock(part: ReceiptPart) {
	const data = part.data.toString('base64');
	return part.mediaType === 'application/pdf'
		? ({
				type: 'document',
				source: { type: 'base64', media_type: 'application/pdf', data }
			} as const)
		: ({
				type: 'image',
				source: { type: 'base64', media_type: part.mediaType, data }
			} as const);
}

function extractionPrompt(count: number): string {
	if (count === 1) return 'Extract this receipt.';
	return `Extract this receipt. The ${count} images above are consecutive parts of ONE receipt, in order — merge them into a single result.`;
}

// The dev server and adapter-node load .env into $env/dynamic/private, not process.env;
// the process.env fallback covers scripts and tests that run outside SvelteKit.
function receiptExtractorKey(): string {
	const key = env.RECEIPT_EXTRACTOR ?? process.env.RECEIPT_EXTRACTOR;
	if (!key) throw new Error('RECEIPT_EXTRACTOR is not set');
	return key;
}
