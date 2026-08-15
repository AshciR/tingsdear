// A phone photo of a receipt measures ~2.3 MB, so five parts of one receipt is ~11.5 MB and
// blows past the Anthropic API's 10 MB base64 request limit. 1568 px is the long edge
// claude-haiku-4-5 downsamples to anyway, so shrinking here costs nothing in extraction
// quality and everything is cheaper: upload, base64 encoding, and time to first token.
export const MAX_IMAGE_EDGE = 1568;

const DOWNSCALABLE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const JPEG_QUALITY = 0.85;

export async function downscaleImages(files: File[]): Promise<File[]> {
	return Promise.all(files.map(downscaleImage));
}

// Returns the original file untouched when shrinking it would not help or is not possible:
// PDFs and GIFs (which canvas would flatten), images already within the cap, and anything
// the browser cannot decode. Uploading an oversized image beats failing to upload at all.
export async function downscaleImage(file: File): Promise<File> {
	if (!DOWNSCALABLE_TYPES.includes(file.type)) return file;
	try {
		return await redraw(file);
	} catch {
		return file;
	}
}

async function redraw(file: File): Promise<File> {
	// `from-image` bakes the EXIF orientation into the pixels. Phone cameras record portrait
	// shots as landscape-plus-a-rotation-flag, and the parser sees raw bytes, not a browser.
	const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
	try {
		const scale = MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height);
		if (scale >= 1) return file;
		const blob = await drawToBlob(
			bitmap,
			Math.round(bitmap.width * scale),
			Math.round(bitmap.height * scale)
		);
		return new File([blob], jpegName(file.name), {
			type: 'image/jpeg',
			lastModified: file.lastModified
		});
	} finally {
		bitmap.close();
	}
}

async function drawToBlob(bitmap: ImageBitmap, width: number, height: number): Promise<Blob> {
	const canvas = new OffscreenCanvas(width, height);
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('2d canvas context unavailable');
	ctx.drawImage(bitmap, 0, 0, width, height);
	return canvas.convertToBlob({ type: 'image/jpeg', quality: JPEG_QUALITY });
}

function jpegName(name: string): string {
	return name.replace(/\.[^./\\]+$/, '') + '.jpg';
}
