import { error, json } from '@sveltejs/kit';
import type { z } from 'zod';
import type { RequestHandler } from './$types';
import { receiptSaveSchema, type ReceiptSaveBody } from '$lib/server/receipt-parser';
import { SUPERMARKET_NAME_REQUIRED } from '$lib/receipt-messages';
import { saveReceipt, type ReceiptSaveRequest } from '$lib/server/db/repo';

export const POST: RequestHandler = async ({ request, locals }) => {
	const body = await request.json();
	const result = receiptSaveSchema.safeParse(body);
	if (!result.success) throw error(400, validationMessage(result.error));
	const saved = await saveReceipt(locals.db, toSaveRequest(result.data));
	return json(saved);
};

// Zod's own message is a stringified issue array — fine for a developer, useless in the
// verify screen. The missing supermarket name is the one failure a user can actually fix, so
// give that case wording the UI can show verbatim.
function validationMessage(err: z.ZodError): string {
	const nameIssue = err.issues.find((issue) => issue.path.join('.') === 'supermarket.name');
	return nameIssue ? SUPERMARKET_NAME_REQUIRED : err.message;
}

function toSaveRequest(parsed: ReceiptSaveBody): ReceiptSaveRequest {
	return {
		supermarket: parsed.supermarket,
		purchase_date: parsed.purchase_date,
		line_items: parsed.line_items
			.filter((li) => !li.flagged)
			.map((li) => ({ name: li.name, unit_price: li.unit_price }))
	};
}
