// `$env/dynamic/private` is a SvelteKit virtual module: it exists inside the dev server, the
// built adapter-node output, and Vitest (which loads the SvelteKit Vite plugin), but not under
// plain `tsx`. The scripts here run outside all of that, so `scripts/tsconfig.json` points the
// import at this shim. `receipts/parser.ts` already falls back to `process.env`, so the shape is
// all that is missing.
export const env: Record<string, string | undefined> = process.env;
