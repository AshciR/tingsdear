import { describe, it, expect } from 'vitest';
import { withRollback } from '../../../../test-setup/with-rollback.ts';
import type { Db } from '$lib/server/db/index';
import { supermarketChain, supermarketLocation } from '$lib/server/db/schema';
import { HIGH_CONFIDENCE } from '$lib/supermarkets/candidates';
import { POST } from './+server.ts';

describe('POST /api/receipts/resolve', () => {
	it('offers a matching branch confidently enough for the UI to pre-select it', async () => {
		await withRollback(async (db) => {
			// Given a chain with one branch on file
			const chainId = await seedChain(db, 'Super Valu');
			const locationId = await seedLocation(db, chainId, {
				name: 'Constant Spring',
				address: '144 Constant Spring Rd'
			});

			// When a receipt spells the same address out in full
			const res = await invoke(
				jsonRequest({ name: 'Super Valu Fresh Foods', address: '144 Constant Spring Road' }),
				db
			);

			// Then the branch tops the list at pre-select strength
			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body.chainId).toBe(chainId);
			expect(body.candidates[0].location.id).toBe(locationId);
			expect(body.candidates[0].score).toBeGreaterThanOrEqual(HIGH_CONFIDENCE);
		});
	});

	it('answers a headerless continuation page with nothing but "new branch"', async () => {
		await withRollback(async (db) => {
			// Given a chain exists but this page carries no header
			await seedChain(db, 'Super Valu');

			// When the empty supermarket object is sent
			const res = await invoke(jsonRequest({}), db);

			// Then it is a normal 200, not an error — there is simply nothing to suggest
			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body.chainId).toBeNull();
			expect(body.candidates.map((c: { reason: string }) => c.reason)).toEqual(['new']);
		});
	});

	it('returns 400 when a supermarket field is not a string', async () => {
		await withRollback(async (db) => {
			// Given a body that does not match the supermarket shape

			// When / Then
			await expect(invoke(jsonRequest({ name: 42 }), db)).rejects.toMatchObject({ status: 400 });
		});
	});
});

function invoke(request: Request, db: Db) {
	return POST({ request, locals: { db } } as Parameters<typeof POST>[0]);
}

function jsonRequest(body: unknown): Request {
	return new Request('http://test/api/receipts/resolve', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
	});
}

async function seedChain(db: Db, name: string): Promise<number> {
	const [row] = await db
		.insert(supermarketChain)
		.values({ name })
		.returning({ id: supermarketChain.id });
	return row.id;
}

async function seedLocation(
	db: Db,
	chainId: number,
	fields: { name?: string; address?: string; city?: string }
): Promise<number> {
	const [row] = await db
		.insert(supermarketLocation)
		.values({ chainId, ...fields })
		.returning({ id: supermarketLocation.id });
	return row.id;
}
