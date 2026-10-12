/**
 * @file db-test-context.ts
 * @description Isolated test database context manager for Drizzle ORM integration and E2E tests.
 *
 * Prevents mutation or truncating of local development databases (e.g. `accounts_db`) by routing
 * tests to dedicated test databases (`*_test_db`) or running tests inside rollback transactions.
 */

import * as path from 'path';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

export interface DbTestContextOptions {
  /**
   * Name of the target test database (e.g. `accounts_test_db`).
   */
  dbName: string;

  /**
   * Optional relative or absolute path to the migrations folder.
   */
  migrationsFolder?: string;

  /**
   * PostgreSQL host. Defaults to localhost or DB_HOST env.
   */
  host?: string;

  /**
   * PostgreSQL port. Defaults to 5432 or DB_PORT env.
   */
  port?: number;

  /**
   * PostgreSQL user. Defaults to postgres or DB_USER env.
   */
  user?: string;

  /**
   * PostgreSQL password. Defaults to postgres or DB_PASSWORD env.
   */
  password?: string;
}

export class DbTestContext<TSchema extends Record<string, unknown> = Record<string, unknown>> {
  public readonly dbName: string;
  public readonly connectionString: string;
  public readonly sql: postgres.Sql;
  public readonly db: PostgresJsDatabase<TSchema>;
  private readonly migrationsFolder?: string;

  constructor(options: DbTestContextOptions, schema?: TSchema) {
    this.dbName = options.dbName;
    this.migrationsFolder = options.migrationsFolder;

    const host = options.host || process.env.DB_HOST || 'localhost';
    const port = options.port || Number(process.env.DB_PORT) || 5432;
    const user = options.user || process.env.DB_USER || 'postgres';
    const password = options.password || process.env.DB_PASSWORD || 'postgres';

    this.connectionString = `postgres://${user}:${password}@${host}:${port}/${this.dbName}`;

    this.sql = postgres(this.connectionString, {
      max: 5,
      idle_timeout: 10,
      connect_timeout: 10,
    });

    this.db = drizzle(this.sql, { schema: schema as any }) as PostgresJsDatabase<TSchema>;
  }

  /**
   * Ensures the test database exists on the PostgreSQL instance.
   * Connects to the default `postgres` database and creates the test database if missing.
   */
  static async ensureDatabaseExists(dbName: string): Promise<void> {
    const host = process.env.DB_HOST || 'localhost';
    const port = Number(process.env.DB_PORT) || 5432;
    const user = process.env.DB_USER || 'postgres';
    const password = process.env.DB_PASSWORD || 'postgres';

    const adminSql = postgres(`postgres://${user}:${password}@${host}:${port}/postgres`, {
      max: 1,
    });
    try {
      const exists = await adminSql`SELECT 1 FROM pg_database WHERE datname = ${dbName}`;
      if (exists.length === 0) {
        await adminSql.unsafe(`CREATE DATABASE "${dbName}"`);
      }
    } finally {
      await adminSql.end();
    }
  }

  /**
   * Executes Drizzle migrations against this test database.
   */
  async runMigrations(): Promise<void> {
    if (!this.migrationsFolder) {
      return;
    }
    const resolvedPath = path.isAbsolute(this.migrationsFolder)
      ? this.migrationsFolder
      : path.resolve(process.cwd(), this.migrationsFolder);

    await migrate(this.db, { migrationsFolder: resolvedPath });
  }

  /**
   * Truncates specified tables with RESTART IDENTITY CASCADE.
   */
  async truncateTables(tableNames: string[]): Promise<void> {
    if (tableNames.length === 0) return;
    const formatted = tableNames.map((t) => `"${t}"`).join(', ');
    await this.sql.unsafe(`TRUNCATE TABLE ${formatted} RESTART IDENTITY CASCADE;`);
  }

  /**
   * Cleanly closes the database connection pool.
   * MUST be called in afterAll to prevent open handle leaks in Jest.
   */
  async close(): Promise<void> {
    await this.sql.end();
  }
}
