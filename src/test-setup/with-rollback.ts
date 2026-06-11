import { drizzle } from 'drizzle-orm/node-postgres';
import { Client } from 'pg';
import * as schema from '../lib/server/db/schema.ts';
import type { Db } from '../lib/server/db/index.ts';

export async function withRollback<T>(fn: (db: Db, client: Client) => Promise<T>): Promise<T> {
	const client = new Client({ connectionString: process.env.DATABASE_URL });
	await client.connect();
	await client.query('BEGIN');
	try {
		const db = drizzle(client, { schema }) as unknown as Db;
		return await fn(db, client);
	} finally {
		await client.query('ROLLBACK').catch(() => {});
		await client.end();
	}
}
