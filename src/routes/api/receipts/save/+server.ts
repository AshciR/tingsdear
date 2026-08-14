import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { parsedReceiptSchema, type ParsedReceipt } from '$lib/server/receipt-parser';
import { saveReceipt, type ReceiptSaveRequest } from '$lib/server/db/repo';

export const POST: RequestHandler = async ({ request, locals }) => {
	const body = await request.json();
	const result = parsedReceiptSchema.safeParse(body);
	if (!result.success) throw error(400, result.error.message);
	const saved = await saveReceipt(locals.db, toSaveRequest(result.data));
	return json(saved);
};

function toSaveRequest(parsed: ParsedReceipt): ReceiptSaveRequest {
	return {
		supermarket: parsed.supermarket,
		purchase_date: parsed.purchase_date,
		line_items: parsed.line_items
			.filter((li) => !li.flagged)
			.map((li) => ({ name: li.name, unit_price: li.unit_price }))
	};
}
