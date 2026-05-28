import 'dotenv/config';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { migrate } from '../src/lib/server/db/migrate.ts';

async function main() {
	const url = process.env.DATABASE_URL;
	if (!url) throw new Error('DATABASE_URL is not set');
	const pool = new Pool({ connectionString: url });
	try {
		await migrate(pool, resolve('drizzle/migrations'));
		console.log('migrations applied');
	} finally {
		await pool.end();
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
