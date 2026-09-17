import * as path from 'path';
import * as dotenv from 'dotenv';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { COMMON_LOGS } from '@app/common/constants';
import { ENV_DEFAULTS, ENV_KEYS } from '../common/constants';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });
dotenv.config();

const host = process.env[ENV_KEYS.dbHost] ?? ENV_DEFAULTS.dbHost;
const port = process.env[ENV_KEYS.dbPort] ?? `${ENV_DEFAULTS.dbPort}`;
const user = process.env[ENV_KEYS.dbUser] ?? ENV_DEFAULTS.dbUser;
const password = process.env[ENV_KEYS.dbPassword] ?? ENV_DEFAULTS.dbPassword;
const dbName = ENV_DEFAULTS.dbName;
const dbUrl =
  process.env[ENV_KEYS.accountsDatabaseUrl] ||
  `postgres://${user}:${password}@${host}:${port}/${dbName}`;

const SERVICE_NAME = 'ACCOUNTS';

async function runMigrations() {
  console.log(COMMON_LOGS.db.applyingMigrations(SERVICE_NAME, dbName));
  const sql = postgres(dbUrl, { max: 1 });
  const db = drizzle(sql);

  try {
    await migrate(db, { migrationsFolder: path.resolve(__dirname, 'migrations') });
    console.log(COMMON_LOGS.db.migrationsApplied(SERVICE_NAME));
  } finally {
    await sql.end();
  }
}

runMigrations().catch((err) => {
  console.error(COMMON_LOGS.db.migrationFailed(SERVICE_NAME), err);
  process.exit(1);
});
