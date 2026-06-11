import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import { migrate } from '../lib/server/db/migrate.ts';

export default async function () {
	const container = await new PostgreSqlContainer('postgis/postgis:17-3.5')
		.withStartupTimeout(120_000)
		.start();
	process.env.DATABASE_URL = container.getConnectionUri();
	const pool = new Pool({ connectionString: process.env.DATABASE_URL });
	await migrate(pool, 'drizzle/migrations');
	await pool.end();
	return async () => {
		await container.stop();
	};
}
