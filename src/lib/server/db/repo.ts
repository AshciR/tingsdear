import { and, eq, sql } from 'drizzle-orm';
import type { Db } from './index.ts';
import { STORE_NAME_REQUIRED } from '$lib/receipt-messages';
import { item, manufacturer, price, supermarketChain, supermarketLocation } from './schema.ts';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export type ReceiptSaveLineItem = {
	name: string;
	unit_price: number;
};

export type ReceiptSaveRequest = {
	supermarket: {
		name: string;
		branch?: string;
		address?: string;
		city?: string;
		region?: string;
		country?: string;
	};
	purchase_date: string;
	line_items: ReceiptSaveLineItem[];
};

export type SavedLineItem = {
	itemId: number;
	itemName: string;
	priceId: number;
	created: boolean;
};

export type SaveReceiptResult = {
	chainId: number;
	chainCreated: boolean;
	locationId: number;
	locationCreated: boolean;
	lineItems: SavedLineItem[];
};

export async function saveReceipt(db: Db, receipt: ReceiptSaveRequest): Promise<SaveReceiptResult> {
	const chainName = requireChainName(receipt.supermarket);
	return db.transaction(async (tx) => {
		const unknownMfrId = await findOrCreateUnknownManufacturer(tx);
		const chain = await findOrCreateChain(tx, chainName);
		const location = await findOrCreateLocation(tx, chain.id, receipt.supermarket);
		const timestamp = new Date(`${receipt.purchase_date}T00:00:00Z`);

		// Sequential, not Promise.all: a transaction is pinned to one connection, so
		// concurrent queries interleave. Two lines naming the same product would both
		// miss the find-or-create SELECT before either INSERT ran, duplicating the item.
		const lineItems: SavedLineItem[] = [];
		for (const lineItem of receipt.line_items) {
			lineItems.push(await saveLineItem(tx, lineItem, location.id, unknownMfrId, timestamp));
		}

		return {
			chainId: chain.id,
			chainCreated: chain.created,
			locationId: location.id,
			locationCreated: location.created,
			lineItems
		};
	});
}

// Checked before the transaction opens so a nameless receipt writes nothing at all. There is
// deliberately no placeholder here: filing prices under an invented chain merges unrelated
// supermarkets into one price history, silently and irreversibly.
function requireChainName(supermarket: ReceiptSaveRequest['supermarket']): string {
	const name = supermarket.name?.trim();
	if (!name) throw new Error(STORE_NAME_REQUIRED);
	return name;
}

async function findOrCreateUnknownManufacturer(tx: Tx): Promise<number> {
	const existing = await tx
		.select({ id: manufacturer.id })
		.from(manufacturer)
		.where(sql`lower(${manufacturer.name}) = lower('Unknown')`)
		.limit(1);
	if (existing[0]) return existing[0].id;
	const inserted = await tx
		.insert(manufacturer)
		.values({ name: 'Unknown' })
		.returning({ id: manufacturer.id });
	return inserted[0].id;
}

async function findOrCreateChain(tx: Tx, name: string): Promise<{ id: number; created: boolean }> {
	const existing = await tx
		.select({ id: supermarketChain.id })
		.from(supermarketChain)
		.where(sql`lower(${supermarketChain.name}) = lower(${name})`)
		.limit(1);
	if (existing[0]) return { id: existing[0].id, created: false };
	const inserted = await tx
		.insert(supermarketChain)
		.values({ name })
		.returning({ id: supermarketChain.id });
	return { id: inserted[0].id, created: true };
}

async function findOrCreateLocation(
	tx: Tx,
	chainId: number,
	supermarket: ReceiptSaveRequest['supermarket']
): Promise<{ id: number; created: boolean }> {
	const name = supermarket.branch ?? 'Default';
	const address = supermarket.address ?? null;
	const where = address
		? and(
				eq(supermarketLocation.chainId, chainId),
				sql`lower(${supermarketLocation.address}) = lower(${address})`
			)
		: and(eq(supermarketLocation.chainId, chainId), eq(supermarketLocation.name, name));
	const existing = await tx
		.select({ id: supermarketLocation.id })
		.from(supermarketLocation)
		.where(where)
		.limit(1);
	if (existing[0]) return { id: existing[0].id, created: false };
	const inserted = await tx
		.insert(supermarketLocation)
		.values({
			chainId,
			name,
			address,
			city: supermarket.city ?? null,
			region: supermarket.region ?? null,
			country: supermarket.country ?? null
		})
		.returning({ id: supermarketLocation.id });
	return { id: inserted[0].id, created: true };
}

async function saveLineItem(
	tx: Tx,
	lineItem: ReceiptSaveLineItem,
	locationId: number,
	unknownMfrId: number,
	timestamp: Date
): Promise<SavedLineItem> {
	const { id: itemId, created } = await findOrCreateItem(tx, lineItem.name, unknownMfrId);
	const priceId = await insertReceiptPrice(tx, locationId, itemId, lineItem.unit_price, timestamp);
	return { itemId, itemName: lineItem.name, priceId, created };
}

async function findOrCreateItem(
	tx: Tx,
	name: string,
	unknownMfrId: number
): Promise<{ id: number; created: boolean }> {
	const existing = await tx
		.select({ id: item.id })
		.from(item)
		.where(sql`lower(${item.name}) = lower(${name})`)
		.limit(1);
	if (existing[0]) return { id: existing[0].id, created: false };
	const inserted = await tx
		.insert(item)
		.values({
			name,
			manufacturerId: unknownMfrId,
			categoryId: null,
			sizeAmount: '1',
			sizeUnit: 'ct',
			unitType: 'count',
			sizeInBaseUnit: '1'
		})
		.returning({ id: item.id });
	return { id: inserted[0].id, created: true };
}

async function insertReceiptPrice(
	tx: Tx,
	locationId: number,
	itemId: number,
	unitPrice: number,
	timestamp: Date
): Promise<number> {
	const inserted = await tx
		.insert(price)
		.values({
			locationId,
			itemId,
			amount: unitPrice.toFixed(2),
			source: 'receipt_ocr',
			sourceRef: null,
			timestamp
		})
		.returning({ id: price.id });
	return inserted[0].id;
}
