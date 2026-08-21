import { describe, it, expect } from 'vitest';
import { sql } from 'drizzle-orm';
import { withRollback } from '../../test-setup/with-rollback.ts';
import type { Db } from './db/index.ts';
import { supermarketChain, supermarketLocation } from './db/schema.ts';
import {
	HIGH_CONFIDENCE,
	LOW_CONFIDENCE,
	normalizeAddress,
	normalizeChainName,
	resolveSupermarket
} from './location-resolver.ts';

describe('normalizeChainName', () => {
	it('reduces two descriptions of one chain to the same form', () => {
		// Given two Super Valu branches whose headers describe the store differently
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

			// Then it matches the TypeScript one the resolver and repo use
			expect(fromSql).toEqual(names.map(normalizeChainName));
		});
	});
});

describe('resolveSupermarket', () => {
	it('pre-selects the branch when the address matches', async () => {
		await withRollback(async (db) => {
			// Given a chain with one known branch
			const chainId = await seedChain(db, 'Super Valu');
			const locationId = await seedLocation(db, chainId, {
				name: 'Constant Spring',
				address: '144 Constant Spring Rd',
				city: 'Kingston'
			});

			// When a receipt spells the same address out in full
			const resolved = await resolveSupermarket(db, {
				name: 'Super Valu Fresh Foods',
				address: '144 Constant Spring Road'
			});

			// Then that branch tops the list with enough confidence to pre-select
			expect(resolved.chainId).toBe(chainId);
			expect(resolved.candidates[0].location?.id).toBe(locationId);
			expect(resolved.candidates[0].reason).toBe('address');
			expect(resolved.candidates[0].score).toBeGreaterThanOrEqual(HIGH_CONFIDENCE);
		});
	});

	it('suggests but does not pre-select a branch matched on city alone', async () => {
		await withRollback(async (db) => {
			// Given a chain with one branch in Kingston
			const chainId = await seedChain(db, 'Super Valu');
			await seedLocation(db, chainId, {
				name: 'Constant Spring',
				address: '144 Constant Spring Rd',
				city: 'Kingston'
			});

			// When a receipt names only the city
			const resolved = await resolveSupermarket(db, { name: 'Super Valu', city: 'Kingston' });

			// Then it ranks first but stays below the pre-select threshold
			const top = resolved.candidates[0];
			expect(top.location?.city).toBe('Kingston');
			expect(top.score).toBeGreaterThan(LOW_CONFIDENCE);
			expect(top.score).toBeLessThan(HIGH_CONFIDENCE);
		});
	});

	it('offers two separate candidates for two branches, merging neither', async () => {
		await withRollback(async (db) => {
			// Given one chain with two branches in the same city
			const chainId = await seedChain(db, 'Super Valu');
			await seedLocation(db, chainId, {
				name: 'Constant Spring',
				address: '144 Constant Spring Rd',
				city: 'Kingston'
			});
			await seedLocation(db, chainId, {
				name: 'Liguanea',
				address: '134 Old Hope Rd',
				city: 'Kingston'
			});

			// When a receipt names only the city they share
			const resolved = await resolveSupermarket(db, { name: 'Super Valu', city: 'Kingston' });

			// Then both are offered, and neither is confident enough to merge into
			const branches = resolved.candidates.filter((c) => c.location !== null);
			expect(branches).toHaveLength(2);
			expect(branches.every((c) => c.score < HIGH_CONFIDENCE)).toBe(true);
		});
	});

	it('resolves the chain even when the receipt names it differently', async () => {
		await withRollback(async (db) => {
			// Given a chain saved under its full name
			const chainId = await seedChain(db, 'General Food Supermarket');

			// When a later receipt prints only the short form
			const resolved = await resolveSupermarket(db, { name: 'General Food' });

			// Then it resolves to the existing chain, reported under its canonical name
			expect(resolved.chainId).toBe(chainId);
			expect(resolved.chainName).toBe('General Food Supermarket');
		});
	});

	it('leaves a continuation page unresolved with nothing to pre-select', async () => {
		await withRollback(async (db) => {
			// Given a chain exists but the scanned page carries no header at all
			await seedChain(db, 'Super Valu');

			// When the empty supermarket object is resolved
			const resolved = await resolveSupermarket(db, {});

			// Then there is no chain and the only option is to create a branch
			expect(resolved.chainId).toBeNull();
			expect(resolved.candidates).toEqual([{ location: null, score: 0, reason: 'new' }]);
		});
	});

	it('returns a usable result for a chain it has never seen', async () => {
		await withRollback(async (db) => {
			// Given an empty database
			// When a receipt names an unknown store
			const resolved = await resolveSupermarket(db, {
				name: 'Brand New Grocers',
				city: 'Kingston'
			});

			// Then the caller still gets the typed name back and a "new branch" option
			expect(resolved.chainId).toBeNull();
			expect(resolved.chainName).toBe('Brand New Grocers');
			expect(resolved.candidates.map((c) => c.reason)).toEqual(['new']);
		});
	});

	it('always offers a new branch alongside the suggestions', async () => {
		await withRollback(async (db) => {
			// Given a chain whose branch matches the receipt exactly
			const chainId = await seedChain(db, 'Super Valu');
			await seedLocation(db, chainId, {
				name: 'Constant Spring',
				address: '144 Constant Spring Rd'
			});

			// When the receipt is resolved
			const resolved = await resolveSupermarket(db, {
				name: 'Super Valu',
				address: '144 Constant Spring Rd'
			});

			// Then the user can still reject the suggestion and create a branch
			expect(resolved.candidates.at(-1)).toEqual({ location: null, score: 0, reason: 'new' });
		});
	});
});

async function sqlNormalize(db: Db, name: string): Promise<string> {
	const result = await db.execute<{ normalized: string }>(
		sql`select normalize_chain_name(${name}) as normalized`
	);
	return result.rows[0].normalized;
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
	fields: { name?: string; address?: string; city?: string; region?: string }
): Promise<number> {
	const [row] = await db
		.insert(supermarketLocation)
		.values({ chainId, ...fields })
		.returning({ id: supermarketLocation.id });
	return row.id;
}
