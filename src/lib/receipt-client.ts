import type { ParsedReceipt } from '$lib/server/receipt-parser';
import type { SaveReceiptResult } from '$lib/server/db/repo';

export type { ParsedReceipt, SaveReceiptResult };

export async function parseReceiptFile(
	file: File,
	fetchImpl: typeof fetch = fetch
): Promise<ParsedReceipt> {
	const form = new FormData();
	form.append('file', file);
	const res = await fetchImpl('/api/receipts/parse', { method: 'POST', body: form });
	return readJson<ParsedReceipt>(res, 'Could not read the receipt');
}

export async function saveReceipt(
	receipt: ParsedReceipt,
	fetchImpl: typeof fetch = fetch
): Promise<SaveReceiptResult> {
	const res = await fetchImpl('/api/receipts/save', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(normalizeReceipt(receipt))
	});
	return readJson<SaveReceiptResult>(res, 'Could not save the receipt');
}

// Form inputs hand back blank strings and, when cleared, null numbers. The save route
// re-validates with the parser's Zod schema, so clean those up before they hit the wire.
export function normalizeReceipt(receipt: ParsedReceipt): ParsedReceipt {
	return {
		...receipt,
		supermarket: normalizeSupermarket(receipt.supermarket),
		line_items: receipt.line_items.map((item) => ({
			...item,
			name: item.name.trim(),
			quantity: toNumber(item.quantity),
			unit_price: toNumber(item.unit_price),
			total: toNumber(item.total)
		}))
	};
}

function normalizeSupermarket(supermarket: ParsedReceipt['supermarket']) {
	const entries = Object.entries(supermarket)
		.map(([key, value]) => [key, value?.trim()] as const)
		.filter(([, value]) => value);
	return Object.fromEntries(entries);
}

function toNumber(value: number): number {
	return Number.isFinite(value) ? value : 0;
}

async function readJson<T>(res: Response, fallback: string): Promise<T> {
	if (!res.ok) throw new Error(await extractErrorMessage(res, fallback));
	return (await res.json()) as T;
}

// SvelteKit's error() responses are JSON `{ message }`; anything else may be HTML or empty.
async function extractErrorMessage(res: Response, fallback: string): Promise<string> {
	try {
		const body = await res.json();
		if (typeof body?.message === 'string' && body.message) return body.message;
	} catch {
		// fall through to the generic message below
	}
	return `${fallback} (${res.status})`;
}
