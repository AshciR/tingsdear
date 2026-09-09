import type { ParsedReceipt } from '$lib/server/receipts/parser';
import type { SaveReceiptResult } from '$lib/server/receipts/save';
import type { LocationCandidate, ResolvedSupermarket } from '$lib/server/supermarkets/resolver';
import { downscaleImages } from '$lib/image-downscale';

export type { ParsedReceipt, SaveReceiptResult, LocationCandidate, ResolvedSupermarket };

// One receipt, in reading order. A long receipt spans several photos and only the first
// carries the supermarket header, so the parts go to the parser together, in the order given.
export async function parseReceiptFiles(
	files: File[],
	fetchImpl: typeof fetch = fetch
): Promise<ParsedReceipt> {
	const form = new FormData();
	for (const file of await downscaleImages(files)) form.append('file', file);
	const res = await fetchImpl('/api/receipts/parse', { method: 'POST', body: form });
	return readJson<ParsedReceipt>(res, 'Could not read the receipt');
}

// Which existing branches this supermarket text could be. Cheap enough to call again whenever
// the user edits the name at verify — unlike parsing, there is no model call behind it.
export async function resolveSupermarket(
	supermarket: ParsedReceipt['supermarket'],
	fetchImpl: typeof fetch = fetch
): Promise<ResolvedSupermarket> {
	const res = await fetchImpl('/api/receipts/resolve', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(normalizeSupermarket(supermarket))
	});
	return readJson<ResolvedSupermarket>(res, 'Could not look up the supermarket');
}

// `locationId` is the branch the user picked from those candidates; null means "none of these",
// and the server falls back to matching on the supermarket text.
export async function saveReceipt(
	receipt: ParsedReceipt,
	locationId: number | null = null,
	fetchImpl: typeof fetch = fetch
): Promise<SaveReceiptResult> {
	const body = { ...normalizeReceipt(receipt), location_id: locationId ?? undefined };
	const res = await fetchImpl('/api/receipts/save', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
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
