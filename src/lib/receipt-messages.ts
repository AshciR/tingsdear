// Shared by the save route, the repo guard and VerifyView. It lives here rather than in
// receipt-parser.ts because that module imports the Anthropic SDK and $env/dynamic/private,
// which a value import would drag into the client bundle.
export const SUPERMARKET_NAME_REQUIRED =
	'Add the supermarket name before saving — this receipt has no readable header.';
