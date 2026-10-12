/**
 * @file test-sandbox.ts
 * @description Centralized coordinator for deterministic state reset in E2E and integration tests.
 *
 * Coordinates:
 * 1. Anvil EVM node revert to baseline snapshot.
 * 2. Reset of transfers scanner state cursor (`lastScannedBlock` -> baselineBlockNumber).
 * 3. Atomic truncation of PostgreSQL microservice databases (`accounts`, `transfers`, `orders`).
 * 4. Redis/Valkey cache clearing.
 */

import { GlideClient } from '@valkey/valkey-glide';
import postgres from 'postgres';
import { revertAnvilSnapshot, DEFAULT_ANVIL_RPC_URL } from './blockchain';

export interface TestSandboxOptions {
  anvilRpcUrl?: string;
  redisHost?: string;
  redisPort?: number;
  dbHost?: string;
  dbPort?: number;
  dbUser?: string;
  dbPassword?: string;
}

export class TestSandbox {
  private readonly anvilRpcUrl: string;
  private readonly redisHost: string;
  private readonly redisPort: number;
  private readonly dbHost: string;
  private readonly dbPort: number;
  private readonly dbUser: string;
  private readonly dbPassword: string;

  constructor(options: TestSandboxOptions = {}) {
    this.anvilRpcUrl = options.anvilRpcUrl || process.env.ANVIL_RPC_URL || DEFAULT_ANVIL_RPC_URL;
    this.redisHost = options.redisHost || process.env.REDIS_HOST || 'localhost';
    this.redisPort = options.redisPort || Number(process.env.REDIS_PORT) || 6379;
    this.dbHost = options.dbHost || process.env.DB_HOST || 'localhost';
    this.dbPort = options.dbPort || Number(process.env.DB_PORT) || 5432;
    this.dbUser = options.dbUser || process.env.DB_USER || 'postgres';
    this.dbPassword = options.dbPassword || process.env.DB_PASSWORD || 'postgres';
  }

  /**
   * Helper to execute a query against a specific database.
   */
  private getSqlClient(dbName: string): postgres.Sql {
    return postgres(
      `postgres://${this.dbUser}:${this.dbPassword}@${this.dbHost}:${this.dbPort}/${dbName}`,
      { max: 1 },
    );
  }

  /**
   * Reverts Anvil state to baseline EVM snapshot.
   */
  async revertAnvil(baselineSnapshotId: `0x${string}`): Promise<void> {
    await revertAnvilSnapshot(baselineSnapshotId, this.anvilRpcUrl);
  }

  /**
   * Resets the blockchain scanner cursor in `transfers_db` to the baseline block number.
   * This prevents re-scanning contracts deployment transactions or missing fresh test transactions.
   */
  async resetScannerCursor(
    baselineBlockNumber: number | bigint,
    dbName = 'transfers_db',
  ): Promise<void> {
    const sql = this.getSqlClient(dbName);
    try {
      const blockNum = Number(baselineBlockNumber);
      await sql`
        INSERT INTO scanner_state (chain_id, last_scanned_block, updated_at)
        VALUES (31337, ${blockNum}, NOW())
        ON CONFLICT (chain_id)
        DO UPDATE SET last_scanned_block = ${blockNum}, updated_at = NOW()
      `;
    } catch {
      // Ignore if table does not exist yet (e.g. before initial migration)
    } finally {
      await sql.end();
    }
  }

  /**
   * Cleans up business database tables across all microservices.
   */
  async truncateDatabases(
    databaseTablesMap: Record<string, string[]> = {
      accounts_db: ['ledger_transactions', 'accounts'],
      transfers_db: ['withdrawal_requests', 'wallet_deposits'],
      orders_db: ['trades', 'orders'],
    },
  ): Promise<void> {
    for (const [dbName, tables] of Object.entries(databaseTablesMap)) {
      if (tables.length === 0) continue;
      const sql = this.getSqlClient(dbName);
      try {
        const formatted = tables.map((t) => `"${t}"`).join(', ');
        await sql.unsafe(`TRUNCATE TABLE ${formatted} RESTART IDENTITY CASCADE;`);
      } catch {
        // Table or db might not exist in early tests
      } finally {
        await sql.end();
      }
    }
  }

  /**
   * Flushes Redis / Valkey keys.
   */
  async flushRedis(): Promise<void> {
    let client: GlideClient | null = null;
    try {
      client = await GlideClient.createClient({
        addresses: [{ host: this.redisHost, port: this.redisPort }],
        requestTimeout: 2000,
      });
      // GlideClient custom command execution for FLUSHDB
      await client.customCommand(['FLUSHDB']);
    } catch {
      // In-memory flush failure should not break tests if redis is unreachable
    } finally {
      if (client) {
        client.close();
      }
    }
  }

  /**
   * Full atomic state reset for E2E afterEach hook.
   */
  async resetAll(params: {
    baselineSnapshotId: `0x${string}`;
    baselineBlockNumber: number | bigint;
    databaseTablesMap?: Record<string, string[]>;
  }): Promise<void> {
    await this.revertAnvil(params.baselineSnapshotId);
    await this.resetScannerCursor(params.baselineBlockNumber);
    await this.truncateDatabases(params.databaseTablesMap);
    await this.flushRedis();
  }
}
