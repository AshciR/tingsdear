import { describe, it, expect } from 'vitest';
import { withRollback } from '../../../test-setup/with-rollback.ts';
import { item, manufacturer, price, supermarketChain, supermarketLocation } from './schema.ts';

const EXPECTED_TABLES = [
	'manufacturer',
	'category',
	'supermarket_chain',
	'supermarket_location',
	'item',
	'price'
];

describe('database schema', () => {
	it('exposes all expected tables in the public schema', async () => {
		await withRollback(async (_db, client) => {
			// Given a migrated database (global setup)

			// When we query information_schema for public tables
			const result = await client.query<{ table_name: string }>(
				`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`
			);
			const tables = result.rows.map((r) => r.table_name);

			// Then every expected table is present
			for (const t of EXPECTED_TABLES) {
				expect(tables).toContain(t);
			}
		});
	});

	it('has the postgis extension installed', async () => {
		await withRollback(async (_db, client) => {
			// Given a migrated database

			// When we query pg_extension for postgis
			const result = await client.query(
				`SELECT extname FROM pg_extension WHERE extname = 'postgis'`
			);

			// Then postgis is installed
			expect(result.rowCount).toBe(1);
		});
	});

	it('populates the geog column via trigger when latitude and longitude are inserted', async () => {
		await withRollback(async (_db, client) => {
			// Given a supermarket_chain row
			const chain = await client.query<{ id: number }>(
				`INSERT INTO supermarket_chain (name) VALUES ('TriggerTest') RETURNING id`
			);
			const chainId = chain.rows[0].id;

			// When we insert a location with latitude and longitude
			const loc = await client.query<{ geog: string | null }>(
				`INSERT INTO supermarket_location (chain_id, name, latitude, longitude)
				 VALUES ($1, 'Trigger Loc', 51.5074, -0.1278) RETURNING geog::text AS geog`,
				[chainId]
			);

			// Then the geog column is populated by the trigger
			expect(loc.rows[0].geog).not.toBeNull();
		});
	});

	it('supports manufacturer -> item -> price round-trip via drizzle', async () => {
		await withRollback(async (db) => {
			// Given a manufacturer, chain, location, and item inserted via drizzle
			const [mfr] = await db
				.insert(manufacturer)
				.values({ name: 'Acme' })
				.returning({ id: manufacturer.id });
			const [chain] = await db
				.insert(supermarketChain)
				.values({ name: 'RoundTripMart' })
				.returning({ id: supermarketChain.id });
			const [loc] = await db
				.insert(supermarketLocation)
				.values({ chainId: chain.id, name: 'Default' })
				.returning({ id: supermarketLocation.id });
			const [itm] = await db
				.insert(item)
				.values({
					name: 'Widget',
					manufacturerId: mfr.id,
					sizeAmount: '1',
					sizeUnit: 'ct',
					unitType: 'count',
					sizeInBaseUnit: '1'
				})
				.returning({ id: item.id });

			// When we insert a price row referencing the item and location
			const [pr] = await db
				.insert(price)
				.values({
					locationId: loc.id,
					itemId: itm.id,
					amount: '9.99',
					source: 'manual'
				})
				.returning({ id: price.id });

			// Then the price row is created
			expect(pr.id).toBeGreaterThan(0);
		});
	});
});
