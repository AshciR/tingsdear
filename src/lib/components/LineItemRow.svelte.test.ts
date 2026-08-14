import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import { describe, it, expect, vi } from 'vitest';
import LineItemRow from './LineItemRow.svelte';

// The row's Qty/Unit/Total captions are `sm:hidden` — VerifyView supplies column headers on
// wide screens instead. Viewport width therefore decides whether those inputs have an
// accessible name, so any test that queries them must set the width it means.
const PHONE = { width: 414, height: 896 };
const DESKTOP = { width: 1280, height: 800 };

describe('LineItemRow', () => {
	it('renders the name and amounts of the line item on a phone', async () => {
		// Given a line item for two litres of milk, on a phone-width screen
		await page.viewport(PHONE.width, PHONE.height);
		const item = makeLineItem({ name: 'Milk', quantity: 2, unit_price: 1.25, total: 2.5 });

		// When the row is rendered
		const screen = render(LineItemRow, { item, onDelete: vi.fn() });

		// Then each field shows its value, found by its visible caption
		await expect.element(screen.getByPlaceholder('Item name')).toHaveValue('Milk');
		await expect.element(screen.getByRole('spinbutton', { name: 'Qty' })).toHaveValue(2);
		await expect.element(screen.getByRole('spinbutton', { name: 'Unit' })).toHaveValue(1.25);
		await expect.element(screen.getByRole('spinbutton', { name: 'Total' })).toHaveValue(2.5);
	});

	it('names the amount fields at desktop width, where the captions are hidden', async () => {
		// Given the same line item on a desktop-width screen
		await page.viewport(DESKTOP.width, DESKTOP.height);
		const item = makeLineItem({ name: 'Milk', quantity: 2, unit_price: 1.25, total: 2.5 });

		// When the row is rendered
		const screen = render(LineItemRow, { item, onDelete: vi.fn() });

		// Then the amount fields are still identifiable, so screen readers can announce them
		await expect.element(screen.getByRole('spinbutton', { name: 'Qty' })).toHaveValue(2);
		await expect.element(screen.getByRole('spinbutton', { name: 'Unit' })).toHaveValue(1.25);
		await expect.element(screen.getByRole('spinbutton', { name: 'Total' })).toHaveValue(2.5);
	});

	// The row cannot remove itself — VerifyView owns the list and splices it. The spy is the
	// whole contract at this level; the row actually disappearing is asserted in VerifyView.
	it('asks the parent to delete the row when remove is clicked', async () => {
		// Given a row rendered for a single line item
		const onDelete = vi.fn();
		const screen = render(LineItemRow, { item: makeLineItem(), onDelete });

		// When the user clicks remove
		await screen.getByRole('button', { name: 'Remove this line' }).click();

		// Then the parent is told to delete this row, once
		expect(onDelete).toHaveBeenCalledOnce();
	});

	it('shows no review warning for an unflagged line', async () => {
		// Given a line item that parsed cleanly
		const item = makeLineItem({ flagged: false });

		// When the row is rendered
		const screen = render(LineItemRow, { item, onDelete: vi.fn() });

		// Then the line is included and carries no warning
		await expect.element(screen.getByRole('checkbox')).toBeChecked();
		await expect.element(screen.getByText(/non-product line/iu)).not.toBeInTheDocument();
	});

	it('shows a review warning for a flagged line', async () => {
		// Given a line item the parser flagged as suspicious
		const item = makeLineItem({ flagged: true });

		// When the row is rendered
		const screen = render(LineItemRow, { item, onDelete: vi.fn() });

		// Then it is excluded from the save and the warning explains why
		await expect.element(screen.getByRole('checkbox')).not.toBeChecked();
		await expect.element(screen.getByText(/non-product line/iu)).toBeInTheDocument();
	});

	it('flags the line when the user unchecks the include checkbox', async () => {
		// Given an unflagged line item
		const item = makeLineItem({ flagged: false });
		const screen = render(LineItemRow, { item, onDelete: vi.fn() });

		// When the user unchecks it
		await screen.getByRole('checkbox').click();

		// Then the warning appears
		await expect.element(screen.getByText(/non-product line/iu)).toBeInTheDocument();
	});

	it('writes an edited name back to the line item', async () => {
		// Given a line item the parser named badly
		const item = makeLineItem({ name: 'MLK 2PT' });
		const screen = render(LineItemRow, { item, onDelete: vi.fn() });

		// When the user corrects the name
		await screen.getByPlaceholder('Item name').fill('Milk 2 pint');

		// Then the correction reaches the item the parent handed in
		expect(item.name).toBe('Milk 2 pint');
	});
});

// The component mutates the item it is handed (`bind:value`, the flagged checkbox), and in the
// real app that object is always reactive state owned by the page. Hand out a $state proxy so
// fixtures behave the way production data does and mutations re-render.
function makeLineItem(overrides = {}) {
	const item = $state({
		name: 'Milk',
		quantity: 1,
		unit_price: 2.5,
		total: 2.5,
		flagged: false,
		...overrides
	});
	return item;
}
