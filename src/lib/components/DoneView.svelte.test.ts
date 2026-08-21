import { render } from 'vitest-browser-svelte';
import { describe, it, expect, vi } from 'vitest';
import DoneView from './DoneView.svelte';
import type { SaveReceiptResult } from '$lib/receipt-client';

describe('DoneView', () => {
	it('reports how many prices were saved', async () => {
		// Given a save that recorded two prices
		const result = makeResult({
			lineItems: [
				makeSavedLine({ itemName: 'Milk', priceId: 1 }),
				makeSavedLine({ itemName: 'Bread', priceId: 2 })
			]
		});

		// When the done view is rendered
		const screen = render(DoneView, { result, onReset: vi.fn() });

		// Then the user sees the count and each item that was saved
		await expect
			.element(screen.getByRole('heading', { name: 'Saved 2 prices' }))
			.toBeInTheDocument();
		await expect.element(screen.getByText('Milk')).toBeInTheDocument();
		await expect.element(screen.getByText('Bread')).toBeInTheDocument();
	});

	it('says when the supermarket was newly created', async () => {
		// Given a receipt from a chain and location seen for the first time
		const result = makeResult({
			chainId: 7,
			chainCreated: true,
			locationId: 12,
			locationCreated: true
		});

		// When the done view is rendered
		const screen = render(DoneView, { result, onReset: vi.fn() });

		// Then the user can tell the supermarket was added rather than reused
		await expect.element(screen.getByText(/Chain #7 \(new chain\)/u)).toBeInTheDocument();
		await expect.element(screen.getByText(/Location #12 \(new location\)/u)).toBeInTheDocument();
	});

	it('says when the supermarket was matched to an existing one', async () => {
		// Given a receipt from a chain and location already on file
		const result = makeResult({
			chainId: 7,
			chainCreated: false,
			locationId: 12,
			locationCreated: false
		});

		// When the done view is rendered
		const screen = render(DoneView, { result, onReset: vi.fn() });

		// Then the user can tell nothing duplicate was created
		await expect
			.element(screen.getByText(/Chain #7 \(matched existing chain\)/u))
			.toBeInTheDocument();
		await expect
			.element(screen.getByText(/Location #12 \(matched existing location\)/u))
			.toBeInTheDocument();
	});

	it('distinguishes newly created items from ones already known', async () => {
		// Given a save where one product was new and the other already existed
		const result = makeResult({
			lineItems: [
				makeSavedLine({ itemName: 'Milk', priceId: 1, created: true }),
				makeSavedLine({ itemName: 'Bread', priceId: 2, created: false })
			]
		});

		// When the done view is rendered
		const screen = render(DoneView, { result, onReset: vi.fn() });

		// Then each line says which it was
		await expect.element(screen.getByText('new item')).toBeInTheDocument();
		await expect.element(screen.getByText('existing item')).toBeInTheDocument();
	});

	it('starts a fresh scan when the user asks for another', async () => {
		// Given a finished save
		const onReset = vi.fn();
		const screen = render(DoneView, { result: makeResult(), onReset });

		// When the user chooses to scan another receipt
		await screen.getByRole('button', { name: 'Scan another' }).click();

		// Then the parent is asked to reset, once
		expect(onReset).toHaveBeenCalledOnce();
	});
});

function makeResult(overrides: Partial<SaveReceiptResult> = {}): SaveReceiptResult {
	return {
		chainId: 1,
		chainCreated: false,
		locationId: 2,
		locationCreated: false,
		lineItems: [makeSavedLine()],
		...overrides
	};
}

function makeSavedLine(overrides: Partial<SaveReceiptResult['lineItems'][number]> = {}) {
	return { itemId: 1, itemName: 'Milk', priceId: 1, created: true, ...overrides };
}
