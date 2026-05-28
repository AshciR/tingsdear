import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate as drizzleMigrate } from 'drizzle-orm/node-postgres/migrator';
import type { Pool } from 'pg';

export async function migrate(pool: Pool, migrationsFolder: string): Promise<void> {
	const db = drizzle(pool);
	await drizzleMigrate(db, { migrationsFolder });
}
