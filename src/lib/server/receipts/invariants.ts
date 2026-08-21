import { SUPERMARKET_NAME_REQUIRED } from '$lib/receipts/messages';

// Rules a receipt must satisfy before any of it is written. They live outside save.ts so the
// transaction reads as orchestration only, and so they can be exercised without a database.
// Each takes the narrowest shape it actually needs rather than importing ReceiptSaveRequest,
// which would point a dependency back at save.ts and rebuild the cycle this layout removed.

// Checked before the transaction opens so a nameless receipt writes nothing at all. There is
// deliberately no placeholder here: filing prices under an invented chain merges unrelated
// supermarkets into one price history, silently and irreversibly.
export function requireChainName(supermarket: { name?: string }): string {
	const name = supermarket.name?.trim();
	if (!name) throw new Error(SUPERMARKET_NAME_REQUIRED);
	return name;
}
