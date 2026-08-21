import type { ParsedReceipt } from './parser.ts';

type LineItem = ParsedReceipt['line_items'][number];

// A long receipt photographed in parts overlaps at the seams, so the same printed row can be
// read twice. Two identical rows on the paper look exactly like one row photographed twice —
// the only thing that separates them is which photo each was read from. So we compare across
// frame boundaries and nowhere else: a run of identical items inside one photo is a genuine
// repeat purchase (six identical snacks on one receipt is normal) and is never touched.
export function markSeamDuplicates(items: LineItem[]): LineItem[] {
	const duplicates = new Set<number>();
	for (const seam of seamBoundaries(items)) {
		const length = overlapRunLength(items, seam);
		for (let i = 0; i < length; i++) duplicates.add(seam + i);
	}
	if (duplicates.size === 0) return items;
	return items.map((item, i) => (duplicates.has(i) ? { ...item, possible_duplicate: true } : item));
}

// Indexes where a new photograph starts. Lines without an `image` — a single-image parse, or a
// model that ignored the field — yield no seams, so nothing is ever marked.
function seamBoundaries(items: LineItem[]): number[] {
	const seams: number[] = [];
	for (let i = 1; i < items.length; i++) {
		const previous = items[i - 1].image;
		const current = items[i].image;
		if (previous !== undefined && current !== undefined && current > previous) seams.push(i);
	}
	return seams;
}

// The longest run of lines that ends the earlier photo and repeats at the start of the later
// one. Bounded by each side's own extent so a run can never reach past a neighbouring seam,
// and capped because a plausible overlap is a line or two, not half a receipt.
const MAX_OVERLAP = 12;

function overlapRunLength(items: LineItem[], seam: number): number {
	const before = items[seam - 1].image;
	const after = items[seam].image;
	const limit = Math.min(MAX_OVERLAP, countBack(items, seam, before), countOn(items, seam, after));
	for (let length = limit; length >= 1; length--) {
		if (runsMatch(items, seam, length)) return length;
	}
	return 0;
}

function runsMatch(items: LineItem[], seam: number, length: number): boolean {
	for (let i = 0; i < length; i++) {
		if (lineKey(items[seam - length + i]) !== lineKey(items[seam + i])) return false;
	}
	return true;
}

// How many lines immediately before the seam belong to the earlier photo.
function countBack(items: LineItem[], seam: number, image: number | undefined): number {
	let count = 0;
	while (count < seam && items[seam - 1 - count].image === image) count++;
	return count;
}

// How many lines from the seam onwards belong to the later photo.
function countOn(items: LineItem[], seam: number, image: number | undefined): number {
	let count = 0;
	while (seam + count < items.length && items[seam + count].image === image) count++;
	return count;
}

// Two readings of one printed row differ in whitespace and casing far more often than in
// price, so the name is normalised and the unit price is not.
function lineKey(item: LineItem): string {
	return `${item.name.trim().toLowerCase().replace(/\s+/g, ' ')}|${item.unit_price}`;
}
