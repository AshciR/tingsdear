// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { Db } from '$lib/server/db/index';

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			db: Db;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
