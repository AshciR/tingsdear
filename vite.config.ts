import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import { sveltekit } from '@sveltejs/kit/vite';

// Suites that need a real browser rather than node: Svelte components, plus anything leaning
// on browser-only APIs (OffscreenCanvas, createImageBitmap). The two projects share this list
// — the client project runs exactly these, the server project runs everything else.
const BROWSER_TESTS = ['src/**/*.svelte.{test,spec}.{js,ts}', 'src/lib/image-downscale.test.ts'];

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	server: {
		host: true,
		allowedHosts: ['.ngrok-free.dev']
	},
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'client',
					browser: {
						enabled: true,
						provider: playwright(),
						// Headless lives here, not on the instance: `--browser.headless=false`
						// overrides the browser-level option, but an instance-level one wins over
						// the CLI and silently keeps the run headless.
						headless: true,
						instances: [{ browser: 'chromium' }]
					},
					include: BROWSER_TESTS,
					exclude: ['src/lib/server/**']
				}
			},

			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: BROWSER_TESTS,
					globalSetup: ['src/test-setup/global-setup.ts'],
					testTimeout: 120_000,
					pool: 'forks'
				}
			}
		]
	}
});
