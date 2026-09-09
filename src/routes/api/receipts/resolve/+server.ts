import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supermarketResolveSchema } from '$lib/server/receipts/parser';
import { resolveSupermarket } from '$lib/server/supermarkets/resolver';

// Reads only, and cheap — no model call, just the chain and its branches. That is what lets the
// verify screen ask again every time the user edits the supermarket name, which it must: a
// candidate list goes stale the moment the name changes under it.
export const POST: RequestHandler = async ({ request, locals }) => {
	const body = await request.json();
	const parsed = supermarketResolveSchema.safeParse(body);
	if (!parsed.success) throw error(400, parsed.error.message);
	return json(await resolveSupermarket(locals.db, parsed.data));
};
