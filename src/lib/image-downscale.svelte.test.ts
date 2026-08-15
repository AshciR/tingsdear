import { describe, it, expect } from 'vitest';
import { downscaleImage, downscaleImages, MAX_IMAGE_EDGE } from './image-downscale.ts';

describe('downscaleImage', () => {
	it('shrinks an oversized photo to the long edge the model reads at', async () => {
		// Given a photo far larger than the API will use
		const file = await makePng(3000, 2000);

		// When it is downscaled
		const result = await downscaleImage(file);

		// Then its long edge is capped and the aspect ratio holds
		expect(await dimensionsOf(result)).toEqual({ width: MAX_IMAGE_EDGE, height: 1045 });
	});

	it('re-encodes as JPEG so five parts fit inside one request', async () => {
		// Given an oversized PNG
		const file = await makePng(2400, 1200);

		// When it is downscaled
		const result = await downscaleImage(file);

		// Then it comes back as a JPEG, named to match
		expect(result.type).toBe('image/jpeg');
		expect(result.name).toBe('receipt.jpg');
	});

	it('leaves an image already within the cap untouched', async () => {
		// Given a photo smaller than the cap — re-encoding would only cost quality
		const file = await makePng(800, 600);

		// When it is downscaled
		const result = await downscaleImage(file);

		// Then the original file is handed back as-is
		expect(result).toBe(file);
	});

	it('leaves a PDF alone', async () => {
		// Given a PDF receipt, which canvas cannot redraw
		const file = new File(['%PDF-1.4'], 'receipt.pdf', { type: 'application/pdf' });

		// When it is downscaled
		const result = await downscaleImage(file);

		// Then it passes through untouched
		expect(result).toBe(file);
	});

	it('falls back to the original when the bytes cannot be decoded', async () => {
		// Given something claiming to be a PNG but which is not
		const file = new File(['definitely not a png'], 'broken.png', { type: 'image/png' });

		// When it is downscaled
		const result = await downscaleImage(file);

		// Then uploading it oversized beats failing to upload at all
		expect(result).toBe(file);
	});
});

describe('downscaleImages', () => {
	it('keeps the parts in the order they were given', async () => {
		// Given three parts of one receipt, only the middle one oversized
		const files = [await makePng(400, 300), await makePng(3000, 2000), await makePng(500, 400)];

		// When they are downscaled together
		const results = await downscaleImages(files);

		// Then order is preserved — it is the only record of where the receipt starts
		expect(results).toHaveLength(3);
		expect(results[0]).toBe(files[0]);
		expect(results[2]).toBe(files[2]);
		expect((await dimensionsOf(results[1])).width).toBe(MAX_IMAGE_EDGE);
	});
});

async function makePng(width: number, height: number): Promise<File> {
	const canvas = new OffscreenCanvas(width, height);
	const ctx = canvas.getContext('2d')!;
	for (let x = 0; x < width; x += 8) {
		ctx.fillStyle = `hsl(${(x * 7) % 360} 80% 50%)`;
		ctx.fillRect(x, 0, 8, height);
	}
	const blob = await canvas.convertToBlob({ type: 'image/png' });
	return new File([blob], 'receipt.png', { type: 'image/png' });
}

async function dimensionsOf(file: File) {
	const bitmap = await createImageBitmap(file);
	const { width, height } = bitmap;
	bitmap.close();
	return { width, height };
}
