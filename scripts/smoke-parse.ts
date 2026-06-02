import 'dotenv/config';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join, basename } from 'node:path';
import { parseReceipt, type ReceiptMediaType } from '../src/lib/server/receipt-parser.ts';

const MEDIA_TYPES: Record<string, ReceiptMediaType> = {
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.png': 'image/png',
	'.webp': 'image/webp',
	'.gif': 'image/gif',
	'.pdf': 'application/pdf'
};

async function main() {
	if (!process.env.RECEIPT_EXTRACTOR) {
		throw new Error('RECEIPT_EXTRACTOR is not set');
	}
	const dir = process.argv[2] ?? 'training-data';
	const filterArg = process.argv[3];

	const files = (await readdir(dir))
		.filter((f) => MEDIA_TYPES[extname(f).toLowerCase()])
		.filter((f) => !filterArg || f.includes(filterArg))
		.sort();

	if (files.length === 0) {
		console.log('No supported images found in', dir);
		return;
	}

	const outDir = join(dir, 'extractions');
	await mkdir(outDir, { recursive: true });

	for (const file of files) {
		const path = join(dir, file);
		const buf = await readFile(path);
		const mediaType = MEDIA_TYPES[extname(file).toLowerCase()];
		const started = Date.now();
		try {
			const parsed = await parseReceipt(buf, mediaType);
			const ms = Date.now() - started;
			const stem = basename(file, extname(file));
			const outPath = join(outDir, `${stem}-result.json`);
			await writeFile(outPath, JSON.stringify(parsed, null, 2) + '\n');
			console.log(`\n=== ${basename(file)}  (${ms} ms) → ${outPath} ===`);
			console.log(JSON.stringify(parsed, null, 2));
		} catch (err) {
			console.error(`\n=== ${basename(file)}  FAILED ===`);
			console.error((err as Error).message);
		}
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
