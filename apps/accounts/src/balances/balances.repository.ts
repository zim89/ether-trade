import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import {
  Currency,
  LedgerTransactionType,
  LedgerTransactionStatus,
  PG_ERROR_CODES,
  PG_LOCK_STRENGTH,
} from '@app/common/constants';
import { DRIZZLE_CLIENT } from '../database/database.constants';
import type { DrizzleDB } from '../database/database.module';
import { accounts, Account } from '../database/schema/accounts.schema';
import {
  ledgerTransactions,
  LedgerTransaction,
} from '../database/schema/ledger-transactions.schema';
import { BALANCES_ERRORS } from './balances.constants';
import type { DepositParams, LockParams, UnlockParams } from './balances.types';

/**
 * Data access repository for the `accounts` and `ledger_transactions` tables.
 * Performs critical balance operations with pessimistic locking (SELECT ... FOR UPDATE)
 * and ensures append-only ledger transaction recording.
 */
@Injectable()
export class BalancesRepository {
  constructor(
    @Inject(DRIZZLE_CLIENT)
    private readonly db: DrizzleDB,
  ) {}

  /**
   * Finds an account by user ID and currency.
   */
  async findByUserAndCurrency(userId: string, currency: Currency): Promise<Account | null> {
    const result = await this.db
      .select()
      .from(accounts)
      .where(and(eq(accounts.userId, userId), eq(accounts.currency, currency)))
      .limit(1);

    return result[0] || null;
  }

  /**
   * Finds an existing account or creates a new zero-balance account.
   * Handles concurrent creation race conditions gracefully via fallback query.
   */
  async findOrCreate(userId: string, currency: Currency): Promise<Account> {
    const existing = await this.findByUserAndCurrency(userId, currency);
    if (existing) {
      return existing;
    }

    try {
      const [created] = await this.db
        .insert(accounts)
        .values({
          userId,
          currency,
          availableBalance: '0',
          lockedBalance: '0',
        })
        .returning();

      return created;
    } catch {
      const fallback = await this.findByUserAndCurrency(userId, currency);
      if (fallback) {
        return fallback;
      }
      throw new Error(BALANCES_ERRORS.accountCreateFailed(userId, currency));
    }
  }

  /**
   * Finds a ledger transaction by its idempotency key.
   */
  async findLedgerByIdempotencyKey(idempotencyKey: string): Promise<LedgerTransaction | null> {
    const result = await this.db
      .select()
      .from(ledgerTransactions)
      .where(eq(ledgerTransactions.idempotencyKey, idempotencyKey))
      .limit(1);

    return result[0] || null;
  }

  /**
   * Credits funds to an account's available balance in an atomic transaction.
   * Creates the account if it does not exist, locks it with FOR UPDATE,
   * updates the balance, and logs to ledger_transactions.
   */
  async deposit(params: DepositParams): Promise<Account> {
    const { userId, currency, amount, idempotencyKey } = params;

    return await this.db.transaction(async (tx) => {
      // 1. Check idempotency if key provided
      if (idempotencyKey) {
        const [existingTx] = await tx
          .select()
          .from(ledgerTransactions)
          .where(eq(ledgerTransactions.idempotencyKey, idempotencyKey))
          .limit(1);

        if (existingTx) {
          const [currentAccount] = await tx
            .select()
            .from(accounts)
            .where(eq(accounts.id, existingTx.accountId))
            .limit(1);

          if (currentAccount) {
            return currentAccount;
          }
        }
      }

      // 2. Lock account or create if missing
      let [account] = await tx
        .select()
        .from(accounts)
        .where(and(eq(accounts.userId, userId), eq(accounts.currency, currency)))
        .for(PG_LOCK_STRENGTH.update);

      if (!account) {
        try {
          const [created] = await tx
            .insert(accounts)
            .values({
              userId,
              currency,
              availableBalance: '0',
              lockedBalance: '0',
            })
            .returning();
          account = created;
        } catch {
          // In case another transaction created it simultaneously
          const [lockedAccount] = await tx
            .select()
            .from(accounts)
            .where(and(eq(accounts.userId, userId), eq(accounts.currency, currency)))
            .for(PG_LOCK_STRENGTH.update);
          account = lockedAccount;
        }
      }

      // 3. Update account available balance
      const [updatedAccount] = await tx
        .update(accounts)
        .set({
          availableBalance: sql`${accounts.availableBalance} + ${amount}::numeric`,
          updatedAt: new Date(),
        })
        .where(eq(accounts.id, account.id))
        .returning();

      // 4. Record ledger transaction
      try {
        await tx.insert(ledgerTransactions).values({
          accountId: updatedAccount.id,
          userId,
          currency,
          type: LedgerTransactionType.DEPOSIT,
          status: LedgerTransactionStatus.COMPLETED,
          amount,
          availableDelta: amount,
          lockedDelta: '0',
          balanceAfterAvailable: updatedAccount.availableBalance,
          balanceAfterLocked: updatedAccount.lockedBalance,
          idempotencyKey: idempotencyKey || null,
          referenceId: null,
        });
      } catch (err: unknown) {
        if (
          idempotencyKey &&
          typeof err === 'object' &&
          err !== null &&
          'code' in err &&
          (err as { code: string }).code === PG_ERROR_CODES.uniqueViolation
        ) {
          // Unique violation on idempotency_key due to concurrent request
          const [currentAccount] = await tx
            .select()
            .from(accounts)
            .where(eq(accounts.id, updatedAccount.id))
            .limit(1);
          return currentAccount || updatedAccount;
        }
        throw err;
      }

      return updatedAccount;
    });
  }

  /**
   * Locks funds from available balance to locked balance in an atomic transaction.
   * Locks the account row with FOR UPDATE, verifies sufficient available funds,
   * updates the balances, and logs to ledger_transactions.
   */
  async lock(params: LockParams): Promise<Account> {
    const { userId, currency, amount, idempotencyKey, referenceId } = params;

    return await this.db.transaction(async (tx) => {
      // 1. Check idempotency if key provided
      if (idempotencyKey) {
        const [existingTx] = await tx
          .select()
          .from(ledgerTransactions)
          .where(eq(ledgerTransactions.idempotencyKey, idempotencyKey))
          .limit(1);

        if (existingTx) {
          const [currentAccount] = await tx
            .select()
            .from(accounts)
            .where(eq(accounts.id, existingTx.accountId))
            .limit(1);

          if (currentAccount) {
            return currentAccount;
          }
        }
      }

      // 2. Lock account with FOR UPDATE
      const [account] = await tx
        .select()
        .from(accounts)
        .where(and(eq(accounts.userId, userId), eq(accounts.currency, currency)))
        .for(PG_LOCK_STRENGTH.update);

      if (!account) {
        throw new NotFoundException(BALANCES_ERRORS.accountNotFound(userId, currency));
      }

      // 3. Atomically check and update available -> locked
      const [updatedAccount] = await tx
        .update(accounts)
        .set({
          availableBalance: sql`${accounts.availableBalance} - ${amount}::numeric`,
          lockedBalance: sql`${accounts.lockedBalance} + ${amount}::numeric`,
          updatedAt: new Date(),
        })
        .where(
          and(eq(accounts.id, account.id), sql`${accounts.availableBalance} >= ${amount}::numeric`),
        )
        .returning();

      if (!updatedAccount) {
        throw new BadRequestException(
          BALANCES_ERRORS.insufficientAvailableBalance(account.availableBalance, amount),
        );
      }

      // 4. Record ledger transaction
      try {
        await tx.insert(ledgerTransactions).values({
          accountId: updatedAccount.id,
          userId,
          currency,
          type: LedgerTransactionType.LOCK,
          status: LedgerTransactionStatus.COMPLETED,
          amount,
          availableDelta: `-${amount}`,
          lockedDelta: amount,
          balanceAfterAvailable: updatedAccount.availableBalance,
          balanceAfterLocked: updatedAccount.lockedBalance,
          idempotencyKey: idempotencyKey || null,
          referenceId: referenceId || null,
        });
      } catch (err: unknown) {
        if (
          idempotencyKey &&
          typeof err === 'object' &&
          err !== null &&
          'code' in err &&
          (err as { code: string }).code === PG_ERROR_CODES.uniqueViolation
        ) {
          const [currentAccount] = await tx
            .select()
            .from(accounts)
            .where(eq(accounts.id, updatedAccount.id))
            .limit(1);
          return currentAccount || updatedAccount;
        }
        throw err;
      }

      return updatedAccount;
    });
  }

  /**
   * Releases locked funds back to available balance in an atomic transaction.
   * Locks the account row with FOR UPDATE, verifies sufficient locked funds,
   * updates the balances, and logs to ledger_transactions.
   */
  async unlock(params: UnlockParams): Promise<Account> {
    const { userId, currency, amount, idempotencyKey, referenceId } = params;

    return await this.db.transaction(async (tx) => {
      // 1. Check idempotency if key provided
      if (idempotencyKey) {
        const [existingTx] = await tx
          .select()
          .from(ledgerTransactions)
          .where(eq(ledgerTransactions.idempotencyKey, idempotencyKey))
          .limit(1);

        if (existingTx) {
          const [currentAccount] = await tx
            .select()
            .from(accounts)
            .where(eq(accounts.id, existingTx.accountId))
            .limit(1);

          if (currentAccount) {
            return currentAccount;
          }
        }
      }

      // 2. Lock account with FOR UPDATE
      const [account] = await tx
        .select()
        .from(accounts)
        .where(and(eq(accounts.userId, userId), eq(accounts.currency, currency)))
        .for(PG_LOCK_STRENGTH.update);

      if (!account) {
        throw new NotFoundException(BALANCES_ERRORS.accountNotFound(userId, currency));
      }

      // 3. Atomically check and update locked -> available
      const [updatedAccount] = await tx
        .update(accounts)
        .set({
          availableBalance: sql`${accounts.availableBalance} + ${amount}::numeric`,
          lockedBalance: sql`${accounts.lockedBalance} - ${amount}::numeric`,
          updatedAt: new Date(),
        })
        .where(
          and(eq(accounts.id, account.id), sql`${accounts.lockedBalance} >= ${amount}::numeric`),
        )
        .returning();

      if (!updatedAccount) {
        throw new BadRequestException(
          BALANCES_ERRORS.insufficientLockedBalance(account.lockedBalance, amount),
        );
      }

      // 4. Record ledger transaction
      try {
        await tx.insert(ledgerTransactions).values({
          accountId: updatedAccount.id,
          userId,
          currency,
          type: LedgerTransactionType.UNLOCK,
          status: LedgerTransactionStatus.COMPLETED,
          amount,
          availableDelta: amount,
          lockedDelta: `-${amount}`,
          balanceAfterAvailable: updatedAccount.availableBalance,
          balanceAfterLocked: updatedAccount.lockedBalance,
          idempotencyKey: idempotencyKey || null,
          referenceId: referenceId || null,
        });
      } catch (err: unknown) {
        if (
          idempotencyKey &&
          typeof err === 'object' &&
          err !== null &&
          'code' in err &&
          (err as { code: string }).code === PG_ERROR_CODES.uniqueViolation
        ) {
          const [currentAccount] = await tx
            .select()
            .from(accounts)
            .where(eq(accounts.id, updatedAccount.id))
            .limit(1);
          return currentAccount || updatedAccount;
        }
        throw err;
      }

      return updatedAccount;
    });
  }
}
