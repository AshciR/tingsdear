import type { LocationCandidate, ResolvedSupermarket } from '$lib/server/supermarkets/resolver';

// The thresholds live here, not beside the scorer, because both sides need them: the resolver
// scores against them and the verify screen decides what to pre-select by them. Nothing in this
// file touches the database, so it is safe to ship to a browser — see receipts/messages.ts for
// why that matters at a $lib/server boundary.
//
// At or above HIGH the verify UI pre-selects the candidate; between LOW and HIGH it shows it as
// a suggestion but still defaults to "new branch". Never auto-merge below HIGH: a wrong merge
// silently fuses two supermarkets' price histories and is hard to unwind.
export const HIGH_CONFIDENCE = 0.8;
export const LOW_CONFIDENCE = 0.25;

// What the branch picker starts on. Null means "new branch" — the safe default whenever the
// evidence is only suggestive, which is every score below HIGH.
export function preselectedLocationId(resolution: ResolvedSupermarket | null): number | null {
	const top = resolution?.candidates[0];
	if (!top?.location || top.score < HIGH_CONFIDENCE) return null;
	return top.location.id;
}

// Candidates that name a real row. The `new` entry is always present and is rendered as its own
// option, so an empty list here means there is nothing to choose between.
export function existingCandidates(resolution: ResolvedSupermarket | null): LocationCandidate[] {
	return (resolution?.candidates ?? []).filter((candidate) => candidate.location !== null);
}

// "Constant Spring — 144 Constant Spring Rd (matched)". The suffix is the honest part: it tells
// the user whether the app is confident or merely guessing, so a suggestion is not mistaken for
// a fact when they accept it.
export function describeCandidate(candidate: LocationCandidate): string {
	const { location } = candidate;
	if (!location) return '+ New branch';
	const parts = [location.name, location.address, location.city].filter(Boolean);
	return `${parts.join(' — ') || `Branch ${location.id}`} (${strength(candidate.score)})`;
}

function strength(score: number): string {
	if (score >= HIGH_CONFIDENCE) return 'matched';
	if (score > LOW_CONFIDENCE) return 'suggested';
	return 'possible';
}
