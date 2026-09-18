import { Injectable, Inject } from '@nestjs/common';
import BigNumber from 'bignumber.js';
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
import type {
  BalanceMutationResult,
  DepositParams,
  ExpectedLedgerType,
  LockParams,
  UnlockParams,
} from './balances.types';

/**
 * Data access repository for the `accounts` and `ledger_transactions` tables.
 * Performs critical balance operations with pessimistic locking (SELECT ... FOR UPDATE)
 * and ensures append-only ledger transaction recording.
 *
 * Does not throw NestJS transport exceptions — returns discriminated result objects.
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
   */
  async deposit(params: DepositParams): Promise<BalanceMutationResult> {
    const { userId, currency, amount, idempotencyKey } = params;

    return await this.db.transaction(async (tx) => {
      const replay = await this.resolveIdempotencyReplay(tx, {
        idempotencyKey,
        amount,
        currency,
        expectedType: LedgerTransactionType.DEPOSIT,
      });
      if (replay) {
        return replay;
      }

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
          const [lockedAccount] = await tx
            .select()
            .from(accounts)
            .where(and(eq(accounts.userId, userId), eq(accounts.currency, currency)))
            .for(PG_LOCK_STRENGTH.update);
          account = lockedAccount;
        }
      }

      if (!account) {
        return { status: 'not_found' };
      }

      const [updatedAccount] = await tx
        .update(accounts)
        .set({
          availableBalance: sql`${accounts.availableBalance} + ${amount}::numeric`,
          updatedAt: new Date(),
        })
        .where(eq(accounts.id, account.id))
        .returning();

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
          idempotencyKey,
          referenceId: null,
        });
      } catch (err: unknown) {
        if (this.isIdempotencyUniqueViolation(err)) {
          const concurrentReplay = await this.resolveIdempotencyReplay(tx, {
            idempotencyKey,
            amount,
            currency,
            expectedType: LedgerTransactionType.DEPOSIT,
          });
          if (concurrentReplay) {
            return concurrentReplay;
          }
        }
        throw err;
      }

      return { status: 'ok', account: updatedAccount };
    });
  }

  /**
   * Locks funds from available balance to locked balance in an atomic transaction.
   */
  async lock(params: LockParams): Promise<BalanceMutationResult> {
    const { userId, currency, amount, idempotencyKey, referenceId } = params;

    return await this.db.transaction(async (tx) => {
      const replay = await this.resolveIdempotencyReplay(tx, {
        idempotencyKey,
        amount,
        currency,
        expectedType: LedgerTransactionType.LOCK,
      });
      if (replay) {
        return replay;
      }

      const [account] = await tx
        .select()
        .from(accounts)
        .where(and(eq(accounts.userId, userId), eq(accounts.currency, currency)))
        .for(PG_LOCK_STRENGTH.update);

      if (!account) {
        return { status: 'not_found' };
      }

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
        return {
          status: 'insufficient_available',
          available: account.availableBalance,
        };
      }

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
          idempotencyKey,
          referenceId: referenceId || null,
        });
      } catch (err: unknown) {
        if (this.isIdempotencyUniqueViolation(err)) {
          const concurrentReplay = await this.resolveIdempotencyReplay(tx, {
            idempotencyKey,
            amount,
            currency,
            expectedType: LedgerTransactionType.LOCK,
          });
          if (concurrentReplay) {
            return concurrentReplay;
          }
        }
        throw err;
      }

      return { status: 'ok', account: updatedAccount };
    });
  }

  /**
   * Releases locked funds back to available balance in an atomic transaction.
   */
  async unlock(params: UnlockParams): Promise<BalanceMutationResult> {
    const { userId, currency, amount, idempotencyKey, referenceId } = params;

    return await this.db.transaction(async (tx) => {
      const replay = await this.resolveIdempotencyReplay(tx, {
        idempotencyKey,
        amount,
        currency,
        expectedType: LedgerTransactionType.UNLOCK,
      });
      if (replay) {
        return replay;
      }

      const [account] = await tx
        .select()
        .from(accounts)
        .where(and(eq(accounts.userId, userId), eq(accounts.currency, currency)))
        .for(PG_LOCK_STRENGTH.update);

      if (!account) {
        return { status: 'not_found' };
      }

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
        return {
          status: 'insufficient_locked',
          locked: account.lockedBalance,
        };
      }

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
          idempotencyKey,
          referenceId: referenceId || null,
        });
      } catch (err: unknown) {
        if (this.isIdempotencyUniqueViolation(err)) {
          const concurrentReplay = await this.resolveIdempotencyReplay(tx, {
            idempotencyKey,
            amount,
            currency,
            expectedType: LedgerTransactionType.UNLOCK,
          });
          if (concurrentReplay) {
            return concurrentReplay;
          }
        }
        throw err;
      }

      return { status: 'ok', account: updatedAccount };
    });
  }

  private isIdempotencyUniqueViolation(err: unknown): boolean {
    return (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code: string }).code === PG_ERROR_CODES.uniqueViolation
    );
  }

  private async resolveIdempotencyReplay(
    tx: Parameters<Parameters<DrizzleDB['transaction']>[0]>[0],
    params: {
      idempotencyKey: string;
      amount: string;
      currency: Currency;
      expectedType: ExpectedLedgerType;
    },
  ): Promise<BalanceMutationResult | null> {
    const [existingTx] = await tx
      .select()
      .from(ledgerTransactions)
      .where(eq(ledgerTransactions.idempotencyKey, params.idempotencyKey))
      .limit(1);

    if (!existingTx) {
      return null;
    }

    const amountMatches = new BigNumber(existingTx.amount).eq(params.amount);
    const currencyMatches = existingTx.currency === params.currency;
    const typeMatches = existingTx.type === params.expectedType;

    if (!amountMatches || !currencyMatches || !typeMatches) {
      return { status: 'idempotency_payload_mismatch' };
    }

    const [currentAccount] = await tx
      .select()
      .from(accounts)
      .where(eq(accounts.id, existingTx.accountId))
      .limit(1);

    if (!currentAccount) {
      return { status: 'not_found' };
    }

    return { status: 'idempotent_replay', account: currentAccount };
  }
}
