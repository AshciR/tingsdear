import { describe, it, expect, vi } from 'vitest';
import { parseReceipt } from './receipt-parser.ts';

function fakeClient(text: string) {
	return {
		messages: {
			create: vi.fn().mockResolvedValue({
				content: [{ type: 'text', text }],
				stop_reason: 'end_turn'
			})
		}
	} as unknown as Parameters<typeof parseReceipt>[1];
}

const validBody = `"supermarket":{"name":"Hi-Lo","branch":"Barbican"},"purchase_date":"2026-03-14","line_items":[{"name":"Grace Coconut Milk 400ml","quantity":2,"unit_price":385,"total":770}],"currency":"JMD","confidence":"high"}`;

describe('parseReceipt', () => {
	it('parses a valid JSON response that follows the assistant `{` prefill', async () => {
		const result = await parseReceipt(onePart(), fakeClient(validBody));
		expect(result.supermarket.name).toBe('Hi-Lo');
		expect(result.line_items).toHaveLength(1);
		expect(result.line_items[0].total).toBe(770);
		expect(result.currency).toBe('JMD');
		expect(result.confidence).toBe('high');
	});

	it('strips ```json fences if the model ignores the prefill and returns a full fenced block', async () => {
		const wrapped = '```json\n{' + validBody + '\n```';
		const result = await parseReceipt(onePart(), fakeClient(wrapped));
		expect(result.supermarket.name).toBe('Hi-Lo');
	});

	it('defaults supermarket to an empty object when absent (continuation page)', async () => {
		const noStore = `"purchase_date":"2026-06-01","line_items":[{"name":"Grace Tomato Ketchup 400g","quantity":1,"unit_price":310,"total":310}],"currency":"JMD","confidence":"high"}`;
		const result = await parseReceipt(onePart(), fakeClient(noStore));
		expect(result.supermarket).toEqual({});
	});

	it('throws with a useful message on malformed JSON', async () => {
		await expect(parseReceipt(onePart(), fakeClient('this is not json'))).rejects.toThrow(
			/invalid JSON/
		);
	});

	it('throws when response fails schema validation', async () => {
		const missingFields = `"supermarket_name":"Hi-Lo"}`;
		await expect(parseReceipt(onePart(), fakeClient(missingFields))).rejects.toThrow(
			/did not match schema/
		);
	});

	it('throws when the response contains no text block', async () => {
		const client = {
			messages: {
				create: vi.fn().mockResolvedValue({ content: [], stop_reason: 'max_tokens' })
			}
		} as unknown as Parameters<typeof parseReceipt>[1];
		await expect(parseReceipt(onePart(), client)).rejects.toThrow(/no text block/);
	});

	it('sends every part of a split receipt in one user turn, in order', async () => {
		// Given three photographs of one long receipt
		const client = fakeClient(validBody);
		const parts = [part('a'), part('b'), part('c')];

		// When they are parsed together
		await parseReceipt(parts, client);

		// Then one request carries all three images ahead of the instruction, in the order given
		const content = sentContent(client);
		expect(createMock(client)).toHaveBeenCalledOnce();
		expect(content.map((block) => block.type)).toEqual(['image', 'image', 'image', 'text']);
		expect(content.slice(0, 3).map((block) => block.source?.data)).toEqual(
			['a', 'b', 'c'].map((b) => Buffer.from(b).toString('base64'))
		);
	});

	it('tells the model how many parts belong to the one receipt', async () => {
		// Given two parts of one receipt
		const client = fakeClient(validBody);

		// When they are parsed together
		await parseReceipt([part('a'), part('b')], client);

		// Then the closing instruction says they are consecutive parts to be merged
		expect(sentContent(client).at(-1)?.text).toMatch(
			/2 images above are consecutive parts of ONE receipt/u
		);
	});

	it('throws when given no images at all', async () => {
		// Given / When / Then
		await expect(parseReceipt([], fakeClient(validBody))).rejects.toThrow(/no images/);
	});
});

function part(bytes: string) {
	return { data: Buffer.from(bytes), mediaType: 'image/jpeg' as const };
}

function onePart() {
	return [part('x')];
}

type SentBlock = { type: string; text?: string; source?: { data: string } };

function createMock(client: Parameters<typeof parseReceipt>[1]) {
	return (client as unknown as { messages: { create: ReturnType<typeof vi.fn> } }).messages.create;
}

function sentContent(client: Parameters<typeof parseReceipt>[1]): SentBlock[] {
	return createMock(client).mock.calls[0][0].messages[0].content;
}
