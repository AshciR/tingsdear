import { describe, it, expect } from 'vitest';
import { withRollback } from '../../../test-setup/with-rollback.ts';
import type { Db } from '../db/index.ts';
import { supermarketChain, supermarketLocation } from '../db/schema.ts';
import { HIGH_CONFIDENCE, LOW_CONFIDENCE, resolveSupermarket } from './resolver.ts';

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
			// When a receipt names an unknown supermarket
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
