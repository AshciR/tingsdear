import { render } from 'vitest-browser-svelte';
import { describe, it, expect, vi } from 'vitest';
import VerifyView from './VerifyView.svelte';
import type { ParsedReceipt } from '$lib/receipt-client';
import { STORE_NAME_REQUIRED } from '$lib/receipt-messages';

describe('VerifyView', () => {
	it('shows what the parser made of the receipt', async () => {
		// Given a receipt parsed with medium confidence in Jamaican dollars
		const receipt = makeReceipt({ confidence: 'medium', currency: 'JMD' });

		// When the verify view is rendered
		const screen = render(VerifyView, { receipt, error: null, saving: false, onConfirm: vi.fn() });

		// Then the user sees how much to trust it before checking the details
		await expect.element(screen.getByText(/confidence: medium/iu)).toBeInTheDocument();
		await expect.element(screen.getByText(/currency JMD/u)).toBeInTheDocument();
	});

	it('shows the parsed store and purchase date for correction', async () => {
		// Given a receipt from a named branch
		const receipt = makeReceipt({
			supermarket: { name: 'Hi-Lo', branch: 'Barbican', city: 'Kingston' },
			purchase_date: '2026-03-04'
		});

		// When the verify view is rendered
		const screen = render(VerifyView, { receipt, error: null, saving: false, onConfirm: vi.fn() });

		// Then each field is editable and pre-filled with what was read
		await expect.element(screen.getByLabelText('Name')).toHaveValue('Hi-Lo');
		await expect.element(screen.getByLabelText('Branch')).toHaveValue('Barbican');
		await expect.element(screen.getByLabelText('City')).toHaveValue('Kingston');
		await expect.element(screen.getByLabelText('Purchase date')).toHaveValue('2026-03-04');
	});

	it('writes a corrected store name back to the receipt', async () => {
		// Given a store name the parser misread
		const receipt = makeReceipt({ supermarket: { name: 'HI LO FOOD STRS' } });
		const screen = render(VerifyView, { receipt, error: null, saving: false, onConfirm: vi.fn() });

		// When the user corrects it
		await screen.getByLabelText('Name').fill('Hi-Lo Food Stores');

		// Then the correction reaches the receipt the parent handed in
		expect(receipt.supermarket.name).toBe('Hi-Lo Food Stores');
	});

	it('counts only the unflagged lines as being saved', async () => {
		// Given three lines, one of which the parser flagged as a subtotal
		const receipt = makeReceipt({
			line_items: [
				makeLineItem({ name: 'Milk' }),
				makeLineItem({ name: 'Bread' }),
				makeLineItem({ name: 'SUBTOTAL', flagged: true })
			]
		});

		// When the verify view is rendered
		const screen = render(VerifyView, { receipt, error: null, saving: false, onConfirm: vi.fn() });

		// Then the user is told how many lines will actually be saved
		await expect.element(screen.getByText(/2 of 3 will be saved/u)).toBeInTheDocument();
	});

	it('removes a line the user deletes', async () => {
		// Given a receipt with two lines
		const receipt = makeReceipt({
			line_items: [makeLineItem({ name: 'Milk' }), makeLineItem({ name: 'Bread' })]
		});
		const screen = render(VerifyView, { receipt, error: null, saving: false, onConfirm: vi.fn() });

		// When the user removes the first one
		await screen.getByRole('button', { name: 'Remove this line' }).first().click();

		// Then only the other line is left
		await expect.element(screen.getByText(/1 of 1 will be saved/u)).toBeInTheDocument();
		await expect.element(screen.getByPlaceholder('Item name')).toHaveValue('Bread');
	});

	it('adds an empty line for a row the parser missed', async () => {
		// Given a receipt with one line
		const receipt = makeReceipt({ line_items: [makeLineItem({ name: 'Milk' })] });
		const screen = render(VerifyView, { receipt, error: null, saving: false, onConfirm: vi.fn() });

		// When the user adds a row
		await screen.getByRole('button', { name: '+ Add row' }).click();

		// Then there is a new, blank, included line to type into
		await expect.element(screen.getByText(/2 of 2 will be saved/u)).toBeInTheDocument();
		await expect.element(screen.getByPlaceholder('Item name').nth(1)).toHaveValue('');
	});

	it('saves the receipt when the user confirms', async () => {
		// Given a receipt the user is happy with
		const onConfirm = vi.fn();
		const screen = render(VerifyView, {
			receipt: makeReceipt(),
			error: null,
			saving: false,
			onConfirm
		});

		// When they confirm
		await screen.getByRole('button', { name: 'Confirm and save' }).click();

		// Then the parent is asked to save, once
		expect(onConfirm).toHaveBeenCalledOnce();
	});

	it('cannot be confirmed twice while a save is in flight', async () => {
		// Given a save already under way
		const screen = render(VerifyView, {
			receipt: makeReceipt(),
			error: null,
			saving: true,
			onConfirm: vi.fn()
		});

		// Then the button says so and refuses further clicks
		await expect.element(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
	});

	it('cannot be confirmed while the store name is empty', async () => {
		// Given a continuation page of a split receipt, which carries no store header
		const receipt = makeReceipt({ supermarket: {} });

		// When the verify view is rendered
		const screen = render(VerifyView, { receipt, error: null, saving: false, onConfirm: vi.fn() });

		// Then saving is blocked and the user is told what to do about it
		await expect.element(screen.getByRole('button', { name: 'Confirm and save' })).toBeDisabled();
		await expect.element(screen.getByText(STORE_NAME_REQUIRED)).toBeInTheDocument();
	});

	it('can be confirmed once the user types a store name', async () => {
		// Given a receipt with no store name
		const receipt = makeReceipt({ supermarket: {} });
		const screen = render(VerifyView, { receipt, error: null, saving: false, onConfirm: vi.fn() });

		// When the user supplies one
		await screen.getByLabelText('Name').fill('General Food Supermarket');

		// Then the warning clears and the receipt can be saved
		expect(screen.getByText(STORE_NAME_REQUIRED).query()).toBeNull();
		await expect.element(screen.getByRole('button', { name: 'Confirm and save' })).toBeEnabled();
	});

	it('shows the error the parent reports and still allows a retry', async () => {
		// Given a save that failed upstream
		const screen = render(VerifyView, {
			receipt: makeReceipt(),
			error: 'Could not save the receipt (500)',
			saving: false,
			onConfirm: vi.fn()
		});

		// Then the user is told what went wrong, and can try again
		await expect.element(screen.getByText('Could not save the receipt (500)')).toBeInTheDocument();
		await expect.element(screen.getByRole('button', { name: 'Confirm and save' })).toBeEnabled();
	});
});

// The view mutates the receipt it is handed — `bind:value` on the store fields, push/splice on
// the line items — and in the real app the page owns that object as reactive state. Hand out a
// $state proxy so added and deleted rows actually re-render, as they do in production.
function makeReceipt(overrides: Partial<ParsedReceipt> = {}) {
	const receipt = $state<ParsedReceipt>({
		supermarket: { name: 'Hi-Lo' },
		purchase_date: '2026-03-04',
		line_items: [makeLineItem()],
		currency: 'JMD',
		confidence: 'high',
		...overrides
	});
	return receipt;
}

function makeLineItem(overrides: Partial<ParsedReceipt['line_items'][number]> = {}) {
	return { name: 'Milk', quantity: 1, unit_price: 2.5, total: 2.5, flagged: false, ...overrides };
}
