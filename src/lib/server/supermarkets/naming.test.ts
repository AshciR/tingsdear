import { describe, it, expect } from 'vitest';
import { sql } from 'drizzle-orm';
import { withRollback } from '../../../test-setup/with-rollback.ts';
import type { Db } from '../db/index.ts';
import { normalizeAddress, normalizeChainName } from './naming.ts';

describe('normalizeChainName', () => {
	it('reduces two descriptions of one chain to the same form', () => {
		// Given two Super Valu branches whose headers describe the supermarket differently
		// When each name is normalized
		// Then both collapse onto the same chain
		expect(normalizeChainName('Super Valu Fresh Foods')).toBe('super valu');
		expect(normalizeChainName('Super Valu Home Centre')).toBe('super valu');
	});

	it('strips a trailing descriptor from a single-word chain', () => {
		// Given a header carrying the word "Supermarket"
		// When it is normalized
		// Then only the chain itself is left
		expect(normalizeChainName('Loshusan Supermarket')).toBe('loshusan');
	});

	it('matches a shortened header against the full chain name', () => {
		// Given the receipt-3-5 failure: a near-miss that used to mint a second chain row
		// When both spellings are normalized
		// Then they land on the same value
		expect(normalizeChainName('General Food')).toBe('general food');
		expect(normalizeChainName('General Food Supermarket')).toBe('general food');
	});

	it('ignores case, punctuation and surrounding space', () => {
		// Given headers printed in caps, hyphenated, or padded with space
		// When they are normalized
		// Then only lowercase words separated by single spaces remain
		expect(normalizeChainName('  HI-LO Food Stores ')).toBe('hi lo');
		expect(normalizeChainName('MegaMart')).toBe('megamart');
	});

	it('keeps a chain whose whole name is a descriptor', () => {
		// Given a chain literally called "Supermarket"
		// When it is normalized
		// Then it keeps its name rather than reducing to nothing
		expect(normalizeChainName('Supermarket')).toBe('supermarket');
	});
});

describe('normalizeAddress', () => {
	it('treats a spelled-out street suffix as its abbreviation', () => {
		// Given the same street written both ways on two receipts
		// When each address is normalized
		// Then they compare equal
		expect(normalizeAddress('144 Constant Spring Road')).toBe('144 constant spring rd');
		expect(normalizeAddress('144 Constant Spring Rd')).toBe('144 constant spring rd');
	});

	it('drops punctuation so shop numbers compare equal', () => {
		// Given an address with a comma between the shop number and the plaza
		// When it is normalized
		// Then the punctuation is gone and the words survive
		expect(normalizeAddress('Shop 5, Sovereign Centre')).toBe('shop 5 sovereign centre');
	});

	it('does not conflate two different street numbers', () => {
		// Given two neighbouring addresses on one road
		// When both are normalized
		// Then they stay distinct
		expect(normalizeAddress('144 Constant Spring Rd')).not.toBe(
			normalizeAddress('146 Constant Spring Rd')
		);
	});
});

describe('normalize_chain_name (SQL)', () => {
	it('agrees with the TypeScript normalizer on every case', async () => {
		await withRollback(async (db) => {
			// Given the names the two implementations both have to handle
			const names = [
				'Super Valu Fresh Foods',
				'Super Valu Home Centre',
				'Loshusan Supermarket',
				'General Food',
				'General Food Supermarket',
				'  HI-LO Food Stores ',
				'MegaMart',
				'Supermarket',
				'PriceSmart Wholesale',
				"Lee's Food Fair Ltd"
			];

			// When each is normalized by the migration's SQL function
			const fromSql = await Promise.all(names.map((name) => sqlNormalize(db, name)));

			// Then it matches the TypeScript one the resolver and receipt save use
			expect(fromSql).toEqual(names.map(normalizeChainName));
		});
	});
});

async function sqlNormalize(db: Db, name: string): Promise<string> {
	const result = await db.execute<{ normalized: string }>(
		sql`select normalize_chain_name(${name}) as normalized`
	);
	return result.rows[0].normalized;
}
