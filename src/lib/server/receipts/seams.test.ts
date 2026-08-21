import { describe, it, expect } from 'vitest';
import { markSeamDuplicates } from './seams.ts';

describe('markSeamDuplicates', () => {
	it('leaves a run of identical items within one photo alone', () => {
		// Given six identical snacks printed one after another on a single photographed frame,
		// as receipt-3-5 really shows
		const items = [
			line('B/Kist Vanilla S/Wich Ckie', 56.03, 1),
			line('B/Kist Vanilla S/Wich Ckie', 56.03, 1),
			line('B/Kist Vanilla S/Wich Ckie', 56.03, 1),
			line('B/Kist Vanilla S/Wich Ckie', 56.03, 1),
			line('B/Kist Vanilla S/Wich Ckie', 56.03, 1),
			line('B/Kist Vanilla S/Wich Ckie', 56.03, 1)
		];

		// When seams are marked
		const result = markSeamDuplicates(items);

		// Then none of them is a suspected duplicate — six of one thing is a real purchase
		expect(result.map((i) => i.possible_duplicate)).toEqual([
			false,
			false,
			false,
			false,
			false,
			false
		]);
	});

	it('marks only the later copy when a run repeats across a seam', () => {
		// Given two lines that end photo 1 and reappear at the start of photo 2
		const items = [
			line('Orchid Paper Towel', 236.88, 1),
			line('Forka Oats 400G', 304.27, 1),
			line('Orchid Paper Towel', 236.88, 2),
			line('Forka Oats 400G', 304.27, 2),
			line('J.F. Mills Festival Mix', 616.04, 2)
		];

		// When seams are marked
		const result = markSeamDuplicates(items);

		// Then the first occurrence stays clean and the repeat is flagged
		expect(result.map((i) => i.possible_duplicate)).toEqual([false, false, true, true, false]);
	});

	it('does not extend an overlap run past the seam into an earlier photo', () => {
		// Given photo 2 holding a single line that also appears at the head of photo 3
		const items = [
			line('Betapac Curry Powder 450G', 280, 1),
			line('Grace Corned Beef 340G', 244.11, 2),
			line('Grace Corned Beef 340G', 244.11, 3),
			line('Betapac Curry Powder 450G', 280, 3)
		];

		// When seams are marked
		const result = markSeamDuplicates(items);

		// Then only the one line photo 2 actually contains is treated as the overlap; the
		// curry powder further back belongs to photo 1 and is out of reach
		expect(result.map((i) => i.possible_duplicate)).toEqual([false, false, true, false]);
	});

	it('returns items untouched when no line carries an image index', () => {
		// Given a single-photo parse, where the model omits `image`
		const items = [line('Grace Coconut Milk 400ml', 385), line('Grace Coconut Milk 400ml', 385)];

		// When seams are marked
		const result = markSeamDuplicates(items);

		// Then nothing is marked — there is no seam to compare across
		expect(result.every((i) => !i.possible_duplicate)).toBe(true);
	});

	it('keeps a genuine repeat that follows a seam overlap', () => {
		// Given photo 2 that repeats one seam line and then genuinely buys it again
		const items = [
			line('Lasco Butter Beans 400G', 239.74, 1),
			line('Lasco Butter Beans 400G', 239.74, 2),
			line('Lasco Butter Beans 400G', 239.74, 2)
		];

		// When seams are marked
		const result = markSeamDuplicates(items);

		// Then only the line that mirrors the tail of photo 1 is marked
		expect(result.map((i) => i.possible_duplicate)).toEqual([false, true, false]);
	});

	it('matches across a seam despite whitespace and casing differences', () => {
		// Given the same row read slightly differently in each photo
		const items = [
			line('Sophie  Bathroom TISSUE 400s', 93.63, 1),
			line('sophie bathroom tissue 400s', 93.63, 2)
		];

		// When seams are marked
		const result = markSeamDuplicates(items);

		// Then it is still recognised as one printed row seen twice
		expect(result.map((i) => i.possible_duplicate)).toEqual([false, true]);
	});

	it('does not mark a seam line whose price differs', () => {
		// Given the same product either side of a seam at two different prices — receipt 3
		// prints many such near-identical rows
		const items = [
			line('Grace Mixed Vegetables 240', 236.88, 1),
			line('Grace Mixed Vegetables 240', 229.3, 2)
		];

		// When seams are marked
		const result = markSeamDuplicates(items);

		// Then both survive: two prices means two rows on the paper
		expect(result.map((i) => i.possible_duplicate)).toEqual([false, false]);
	});
});

function line(name: string, unit_price: number, image?: number) {
	return {
		name,
		quantity: 1,
		unit_price,
		total: unit_price,
		image,
		flagged: false,
		possible_duplicate: false
	};
}
