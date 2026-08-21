import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	parseReceipt,
	RECEIPT_MEDIA_TYPES,
	type ReceiptMediaType,
	type ReceiptPart
} from '$lib/server/receipts/parser';

export const POST: RequestHandler = async ({ request }) => {
	const form = await request.formData();
	const files = form.getAll('file').filter((entry) => entry instanceof File);
	if (files.length === 0) throw error(400, 'Missing "file" field');
	const parts = await Promise.all(files.map(toReceiptPart));
	try {
		const parsed = await parseReceipt(parts);
		return json(parsed);
	} catch (e) {
		throw error(500, (e as Error).message);
	}
};

// FormData preserves the order fields were appended in, so the parts reach the parser in the
// order the user arranged them — which is the only thing telling it where the receipt starts.
async function toReceiptPart(file: File): Promise<ReceiptPart> {
	if (!RECEIPT_MEDIA_TYPES.includes(file.type as ReceiptMediaType)) {
		throw error(400, `Unsupported content type: ${file.type}`);
	}
	return { data: Buffer.from(await file.arrayBuffer()), mediaType: file.type as ReceiptMediaType };
}
