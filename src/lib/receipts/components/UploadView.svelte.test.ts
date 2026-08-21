import { render } from 'vitest-browser-svelte';
import { describe, it, expect, vi } from 'vitest';
import UploadView from './UploadView.svelte';

describe('UploadView', () => {
	it('offers both ways to supply a receipt', async () => {
		// Given nothing chosen yet
		const screen = render(UploadView, {
			files: [],
			error: null,
			onFiles: vi.fn(),
			onSubmit: vi.fn()
		});

		// Then the user can either shoot the receipt or pick a saved file
		await expect.element(screen.getByLabelText('Take photo')).toBeInTheDocument();
		await expect.element(screen.getByLabelText('Choose file')).toBeInTheDocument();
	});

	it('cannot be submitted until a file is chosen', async () => {
		// Given nothing chosen yet
		const screen = render(UploadView, {
			files: [],
			error: null,
			onFiles: vi.fn(),
			onSubmit: vi.fn()
		});

		// Then parsing is not yet offered
		await expect.element(screen.getByRole('button', { name: 'Parse receipt' })).toBeDisabled();
	});

	it('hands the chosen file to the parent', async () => {
		// Given an upload view waiting for a file
		const onFiles = vi.fn();
		const screen = render(UploadView, { files: [], error: null, onFiles, onSubmit: vi.fn() });

		// When the user picks a receipt from their files
		await screen.getByLabelText('Choose file').upload(makeImageFile('receipt.png'));

		// Then the parent receives a one-part receipt
		expect(onFiles).toHaveBeenCalledOnce();
		expect(onFiles.mock.calls[0][0]).toEqual([expect.objectContaining({ name: 'receipt.png' })]);
	});

	it('appends a newly chosen part rather than replacing the ones already taken', async () => {
		// Given two parts of a long receipt already captured
		const onFiles = vi.fn();
		const files = [makeImageFile('part-1.png'), makeImageFile('part-2.png')];
		const screen = render(UploadView, { files, error: null, onFiles, onSubmit: vi.fn() });

		// When the user shoots the next part
		await screen.getByLabelText('Add photo').upload(makeImageFile('part-3.png'));

		// Then it joins the end of the list, leaving the earlier parts in place
		expect(onFiles.mock.calls[0][0].map((f: File) => f.name)).toEqual([
			'part-1.png',
			'part-2.png',
			'part-3.png'
		]);
	});

	it('numbers the chosen parts and previews each image', async () => {
		// Given a receipt captured in two photos
		const files = [makeImageFile('part-1.png'), makeImageFile('part-2.png')];
		const screen = render(UploadView, {
			files,
			error: null,
			onFiles: vi.fn(),
			onSubmit: vi.fn()
		});

		// Then the user can see the order they will be read in
		await expect.element(screen.getByText('part-1.png')).toBeInTheDocument();
		await expect.element(screen.getByRole('img', { name: 'Part 1 preview' })).toBeInTheDocument();
		await expect.element(screen.getByRole('img', { name: 'Part 2 preview' })).toBeInTheDocument();
	});

	it('names a chosen PDF without previewing it', async () => {
		// Given a PDF receipt, which the browser cannot render inline here
		const file = new File(['%PDF-1.4'], 'receipt.pdf', { type: 'application/pdf' });
		const screen = render(UploadView, {
			files: [file],
			error: null,
			onFiles: vi.fn(),
			onSubmit: vi.fn()
		});

		// Then the file is named but no preview is shown
		await expect.element(screen.getByText('receipt.pdf')).toBeInTheDocument();
		expect(screen.getByRole('img', { name: 'Part 1 preview' }).query()).toBeNull();
	});

	it('removes a part the user rejects', async () => {
		// Given three parts, the middle one blurred
		const onFiles = vi.fn();
		const files = [
			makeImageFile('part-1.png'),
			makeImageFile('blurred.png'),
			makeImageFile('part-3.png')
		];
		const screen = render(UploadView, { files, error: null, onFiles, onSubmit: vi.fn() });

		// When the user drops the bad one
		await screen.getByRole('button', { name: 'Remove part 2' }).click();

		// Then the parent is handed the remaining parts, in order
		expect(onFiles.mock.calls[0][0].map((f: File) => f.name)).toEqual(['part-1.png', 'part-3.png']);
	});

	it('reorders parts that were captured out of sequence', async () => {
		// Given the header shot taken second by mistake — order decides where the receipt starts
		const onFiles = vi.fn();
		const files = [makeImageFile('tail.png'), makeImageFile('header.png')];
		const screen = render(UploadView, { files, error: null, onFiles, onSubmit: vi.fn() });

		// When the user moves the header to the front
		await screen.getByRole('button', { name: 'Move part 2 earlier' }).click();

		// Then the parts swap
		expect(onFiles.mock.calls[0][0].map((f: File) => f.name)).toEqual(['header.png', 'tail.png']);
	});

	it('cannot move the first part any earlier', async () => {
		// Given a two-part receipt
		const files = [makeImageFile('part-1.png'), makeImageFile('part-2.png')];
		const screen = render(UploadView, {
			files,
			error: null,
			onFiles: vi.fn(),
			onSubmit: vi.fn()
		});

		// Then the ends of the list are pinned
		await expect
			.element(screen.getByRole('button', { name: 'Move part 1 earlier' }))
			.toBeDisabled();
		await expect.element(screen.getByRole('button', { name: 'Move part 2 later' })).toBeDisabled();
	});

	it('says how many parts will be parsed together', async () => {
		// Given a receipt captured in three photos
		const files = ['a.png', 'b.png', 'c.png'].map(makeImageFile);
		const screen = render(UploadView, {
			files,
			error: null,
			onFiles: vi.fn(),
			onSubmit: vi.fn()
		});

		// Then the button makes clear they go up as one receipt
		await expect.element(screen.getByRole('button', { name: 'Parse 3 parts' })).toBeEnabled();
	});

	it('parses the receipt when the user submits a chosen file', async () => {
		// Given a chosen file and a parent listening for submission
		const onSubmit = vi.fn();
		const screen = render(UploadView, {
			files: [makeImageFile('receipt.png')],
			error: null,
			onFiles: vi.fn(),
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
			files: [makeImageFile('receipt.png')],
			error: 'Could not read the receipt (500)',
			onFiles: vi.fn(),
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
