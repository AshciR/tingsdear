// The pure string rules behind supermarket identity: how a printed name or address is reduced
// to the form two spellings must agree on. Nothing here touches the database or imports
// anything, so both the resolver (which reads) and receipt save (which writes) can depend on
// it without either depending on the other.

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

// Lowercase, punctuation to spaces, whitespace collapsed. The SQL mirror is the same two
// regexp_replace calls, so keep this character class in step with normalize_chain_name().
export function collapse(raw: string): string {
	return raw
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
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
