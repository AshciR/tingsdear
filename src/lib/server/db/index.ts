import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { env } from '$env/dynamic/private';
import * as schema from './schema.ts';

let pool: Pool | undefined;

export function getPool(): Pool {
	if (!pool) {
		const url = env.DATABASE_URL ?? process.env.DATABASE_URL;
		if (!url) throw new Error('DATABASE_URL is not set');
		pool = new Pool({ connectionString: url });
	}
	return pool;
}

export function getDb() {
	return drizzle(getPool(), { schema });
}

export type Db = ReturnType<typeof getDb>;
export { schema };
