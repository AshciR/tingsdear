import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import { migrate } from '../lib/server/db/migrate.ts';

export default async function () {
  const databaseImage = "postgis/postgis:17-3.5"
	console.log(`[testcontainers] starting ${databaseImage}...`);
	const startedAt = Date.now();
	const container = await new PostgreSqlContainer(databaseImage)
		.withStartupTimeout(120_000)
		.start();

	const connectionUri = container.getConnectionUri();
	process.env.DATABASE_URL = connectionUri;

	console.log(
		`[testcontainers] started in ${((Date.now() - startedAt) / 1000).toFixed(1)}s ` +
			`host=${container.getHost()} port=${container.getPort()} ` +
			`db=${container.getDatabase()} user=${container.getUsername()} pass=${container.getPassword()}`
	);
	console.log(`[testcontainers] DATABASE_URL=${connectionUri}`);

	console.log('[testcontainers] running migrations from drizzle/migrations...');
	const pool = new Pool({ connectionString: connectionUri });
	await migrate(pool, 'drizzle/migrations');
	await pool.end();
	console.log('[testcontainers] migrations complete');

	return async () => {
		console.log('[testcontainers] stopping container...');
		await container.stop();
		console.log('[testcontainers] stopped');
	};
}
