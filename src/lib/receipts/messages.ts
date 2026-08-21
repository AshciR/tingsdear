// The one module in the receipt domain that both sides of the SvelteKit boundary import: the
// save route and receipts/invariants.ts on the server, VerifyView on the client. That makes it
// the designated crossing point, and it has to stay safe to ship to a browser.
//
// Keep it to user-facing copy. Nothing derived from $env, no keys, no table names, no anything
// that would matter if a stranger read the client bundle — this file cannot live under
// $lib/server, so SvelteKit's illegal-import guard will not catch a mistake made here.
export const SUPERMARKET_NAME_REQUIRED =
	'Add the supermarket name before saving — this receipt has no readable header.';
