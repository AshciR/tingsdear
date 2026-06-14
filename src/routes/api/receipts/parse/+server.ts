import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	parseReceipt,
	RECEIPT_MEDIA_TYPES,
	type ReceiptMediaType
} from '$lib/server/receipt-parser.ts';

export const POST: RequestHandler = async ({ request }) => {
	const form = await request.formData();
	const file = form.get('file');
	if (!(file instanceof File)) throw error(400, 'Missing "file" field');
	if (!RECEIPT_MEDIA_TYPES.includes(file.type as ReceiptMediaType)) {
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
