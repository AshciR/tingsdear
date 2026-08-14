import { render } from 'vitest-browser-svelte';
import { describe, it, expect, vi } from 'vitest';
import UploadView from './UploadView.svelte';

describe('UploadView', () => {
	it('offers both ways to supply a receipt', async () => {
		// Given nothing chosen yet
		const screen = render(UploadView, {
			file: null,
			error: null,
			onFile: vi.fn(),
			onSubmit: vi.fn()
		});

		// Then the user can either shoot the receipt or pick a saved file
		await expect.element(screen.getByLabelText('Take photo')).toBeInTheDocument();
		await expect.element(screen.getByLabelText('Choose file')).toBeInTheDocument();
	});

	it('cannot be submitted until a file is chosen', async () => {
		// Given nothing chosen yet
		const screen = render(UploadView, {
			file: null,
			error: null,
			onFile: vi.fn(),
			onSubmit: vi.fn()
		});

		// Then parsing is not yet offered
		await expect.element(screen.getByRole('button', { name: 'Parse receipt' })).toBeDisabled();
	});

	it('hands the chosen file to the parent', async () => {
		// Given an upload view waiting for a file
		const onFile = vi.fn();
		const screen = render(UploadView, { file: null, error: null, onFile, onSubmit: vi.fn() });

		// When the user picks a receipt from their files
		await screen.getByLabelText('Choose file').upload(makeImageFile('receipt.png'));

		// Then the parent receives that file, once
		expect(onFile).toHaveBeenCalledOnce();
		expect(onFile).toHaveBeenCalledWith(expect.objectContaining({ name: 'receipt.png' }));
	});

	it('shows the name and a preview of a chosen image', async () => {
		// Given a photo of a receipt has been chosen
		const screen = render(UploadView, {
			file: makeImageFile('receipt.png'),
			error: null,
			onFile: vi.fn(),
			onSubmit: vi.fn()
		});

		// Then the user can confirm which file they are about to parse
		await expect.element(screen.getByText('receipt.png')).toBeInTheDocument();
		await expect.element(screen.getByRole('img', { name: 'Receipt preview' })).toBeInTheDocument();
	});

	it('names a chosen PDF without previewing it', async () => {
		// Given a PDF receipt, which the browser cannot render inline here
		const file = new File(['%PDF-1.4'], 'receipt.pdf', { type: 'application/pdf' });
		const screen = render(UploadView, { file, error: null, onFile: vi.fn(), onSubmit: vi.fn() });

		// Then the file is named but no preview is shown
		await expect.element(screen.getByText('receipt.pdf')).toBeInTheDocument();
		await expect
			.element(screen.getByRole('img', { name: 'Receipt preview' }))
			.not.toBeInTheDocument();
	});

	it('parses the receipt when the user submits a chosen file', async () => {
		// Given a chosen file and a parent listening for submission
		const onSubmit = vi.fn();
		const screen = render(UploadView, {
			file: makeImageFile('receipt.png'),
			error: null,
			onFile: vi.fn(),
			onSubmit
		});

		// When the user asks for it to be parsed
		await screen.getByRole('button', { name: 'Parse receipt' }).click();

		// Then the parent is asked to parse, once
		expect(onSubmit).toHaveBeenCalledOnce();
	});

	it('shows the error the parent reports', async () => {
		// Given a parse that failed upstream
		const screen = render(UploadView, {
			file: makeImageFile('receipt.png'),
			error: 'Could not read the receipt (500)',
			onFile: vi.fn(),
			onSubmit: vi.fn()
		});

		// Then the user is told what went wrong, and can retry
		await expect.element(screen.getByText('Could not read the receipt (500)')).toBeInTheDocument();
		await expect.element(screen.getByRole('button', { name: 'Parse receipt' })).toBeEnabled();
	});
});

// A real 1x1 PNG: the component builds an object URL from whatever it is handed, and the
// preview <img> only resolves for bytes the browser can actually decode.
const ONE_PIXEL_PNG = Uint8Array.from(
	atob(
		'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
	),
	(char) => char.charCodeAt(0)
);

function makeImageFile(name: string) {
	return new File([ONE_PIXEL_PNG], name, { type: 'image/png' });
}
