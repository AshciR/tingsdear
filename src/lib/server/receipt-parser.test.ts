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
	} as unknown as Parameters<typeof parseReceipt>[2];
}

const validBody = `"supermarket":{"name":"Hi-Lo","branch":"Barbican"},"purchase_date":"2026-03-14","line_items":[{"name":"Grace Coconut Milk 400ml","quantity":2,"unit_price":385,"total":770}],"currency":"JMD","confidence":"high"}`;

describe('parseReceipt', () => {
	it('parses a valid JSON response that follows the assistant `{` prefill', async () => {
		const result = await parseReceipt(Buffer.from('x'), 'image/jpeg', fakeClient(validBody));
		expect(result.supermarket.name).toBe('Hi-Lo');
		expect(result.line_items).toHaveLength(1);
		expect(result.line_items[0].total).toBe(770);
		expect(result.currency).toBe('JMD');
		expect(result.confidence).toBe('high');
	});

	it('strips ```json fences if the model ignores the prefill and returns a full fenced block', async () => {
		const wrapped = '```json\n{' + validBody + '\n```';
		const result = await parseReceipt(Buffer.from('x'), 'image/jpeg', fakeClient(wrapped));
		expect(result.supermarket.name).toBe('Hi-Lo');
	});

	it('defaults supermarket to an empty object when absent (continuation page)', async () => {
		const noStore = `"purchase_date":"2026-06-01","line_items":[{"name":"Grace Tomato Ketchup 400g","quantity":1,"unit_price":310,"total":310}],"currency":"JMD","confidence":"high"}`;
		const result = await parseReceipt(Buffer.from('x'), 'image/jpeg', fakeClient(noStore));
		expect(result.supermarket).toEqual({});
	});

	it('throws with a useful message on malformed JSON', async () => {
		await expect(
			parseReceipt(Buffer.from('x'), 'image/jpeg', fakeClient('this is not json'))
		).rejects.toThrow(/invalid JSON/);
	});

	it('throws when response fails schema validation', async () => {
		const missingFields = `"supermarket_name":"Hi-Lo"}`;
		await expect(
			parseReceipt(Buffer.from('x'), 'image/jpeg', fakeClient(missingFields))
		).rejects.toThrow(/did not match schema/);
	});

	it('throws when the response contains no text block', async () => {
		const client = {
			messages: {
				create: vi.fn().mockResolvedValue({ content: [], stop_reason: 'max_tokens' })
			}
		} as unknown as Parameters<typeof parseReceipt>[2];
		await expect(parseReceipt(Buffer.from('x'), 'image/jpeg', client)).rejects.toThrow(
			/no text block/
		);
	});
});
