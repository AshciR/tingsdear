import { describe, it, expect, vi, beforeEach } from 'vitest';

const { parseReceiptMock } = vi.hoisted(() => ({ parseReceiptMock: vi.fn() }));

vi.mock('$lib/server/receipt-parser', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/receipt-parser')>(
		'$lib/server/receipt-parser'
	);
	return { ...actual, parseReceipt: parseReceiptMock };
});

import { POST } from './+server.ts';

function invoke(request: Request) {
	return POST({ request } as Parameters<typeof POST>[0]);
}

function makeForm(...files: File[]): Request {
	const form = new FormData();
	for (const file of files) form.append('file', file);
	return new Request('http://test/api/receipts/parse', { method: 'POST', body: form });
}

function imageFile(name: string, bytes: string) {
	return new File([new TextEncoder().encode(bytes)], name, { type: 'image/jpeg' });
}

describe('POST /api/receipts/parse', () => {
	beforeEach(() => parseReceiptMock.mockReset());

	it('returns parsed receipt JSON for a valid image upload', async () => {
		// Given
		const parsed = {
			supermarket: { name: 'Hi-Lo' },
			purchase_date: '2026-03-14',
			line_items: [],
			currency: 'JMD',
			confidence: 'high'
		};
		parseReceiptMock.mockResolvedValue(parsed);
		const file = new File([new Uint8Array([1, 2, 3])], 'r.jpg', { type: 'image/jpeg' });

		// When
		const res = await invoke(makeForm(file));

		// Then
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual(parsed);
		expect(parseReceiptMock).toHaveBeenCalledOnce();
		expect(parseReceiptMock.mock.calls[0][0]).toEqual([
			{ data: expect.anything(), mediaType: 'image/jpeg' }
		]);
	});

	it('passes every uploaded part to the parser in the order it was sent', async () => {
		// Given three photographs of one long receipt, in reading order
		parseReceiptMock.mockResolvedValue({});
		const req = makeForm(
			imageFile('part-1.jpg', 'one'),
			imageFile('part-2.jpg', 'two'),
			imageFile('part-3.jpg', 'three')
		);

		// When the upload is parsed
		await invoke(req);

		// Then one parse call receives all three, still in order
		expect(parseReceiptMock).toHaveBeenCalledOnce();
		const parts = parseReceiptMock.mock.calls[0][0];
		expect(parts.map((p: { data: Buffer }) => p.data.toString())).toEqual(['one', 'two', 'three']);
	});

	it('returns 400 when the "file" field is missing', async () => {
		// Given
		const req = makeForm();

		// When / Then
		await expect(invoke(req)).rejects.toMatchObject({ status: 400 });
	});

	it('returns 400 when any one part has an unsupported content type', async () => {
		// Given a valid first part followed by a text file
		const req = makeForm(
			imageFile('part-1.jpg', 'one'),
			new File(['hi'], 'notes.txt', {
				type: 'text/plain'
			})
		);

		// When / Then — the whole upload is refused rather than silently parsed short
		await expect(invoke(req)).rejects.toMatchObject({ status: 400 });
		expect(parseReceiptMock).not.toHaveBeenCalled();
	});

	it('returns 400 for an unsupported content type', async () => {
		// Given
		const file = new File(['hi'], 'r.txt', { type: 'text/plain' });

		// When / Then
		await expect(invoke(makeForm(file))).rejects.toMatchObject({ status: 400 });
	});
});
