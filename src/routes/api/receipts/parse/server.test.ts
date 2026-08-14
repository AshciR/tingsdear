import { describe, it, expect, vi, beforeEach } from 'vitest';

const { parseReceiptMock } = vi.hoisted(() => ({ parseReceiptMock: vi.fn() }));

vi.mock('$lib/server/receipt-parser.ts', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/receipt-parser.ts')>(
		'$lib/server/receipt-parser.ts'
	);
	return { ...actual, parseReceipt: parseReceiptMock };
});

import { POST } from './+server.ts';

function invoke(request: Request) {
	return POST({ request } as Parameters<typeof POST>[0]);
}

function makeForm(file: File | null): Request {
	const form = new FormData();
	if (file) form.append('file', file);
	return new Request('http://test/api/receipts/parse', { method: 'POST', body: form });
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
		expect(parseReceiptMock.mock.calls[0][1]).toBe('image/jpeg');
	});

	it('returns 400 when the "file" field is missing', async () => {
		// Given
		const req = makeForm(null);

		// When / Then
		await expect(invoke(req)).rejects.toMatchObject({ status: 400 });
	});

	it('returns 400 for an unsupported content type', async () => {
		// Given
		const file = new File(['hi'], 'r.txt', { type: 'text/plain' });

		// When / Then
		await expect(invoke(makeForm(file))).rejects.toMatchObject({ status: 400 });
	});
});
