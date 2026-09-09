import { render } from 'vitest-browser-svelte';
import { describe, it, expect, vi } from 'vitest';
import VerifyView from './VerifyView.svelte';
import type { ParsedReceipt, ResolvedSupermarket } from '$lib/receipts/client';
import { SUPERMARKET_NAME_REQUIRED } from '$lib/receipts/messages';
import { HIGH_CONFIDENCE, preselectedLocationId } from '$lib/supermarkets/candidates';

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

	it('shows the parsed supermarket and purchase date for correction', async () => {
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

	it('writes a corrected supermarket name back to the receipt', async () => {
		// Given a supermarket name the parser misread
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

	it('still counts a suspected duplicate as being saved', async () => {
		// Given two lines, one of which may repeat the previous photo at a seam
		const receipt = makeReceipt({
			line_items: [
				makeLineItem({ name: 'Milk' }),
				makeLineItem({ name: 'Milk', possible_duplicate: true })
			]
		});

		// When the verify view is rendered
		const screen = render(VerifyView, { receipt, error: null, saving: false, onConfirm: vi.fn() });

		// Then it is pointed out but left in — dropping a real second purchase is the worse
		// mistake, so the user makes the call
		await expect.element(screen.getByText(/2 of 2 will be saved/u)).toBeInTheDocument();
		await expect.element(screen.getByText(/1 line looks like a repeat/u)).toBeInTheDocument();
	});

	it('says nothing about duplicates when no line looks repeated', async () => {
		// Given two ordinary lines
		const receipt = makeReceipt({
			line_items: [makeLineItem({ name: 'Milk' }), makeLineItem({ name: 'Bread' })]
		});

		// When the verify view is rendered
		const screen = render(VerifyView, { receipt, error: null, saving: false, onConfirm: vi.fn() });

		// Then the seam hint stays out of the way
		expect(screen.getByText(/looks like a repeat/u).query()).toBeNull();
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

	it('cannot be confirmed while the supermarket name is empty', async () => {
		// Given a continuation page of a split receipt, which carries no supermarket header
		const receipt = makeReceipt({ supermarket: {} });

		// When the verify view is rendered
		const screen = render(VerifyView, { receipt, error: null, saving: false, onConfirm: vi.fn() });

		// Then saving is blocked and the user is told what to do about it
		await expect.element(screen.getByRole('button', { name: 'Confirm and save' })).toBeDisabled();
		await expect.element(screen.getByText(SUPERMARKET_NAME_REQUIRED)).toBeInTheDocument();
	});

	it('can be confirmed once the user types a supermarket name', async () => {
		// Given a receipt with no supermarket name
		const receipt = makeReceipt({ supermarket: {} });
		const screen = render(VerifyView, { receipt, error: null, saving: false, onConfirm: vi.fn() });

		// When the user supplies one
		await screen.getByLabelText('Name').fill('General Food Supermarket');

		// Then the warning clears and the receipt can be saved
		expect(screen.getByText(SUPERMARKET_NAME_REQUIRED).query()).toBeNull();
		await expect.element(screen.getByRole('button', { name: 'Confirm and save' })).toBeEnabled();
	});

	it('offers the branches already on file for this chain', async () => {
		// Given a chain with two known branches
		const resolution = makeResolution([
			{ id: 7, name: 'Constant Spring', score: 0.9, reason: 'address' },
			{ id: 8, name: 'Liguanea', score: 0.3, reason: 'city-region' }
		]);

		// When the verify view is rendered
		const screen = render(VerifyView, {
			receipt: makeReceipt(),
			resolution,
			selectedLocationId: preselectedLocationId(resolution),
			error: null,
			saving: false,
			onConfirm: vi.fn()
		});

		// Then the user can file the receipt against either one, or against neither
		const picker = screen.getByLabelText('Branch on file');
		await expect.element(picker).toBeInTheDocument();
		await expect
			.element(screen.getByRole('option', { name: /Constant Spring/u }))
			.toBeInTheDocument();
		await expect.element(screen.getByRole('option', { name: /Liguanea/u })).toBeInTheDocument();
		await expect.element(screen.getByRole('option', { name: '+ New branch' })).toBeInTheDocument();
	});

	it('starts on a confidently matched branch so the prices join that store', async () => {
		// Given a branch matched on its full address
		const resolution = makeResolution([
			{ id: 7, name: 'Constant Spring', score: HIGH_CONFIDENCE, reason: 'address' }
		]);

		// When the view opens on the pre-selection the page computed
		const screen = render(VerifyView, {
			receipt: makeReceipt(),
			resolution,
			selectedLocationId: preselectedLocationId(resolution),
			error: null,
			saving: false,
			onConfirm: vi.fn()
		});

		// Then that branch is what the user is about to save under
		await expect.element(screen.getByLabelText('Branch on file')).toHaveValue('7');
	});

	it('leaves a merely suggested branch unselected rather than merging into it', async () => {
		// Given a branch matched on city alone — suggestive, not conclusive
		const resolution = makeResolution([
			{ id: 7, name: 'Constant Spring', score: 0.3, reason: 'city-region' }
		]);

		// When the view opens
		const screen = render(VerifyView, {
			receipt: makeReceipt(),
			resolution,
			selectedLocationId: preselectedLocationId(resolution),
			error: null,
			saving: false,
			onConfirm: vi.fn()
		});

		// Then it is offered, but a new branch is what gets saved unless the user says otherwise
		await expect
			.element(screen.getByRole('option', { name: /Constant Spring/u }))
			.toBeInTheDocument();
		await expect.element(screen.getByLabelText('Branch on file')).toHaveValue('new');
	});

	it('tells the parent which branch the user picked', async () => {
		// Given two branches to choose between
		const onSelectLocation = vi.fn();
		const screen = render(VerifyView, {
			receipt: makeReceipt(),
			resolution: makeResolution([
				{ id: 7, name: 'Constant Spring', score: 0.3, reason: 'city-region' },
				{ id: 8, name: 'Liguanea', score: 0.3, reason: 'city-region' }
			]),
			selectedLocationId: null,
			error: null,
			saving: false,
			onConfirm: vi.fn(),
			onSelectLocation
		});

		// When the user picks the second one
		await screen
			.getByLabelText('Branch on file')
			.selectOptions(screen.getByRole('option', { name: /Liguanea/u }));

		// Then the parent is told to save under it
		expect(onSelectLocation).toHaveBeenCalledWith(8);
	});

	it('drops the picked branch and re-resolves when the chain name is corrected', async () => {
		// Given a branch selected under the parsed chain name
		const onSelectLocation = vi.fn();
		const onSupermarketChange = vi.fn();
		const screen = render(VerifyView, {
			receipt: makeReceipt({ supermarket: { name: 'HI LO' } }),
			resolution: makeResolution([
				{ id: 7, name: 'Constant Spring', score: 0.9, reason: 'address' }
			]),
			selectedLocationId: 7,
			error: null,
			saving: false,
			onConfirm: vi.fn(),
			onSelectLocation,
			onSupermarketChange
		});

		// When the user corrects the chain to a different supermarket entirely
		await screen.getByLabelText('Name').fill('MegaMart');

		// Then the stale branch is released at once, before it can be saved under the wrong chain
		expect(onSelectLocation).toHaveBeenCalledWith(null);

		// And once the edit is committed, the branches are looked up again for the new name
		await screen.getByLabelText('Purchase date').click();
		expect(onSupermarketChange).toHaveBeenCalledOnce();
	});

	it('hides the branch picker when this chain has no branches yet', async () => {
		// Given a first-ever receipt from an unknown chain
		const screen = render(VerifyView, {
			receipt: makeReceipt(),
			resolution: makeResolution([]),
			selectedLocationId: null,
			error: null,
			saving: false,
			onConfirm: vi.fn()
		});

		// Then there is nothing to choose between, so nothing is asked
		expect(screen.getByLabelText('Branch on file').query()).toBeNull();
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

// The view mutates the receipt it is handed — `bind:value` on the supermarket fields, push/splice on
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

// Shaped like what /api/receipts/resolve returns: the scored branches, best first, with the
// "new branch" option the resolver always appends.
function makeResolution(
	branches: { id: number; name: string; score: number; reason: string }[]
): ResolvedSupermarket {
	const candidates = branches.map(({ id, name, score, reason }) => ({
		location: { id, name, address: null, city: 'Kingston' },
		score,
		reason
	}));
	return {
		chainId: 1,
		chainName: 'Hi-Lo',
		candidates: [...candidates, { location: null, score: 0, reason: 'new' }]
	} as ResolvedSupermarket;
}

function makeLineItem(overrides: Partial<ParsedReceipt['line_items'][number]> = {}) {
	return {
		name: 'Milk',
		quantity: 1,
		unit_price: 2.5,
		total: 2.5,
		flagged: false,
		possible_duplicate: false,
		...overrides
	};
}
