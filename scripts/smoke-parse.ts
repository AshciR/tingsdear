import 'dotenv/config';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join, basename } from 'node:path';
import {
	parseReceipt,
	type ReceiptMediaType,
	type ReceiptPart
} from '../src/lib/server/receipts/parser.ts';

const MEDIA_TYPES: Record<string, ReceiptMediaType> = {
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.png': 'image/png',
	'.webp': 'image/webp',
	'.gif': 'image/gif',
	'.pdf': 'application/pdf'
};

// `receipt-3-1.JPG` … `receipt-3-5.JPG` are five photographs of one receipt, so they go to the
// parser together the way the app sends them. Anything without a part suffix stands alone.
const PART_SUFFIX = /^(.*)-(\d+)$/;

async function main() {
	if (!process.env.RECEIPT_EXTRACTOR) {
		throw new Error('RECEIPT_EXTRACTOR is not set');
	}
	const dir = process.argv[2] ?? 'training-data';
	const filterArg = process.argv[3];

	const files = (await readdir(dir))
		.filter((f) => MEDIA_TYPES[extname(f).toLowerCase()])
		.filter((f) => !filterArg || f.includes(filterArg))
		.sort(byPartOrder);

	if (files.length === 0) {
		console.log('No supported images found in', dir);
		return;
	}

	const outDir = join(dir, 'extractions');
	await mkdir(outDir, { recursive: true });

	for (const [stem, group] of groupByReceipt(files)) {
		await parseOne(dir, outDir, stem, group);
	}
}

async function parseOne(dir: string, outDir: string, stem: string, files: string[]) {
	const label = files.length === 1 ? files[0] : `${stem} (${files.length} parts)`;
	const started = Date.now();
	try {
		const parsed = await parseReceipt(await Promise.all(files.map((f) => toPart(dir, f))));
		const ms = Date.now() - started;
		const outPath = join(outDir, `${stem}-result.json`);
		await writeFile(outPath, JSON.stringify(parsed, null, 2) + '\n');
		console.log(`\n=== ${label}  (${ms} ms) → ${outPath} ===`);
		console.log(JSON.stringify(parsed, null, 2));
	} catch (err) {
		console.error(`\n=== ${label}  FAILED ===`);
		console.error((err as Error).message);
	}
}

async function toPart(dir: string, file: string): Promise<ReceiptPart> {
	return {
		data: await readFile(join(dir, file)),
		mediaType: MEDIA_TYPES[extname(file).toLowerCase()]
	};
}

// Keyed by the stem without its part suffix, so the output lands in `receipt-3-result.json`.
function groupByReceipt(files: string[]): Map<string, string[]> {
	const groups = new Map<string, string[]>();
	for (const file of files) {
		const key = receiptStem(file);
		groups.set(key, [...(groups.get(key) ?? []), file]);
	}
	return groups;
}

function receiptStem(file: string): string {
	const stem = basename(file, extname(file));
	return PART_SUFFIX.exec(stem)?.[1] ?? stem;
}

// Plain string sort puts `-10` before `-2`; parts must reach the parser in reading order.
function byPartOrder(a: string, b: string): number {
	const stems = receiptStem(a).localeCompare(receiptStem(b));
	return stems !== 0 ? stems : partNumber(a) - partNumber(b);
}

function partNumber(file: string): number {
	const match = PART_SUFFIX.exec(basename(file, extname(file)));
	return match ? Number(match[2]) : 0;
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
