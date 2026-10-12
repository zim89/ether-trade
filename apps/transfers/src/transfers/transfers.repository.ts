import { Injectable, Inject, Logger } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import { DRIZZLE_CLIENT } from '../database/database.constants';
import type { DrizzleDB } from '../database/database.module';
import {
  scannerState,
  walletDeposits,
  WalletDeposit,
  NewWalletDeposit,
  withdrawalRequests,
  WithdrawalRequest,
  NewWithdrawalRequest,
} from '../database/schema';

@Injectable()
export class TransfersRepository {
  private readonly logger = new Logger(TransfersRepository.name);

  constructor(
    @Inject(DRIZZLE_CLIENT)
    private readonly db: DrizzleDB,
  ) {}

  // --------------------------------------------------------------------------
  // Scanner State
  // --------------------------------------------------------------------------
  async getLastScannedBlock(chainId: number): Promise<number | null> {
    const [row] = await this.db
      .select()
      .from(scannerState)
      .where(eq(scannerState.chainId, chainId))
      .limit(1);

    return row ? row.lastScannedBlock : null;
  }

  async updateLastScannedBlock(chainId: number, blockNumber: number): Promise<void> {
    await this.db
      .insert(scannerState)
      .values({
        chainId,
        lastScannedBlock: blockNumber,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: scannerState.chainId,
        set: {
          lastScannedBlock: blockNumber,
          updatedAt: new Date(),
        },
      });
  }

  // --------------------------------------------------------------------------
  // Wallet Deposits
  // --------------------------------------------------------------------------
  async findDepositByTxHash(txHash: string): Promise<WalletDeposit | null> {
    const [deposit] = await this.db
      .select()
      .from(walletDeposits)
      .where(eq(walletDeposits.txHash, txHash))
      .limit(1);

    return deposit || null;
  }

  async createDeposit(data: NewWalletDeposit): Promise<WalletDeposit> {
    const [deposit] = await this.db.insert(walletDeposits).values(data).returning();
    return deposit;
  }

  async updateDepositStatus(id: string, status: string, creditedAt?: Date): Promise<WalletDeposit> {
    const [deposit] = await this.db
      .update(walletDeposits)
      .set({
        status,
        creditedAt: creditedAt || (status === 'CREDITED' ? new Date() : undefined),
      })
      .where(eq(walletDeposits.id, id))
      .returning();

    return deposit;
  }

  // --------------------------------------------------------------------------
  // Withdrawal Requests
  // --------------------------------------------------------------------------
  async findWithdrawalByIdempotency(
    userId: string,
    idempotencyKey: string,
  ): Promise<WithdrawalRequest | null> {
    const [request] = await this.db
      .select()
      .from(withdrawalRequests)
      .where(
        and(
          eq(withdrawalRequests.userId, userId),
          eq(withdrawalRequests.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);

    return request || null;
  }

  async findWithdrawalById(id: string, userId?: string): Promise<WithdrawalRequest | null> {
    const conditions = [eq(withdrawalRequests.id, id)];
    if (userId) {
      conditions.push(eq(withdrawalRequests.userId, userId));
    }

    const [request] = await this.db
      .select()
      .from(withdrawalRequests)
      .where(and(...conditions))
      .limit(1);

    return request || null;
  }

  async createWithdrawalRequest(data: NewWithdrawalRequest): Promise<WithdrawalRequest> {
    const [request] = await this.db.insert(withdrawalRequests).values(data).returning();
    return request;
  }

  async findPendingWithdrawals(limit = 10): Promise<WithdrawalRequest[]> {
    return await this.db
      .select()
      .from(withdrawalRequests)
      .where(eq(withdrawalRequests.status, 'PENDING'))
      .orderBy(withdrawalRequests.createdAt)
      .limit(limit);
  }

  async findProcessingWithdrawalsWithTxHash(): Promise<WithdrawalRequest[]> {
    return await this.db
      .select()
      .from(withdrawalRequests)
      .where(
        and(
          eq(withdrawalRequests.status, 'PROCESSING'),
          sql`${withdrawalRequests.txHash} IS NOT NULL`,
        ),
      );
  }

  /**
   * Concurrency-safe pick: acquires next PENDING withdrawal with SKIP LOCKED.
   */
  async lockNextPendingWithdrawal(): Promise<WithdrawalRequest | null> {
    return await this.db.transaction(async (tx) => {
      const [locked] = await tx
        .select()
        .from(withdrawalRequests)
        .where(eq(withdrawalRequests.status, 'PENDING'))
        .orderBy(withdrawalRequests.createdAt)
        .limit(1)
        .for('update', { skipLocked: true });

      if (!locked) {
        return null;
      }

      const [updated] = await tx
        .update(withdrawalRequests)
        .set({ status: 'PROCESSING' })
        .where(eq(withdrawalRequests.id, locked.id))
        .returning();

      return updated;
    });
  }

  async updateWithdrawalTx(id: string, txHash: string, nonce: number): Promise<WithdrawalRequest> {
    const [request] = await this.db
      .update(withdrawalRequests)
      .set({
        txHash,
        nonce,
      })
      .where(eq(withdrawalRequests.id, id))
      .returning();

    return request;
  }

  async completeWithdrawal(id: string): Promise<WithdrawalRequest> {
    const [request] = await this.db
      .update(withdrawalRequests)
      .set({
        status: 'COMPLETED',
        processedAt: new Date(),
      })
      .where(eq(withdrawalRequests.id, id))
      .returning();

    return request;
  }

  async failWithdrawal(id: string, errorMessage: string): Promise<WithdrawalRequest> {
    const [request] = await this.db
      .update(withdrawalRequests)
      .set({
        status: 'FAILED',
        errorMessage,
        processedAt: new Date(),
      })
      .where(eq(withdrawalRequests.id, id))
      .returning();

    return request;
  }

  async findUserWithdrawals(
    userId: string,
    status?: string,
    limit = 20,
    offset = 0,
  ): Promise<{ items: WithdrawalRequest[]; total: number }> {
    const conditions = [eq(withdrawalRequests.userId, userId)];
    if (status) {
      conditions.push(eq(withdrawalRequests.status, status));
    }

    const items = await this.db
      .select()
      .from(withdrawalRequests)
      .where(and(...conditions))
      .orderBy(desc(withdrawalRequests.createdAt))
      .limit(limit)
      .offset(offset);

    const [totalRow] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(withdrawalRequests)
      .where(and(...conditions));

    return { items, total: totalRow?.count || 0 };
  }
}
