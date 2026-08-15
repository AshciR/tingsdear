import { describe, it, expect } from 'vitest';
import { sql } from 'drizzle-orm';
import { withRollback } from '../../../../test-setup/with-rollback.ts';
import type { Db } from '$lib/server/db/index';
import type { ParsedReceipt } from '$lib/server/receipt-parser';
import { item, price, supermarketChain, supermarketLocation } from '$lib/server/db/schema';
import { POST } from './+server.ts';

function invoke(request: Request, db: Db) {
	return POST({ request, locals: { db } } as Parameters<typeof POST>[0]);
}

function jsonRequest(body: unknown): Request {
	return new Request('http://test/api/receipts/save', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: typeof body === 'string' ? body : JSON.stringify(body)
	});
}

function makeParsed(overrides: Partial<ParsedReceipt> = {}): ParsedReceipt {
	return {
		supermarket: { name: 'HI-LO' },
		purchase_date: '2026-01-15',
		line_items: [
			{ name: 'Milk 2L', quantity: 1, unit_price: 3.99, total: 3.99, flagged: false },
			{ name: 'Bread', quantity: 1, unit_price: 2.5, total: 2.5, flagged: false }
		],
		currency: 'JMD',
		confidence: 'high',
		...overrides
	};
}

async function countRows(db: Db) {
	const [chains] = await db.select({ c: sql<number>`count(*)::int` }).from(supermarketChain);
	const [locations] = await db.select({ c: sql<number>`count(*)::int` }).from(supermarketLocation);
	const [items] = await db.select({ c: sql<number>`count(*)::int` }).from(item);
	const [prices] = await db.select({ c: sql<number>`count(*)::int` }).from(price);
	return { chains: chains.c, locations: locations.c, items: items.c, prices: prices.c };
}

async function countChainsNamed(db: Db, name: string) {
	const [row] = await db
		.select({ c: sql<number>`count(*)::int` })
		.from(supermarketChain)
		.where(sql`lower(${supermarketChain.name}) = lower(${name})`);
	return row.c;
}

describe('POST /api/receipts/save', () => {
	it('persists chain, location, items, and prices for a valid parsed receipt', async () => {
		await withRollback(async (db) => {
			// Given a valid parsed receipt and an empty database

			// When we POST it
			const res = await invoke(jsonRequest(makeParsed()), db);

			// Then it returns 200 with the saved row references and the DB has matching rows
			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body.chainCreated).toBe(true);
			expect(body.locationCreated).toBe(true);
			expect(body.lineItems).toHaveLength(2);
			expect(await countRows(db)).toEqual({ chains: 1, locations: 1, items: 2, prices: 2 });
		});
	});

	it('drops flagged line items before persisting', async () => {
		await withRollback(async (db) => {
			// Given a parsed receipt where one line item is flagged
			const parsed = makeParsed({
				line_items: [
					{ name: 'Milk 2L', quantity: 1, unit_price: 3.99, total: 3.99, flagged: false },
					{ name: 'SUBTOTAL', quantity: 1, unit_price: 9.99, total: 9.99, flagged: true }
				]
			});

			// When we POST it
			const res = await invoke(jsonRequest(parsed), db);

			// Then only the unflagged item is persisted
			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body.lineItems).toHaveLength(1);
			expect(body.lineItems[0].itemName).toBe('Milk 2L');
			const counts = await countRows(db);
			expect(counts.items).toBe(1);
			expect(counts.prices).toBe(1);
		});
	});

	it('returns 400 when the body fails schema validation', async () => {
		await withRollback(async (db) => {
			// Given a body missing the required currency field
			const { currency: _omit, ...invalid } = makeParsed();

			// When / Then
			await expect(invoke(jsonRequest(invalid), db)).rejects.toMatchObject({ status: 400 });
		});
	});

	it('returns 400 when the supermarket has no name', async () => {
		await withRollback(async (db) => {
			// Given a continuation page of a split receipt — parsed fine, but no store header
			const headerless = makeParsed({ supermarket: {} });

			// When / Then — it must not save under an invented chain
			await expect(invoke(jsonRequest(headerless), db)).rejects.toMatchObject({ status: 400 });
		});
	});

	it('returns 400 when the store name is only whitespace', async () => {
		await withRollback(async (db) => {
			// Given a receipt whose store name is blank after trimming
			const blank = makeParsed({ supermarket: { name: '   ' } });

			// When / Then
			await expect(invoke(jsonRequest(blank), db)).rejects.toMatchObject({ status: 400 });
		});
	});

	it('writes no rows when the store name is missing', async () => {
		await withRollback(async (db) => {
			// Given a nameless receipt and an empty database
			const headerless = makeParsed({ supermarket: {} });

			// When the save is rejected
			await expect(invoke(jsonRequest(headerless), db)).rejects.toBeDefined();

			// Then nothing was persisted — in particular no chain named "Unknown"
			expect(await countRows(db)).toEqual({ chains: 0, locations: 0, items: 0, prices: 0 });
			expect(await countChainsNamed(db, 'Unknown')).toBe(0);
		});
	});

	it('rejects a body that is not valid JSON', async () => {
		await withRollback(async (db) => {
			// Given a non-JSON body

			// When / Then — request.json() throws
			await expect(invoke(jsonRequest('not-json'), db)).rejects.toBeDefined();
		});
	});
});
