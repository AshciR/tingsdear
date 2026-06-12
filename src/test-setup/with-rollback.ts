import { drizzle } from 'drizzle-orm/node-postgres';
import { Client } from 'pg';
import * as schema from '../lib/server/db/schema.ts';
import type { Db } from '../lib/server/db/index.ts';

class RollbackSignal extends Error {}

export async function withRollback<T>(fn: (db: Db, client: Client) => Promise<T>): Promise<T> {
	const client = new Client({ connectionString: process.env.DATABASE_URL });
	await client.connect();
	const rootDb = drizzle(client, { schema });
	let result!: T;
	try {
		await rootDb.transaction(async (tx) => {
			result = await fn(tx as unknown as Db, client);
			throw new RollbackSignal();
		});
	} catch (err) {
		if (!(err instanceof RollbackSignal)) throw err;
	} finally {
		await client.end();
	}
	return result;
}
