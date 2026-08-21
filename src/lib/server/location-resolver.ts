import { eq } from 'drizzle-orm';
import type { Db } from './db/index.ts';
import { supermarketChain, supermarketLocation } from './db/schema.ts';

export type SupermarketLocation = typeof supermarketLocation.$inferSelect;

// The receipt never prints coordinates, so lat/lng only arrive if the capture step supplies
// them (a browser geolocation prompt). Optional here so geo scoring is live the day it does.
export type SupermarketQuery = {
	name?: string;
	branch?: string;
	address?: string;
	city?: string;
	region?: string;
	country?: string;
	latitude?: number;
	longitude?: number;
};

export type LocationCandidate = {
	location: SupermarketLocation | null;
	score: number;
	reason: 'geo' | 'address' | 'branch' | 'new';
};

export type ResolvedSupermarket = {
	chainId: number | null;
	chainName: string;
	candidates: LocationCandidate[];
};

// At or above HIGH the verify UI pre-selects the candidate; between LOW and HIGH it shows it as a
// suggestion but still defaults to "new branch". Never auto-merge below HIGH: a wrong merge
// silently fuses two stores' price histories and is hard to unwind.
export const HIGH_CONFIDENCE = 0.8;
export const LOW_CONFIDENCE = 0.25;

// Resolution only ever reads. The chain row is created at save from what the user confirms, so
// an abandoned verify leaves nothing behind.
export async function resolveSupermarket(
	db: Db,
	supermarket: SupermarketQuery
): Promise<ResolvedSupermarket> {
	const typed = supermarket.name?.trim() ?? '';
	const chain = typed ? await findChainByName(db, typed) : null;
	if (!chain) return { chainId: null, chainName: typed, candidates: [newBranchCandidate()] };

	const locations = await loadChainLocations(db, chain.id);
	return {
		chainId: chain.id,
		chainName: chain.name,
		candidates: rankCandidates(locations, supermarket)
	};
}

// Both "Super Valu Fresh Foods" and "Super Valu Home Centre" reduce to `super valu`, so a receipt
// naming either resolves to the one chain row. Mirrored in SQL by normalize_chain_name() — the
// two are pinned together by a test, so change them together.
export function normalizeChainName(raw: string): string {
	const base = collapse(raw);
	const stripped = base.replace(CHAIN_STOPWORDS, '').trim();
	// A chain genuinely called "Supermarket" must not normalize away to nothing.
	return stripped || base;
}

export function normalizeAddress(raw: string): string {
	return collapse(raw)
		.split(' ')
		.map((token) => STREET_SUFFIXES[token] ?? token)
		.join(' ');
}

// Trailing descriptors that distinguish branches of one chain rather than distinct chains. The
// source is shared verbatim with the SQL function, so it stays POSIX-compatible: no non-capturing
// groups, no lookarounds.
const CHAIN_STOPWORDS = new RegExp(
	'( (supermarkets?|super market|food stores?|fresh foods?|home cent(re|er)|wholesalers?|ltd|limited|inc))+$'
);

const STREET_SUFFIXES: Record<string, string> = {
	road: 'rd',
	street: 'st',
	avenue: 'ave',
	drive: 'dr',
	boulevard: 'blvd',
	highway: 'hwy',
	lane: 'ln',
	suite: 'unit',
	ste: 'unit',
	apt: 'unit'
};

const ADDRESS_MATCH = 0.9;
const BRANCH_MATCH = 0.6;
const CITY_REGION_MATCH = 0.3;
const GEO_MATCH = 0.95;

// Two receipts from points this close are the same store for any practical purpose — a plaza is
// bigger than this, but two distinct supermarkets in one plaza are not.
const GEO_MATCH_METERS = 150;

async function findChainByName(db: Db, name: string) {
	const rows = await db
		.select({ id: supermarketChain.id, name: supermarketChain.name })
		.from(supermarketChain)
		.where(eq(supermarketChain.normalizedName, normalizeChainName(name)))
		.limit(1);
	return rows[0] ?? null;
}

async function loadChainLocations(db: Db, chainId: number): Promise<SupermarketLocation[]> {
	return db.select().from(supermarketLocation).where(eq(supermarketLocation.chainId, chainId));
}

// Every scored location, best first, with "new branch" always available last — the user can
// always reject every suggestion.
function rankCandidates(
	locations: SupermarketLocation[],
	query: SupermarketQuery
): LocationCandidate[] {
	const scored = locations
		.map((location) => scoreLocation(location, query))
		.filter((candidate): candidate is LocationCandidate => candidate !== null)
		.sort((a, b) => b.score - a.score);
	return [...scored, newBranchCandidate()];
}

// Strongest signal wins outright rather than accumulating: a matching address already settles it,
// and adding a city match on top would push weak evidence over the pre-select threshold.
function scoreLocation(
	location: SupermarketLocation,
	query: SupermarketQuery
): LocationCandidate | null {
	if (matchesGeo(location, query)) return { location, score: GEO_MATCH, reason: 'geo' };
	if (matchesAddress(location, query)) return { location, score: ADDRESS_MATCH, reason: 'address' };
	if (matchesBranch(location, query)) return { location, score: BRANCH_MATCH, reason: 'branch' };
	if (matchesCityRegion(location, query))
		return { location, score: CITY_REGION_MATCH, reason: 'branch' };
	return null;
}

function matchesGeo(location: SupermarketLocation, query: SupermarketQuery): boolean {
	if (query.latitude === undefined || query.longitude === undefined) return false;
	if (location.latitude === null || location.longitude === null) return false;
	const distance = distanceMeters(
		{ latitude: query.latitude, longitude: query.longitude },
		{ latitude: Number(location.latitude), longitude: Number(location.longitude) }
	);
	return distance <= GEO_MATCH_METERS;
}

function matchesAddress(location: SupermarketLocation, query: SupermarketQuery): boolean {
	if (!query.address || !location.address) return false;
	return normalizeAddress(query.address) === normalizeAddress(location.address);
}

function matchesBranch(location: SupermarketLocation, query: SupermarketQuery): boolean {
	if (!query.branch || !location.name) return false;
	return collapse(query.branch) === collapse(location.name);
}

// City alone is weak — one chain can have several branches in Kingston — so it ranks a candidate
// without ever pre-selecting it. A stated region that disagrees rules the location out.
function matchesCityRegion(location: SupermarketLocation, query: SupermarketQuery): boolean {
	if (!query.city || !location.city) return false;
	if (collapse(query.city) !== collapse(location.city)) return false;
	if (!query.region || !location.region) return true;
	return collapse(query.region) === collapse(location.region);
}

export function distanceMeters(
	a: { latitude: number; longitude: number },
	b: { latitude: number; longitude: number }
): number {
	const EARTH_RADIUS_M = 6_371_000;
	const toRadians = (deg: number) => (deg * Math.PI) / 180;
	const dLat = toRadians(b.latitude - a.latitude);
	const dLon = toRadians(b.longitude - a.longitude);
	const h =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(toRadians(a.latitude)) * Math.cos(toRadians(b.latitude)) * Math.sin(dLon / 2) ** 2;
	return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

function newBranchCandidate(): LocationCandidate {
	return { location: null, score: 0, reason: 'new' };
}

// Lowercase, punctuation to spaces, whitespace collapsed. The SQL mirror is the same two
// regexp_replace calls, so keep this character class in step with normalize_chain_name().
function collapse(raw: string): string {
	return raw
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
}
