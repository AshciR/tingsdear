import { describe, it, expect } from 'vitest';
import { sql } from 'drizzle-orm';
import { withRollback } from '../../../test-setup/with-rollback.ts';
import type { Db } from './index.ts';
import { saveReceipt, type ReceiptSaveRequest } from './repo.ts';
import { item, manufacturer, price, supermarketChain, supermarketLocation } from './schema.ts';

describe('saveReceipt', () => {
	it('creates chain, location, items, prices, and unknown manufacturer on first save', async () => {
		await withRollback(async (db) => {
			// Given an empty database and a receipt with two line items
			const receipt = makeReceipt();

			// When we save the receipt
			const result = await saveReceipt(db, receipt);

			// Then row counts reflect a fresh insert across all tables
			const counts = await countRows(db);
			expect(counts).toEqual({
				chains: 1,
				locations: 1,
				items: 2,
				prices: 2,
				manufacturers: 1
			});

			// And the result reports everything as newly created
			expect(result.chainCreated).toBe(true);
			expect(result.locationCreated).toBe(true);
			expect(result.lineItems).toHaveLength(2);
			expect(result.lineItems.every((li) => li.created)).toBe(true);
			expect(result.lineItems.every((li) => li.priceId > 0)).toBe(true);
		});
	});

	it('reuses chain, location, items, and manufacturer when saving the same receipt twice', async () => {
		await withRollback(async (db) => {
			// Given the same receipt has already been saved once
			const receipt = makeReceipt();
			await saveReceipt(db, receipt);

			// When we save the identical receipt a second time
			const result = await saveReceipt(db, receipt);

			// Then only price rows grow; everything else is reused
			const counts = await countRows(db);
			expect(counts).toEqual({
				chains: 1,
				locations: 1,
				items: 2,
				prices: 4,
				manufacturers: 1
			});
			expect(result.chainCreated).toBe(false);
			expect(result.locationCreated).toBe(false);
			expect(result.lineItems.every((li) => !li.created)).toBe(true);
		});
	});

	it('reuses chain and shared item but creates a new item for a second receipt', async () => {
		await withRollback(async (db) => {
			// Given a receipt with two items has been saved
			await saveReceipt(db, makeReceipt());

			// When we save a second receipt at the same chain sharing one item and adding one new item
			const second = makeReceipt({
				line_items: [
					{ name: 'Milk 2L', unit_price: 4.1 },
					{ name: 'Eggs', unit_price: 5.25 }
				]
			});
			const result = await saveReceipt(db, second);

			// Then the shared chain/location stay stable, items grow by one, prices grow by two
			const counts = await countRows(db);
			expect(counts.chains).toBe(1);
			expect(counts.locations).toBe(1);
			expect(counts.items).toBe(3);
			expect(counts.prices).toBe(4);

			// And the result distinguishes the reused item from the new one
			const milk = result.lineItems.find((li) => li.itemName === 'Milk 2L');
			const eggs = result.lineItems.find((li) => li.itemName === 'Eggs');
			expect(milk?.created).toBe(false);
			expect(eggs?.created).toBe(true);
		});
	});

	it('persists branch and address fields and reuses the location on a second receipt at the same address', async () => {
		await withRollback(async (db) => {
			// Given a receipt with a fully-populated supermarket address
			const supermarket = {
				name: 'Loshusan',
				branch: 'Barbican',
				address: '29 East Kings House Road',
				city: 'Kingston',
				region: 'St. Andrew',
				country: 'Jamaica'
			};
			await saveReceipt(db, makeReceipt({ supermarket }));

			// When we save a second receipt at the same address
			const result = await saveReceipt(
				db,
				makeReceipt({ supermarket, line_items: [{ name: 'Eggs', unit_price: 5.25 }] })
			);

			// Then the address row is reused (no duplicate location) and its fields are populated
			const counts = await countRows(db);
			expect(counts.locations).toBe(1);
			expect(result.locationCreated).toBe(false);
			const [loc] = await selectLocations(db);
			expect(loc).toEqual({
				name: 'Barbican',
				address: '29 East Kings House Road',
				city: 'Kingston',
				region: 'St. Andrew',
				country: 'Jamaica'
			});
		});
	});

	it('creates a single item when the same product appears twice on one receipt', async () => {
		await withRollback(async (db) => {
			// Given a receipt listing the same product on two separate lines
			const receipt = makeReceipt({
				line_items: [
					{ name: 'Bananas', unit_price: 220 },
					{ name: 'Bananas', unit_price: 220 }
				]
			});

			// When we save it
			const result = await saveReceipt(db, receipt);

			// Then both lines resolve to one item row, with a price recorded against each line
			const counts = await countRows(db);
			expect(counts.items).toBe(1);
			expect(counts.prices).toBe(2);
			expect(new Set(result.lineItems.map((li) => li.itemId)).size).toBe(1);
		});
	});

	it('matches supermarket chain names case-insensitively', async () => {
		await withRollback(async (db) => {
			// Given a chain "HI-LO" already exists from a prior save
			await saveReceipt(db, makeReceipt({ supermarket: { name: 'HI-LO' } }));

			// When we save another receipt using "hi-lo"
			const result = await saveReceipt(
				db,
				makeReceipt({
					supermarket: { name: 'hi-lo' },
					line_items: [{ name: 'Soap', unit_price: 1 }]
				})
			);

			// Then no new chain row is created
			const counts = await countRows(db);
			expect(counts.chains).toBe(1);
			expect(result.chainCreated).toBe(false);
		});
	});
});

function makeReceipt(overrides: Partial<ReceiptSaveRequest> = {}): ReceiptSaveRequest {
	return {
		supermarket: { name: 'HI-LO' },
		purchase_date: '2026-01-15',
		line_items: [
			{ name: 'Milk 2L', unit_price: 3.99 },
			{ name: 'Bread', unit_price: 2.5 }
		],
		...overrides
	};
}

async function selectLocations(db: Db) {
	return db
		.select({
			name: supermarketLocation.name,
			address: supermarketLocation.address,
			city: supermarketLocation.city,
			region: supermarketLocation.region,
			country: supermarketLocation.country
		})
		.from(supermarketLocation);
}

async function countRows(db: Db) {
	const [chains] = await db.select({ c: sql<number>`count(*)::int` }).from(supermarketChain);
	const [locations] = await db.select({ c: sql<number>`count(*)::int` }).from(supermarketLocation);
	const [items] = await db.select({ c: sql<number>`count(*)::int` }).from(item);
	const [prices] = await db.select({ c: sql<number>`count(*)::int` }).from(price);
	const [mfrs] = await db.select({ c: sql<number>`count(*)::int` }).from(manufacturer);
	return {
		chains: chains.c,
		locations: locations.c,
		items: items.c,
		prices: prices.c,
		manufacturers: mfrs.c
	};
}
