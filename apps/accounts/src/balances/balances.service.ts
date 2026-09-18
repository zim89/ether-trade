import { status as GrpcStatus } from '@grpc/grpc-js';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import BigNumber from 'bignumber.js';
import { validate as isValidUuid } from 'uuid';
import { Currency, DEFAULT_CURRENCY, SUPPORTED_CURRENCIES } from '@app/common/constants';
import { serializeErrorDetails } from '@app/common/utils';
import type {
  GetBalanceRequest,
  DepositSandboxFundsRequest,
  LockBalanceRequest,
  UnlockBalanceRequest,
} from '@app/contracts';
import { Account } from '../database/schema/accounts.schema';
import {
  BALANCES_ERROR_CODES,
  BALANCES_ERRORS,
  BALANCES_LOGS,
  SANDBOX_DEPOSIT_MAX,
  DECIMAL_SCALE,
  AMOUNT_REGEX,
} from './balances.constants';
import { BalancesRepository } from './balances.repository';
import type { BalanceMutationResult } from './balances.types';

BigNumber.config({ DECIMAL_PLACES: DECIMAL_SCALE, ROUNDING_MODE: BigNumber.ROUND_DOWN });

/**
 * Service orchestrating balance management:
 * - Validation of inputs (UUID, positive decimal amounts, supported currencies).
 * - Safe decimal calculations via bignumber.js.
 * - Mapping repository results to transport exceptions.
 */
@Injectable()
export class BalancesService {
  private readonly logger = new Logger(BalancesService.name);

  constructor(private readonly balancesRepository: BalancesRepository) {}

  /**
   * Validates and returns the user ID if it is a valid UUID format.
   */
  private validateUserId(userId: string): string {
    if (!userId || !isValidUuid(userId)) {
      throw new BadRequestException({
        message: BALANCES_ERRORS.invalidUserId,
        errorCode: BALANCES_ERROR_CODES.invalidUserId,
      });
    }
    return userId;
  }

  /**
   * Normalizes currency string (defaults to USDT and enforces supported currencies).
   */
  private normalizeCurrency(currency?: string): Currency {
    if (!currency || currency.trim() === '') {
      return DEFAULT_CURRENCY;
    }

    const normalized = currency.trim().toUpperCase() as Currency;
    if (!SUPPORTED_CURRENCIES.includes(normalized)) {
      throw new BadRequestException({
        message: BALANCES_ERRORS.unsupportedCurrency(currency),
        errorCode: BALANCES_ERROR_CODES.unsupportedCurrency,
      });
    }

    return normalized;
  }

  /**
   * Validates that the amount is a positive decimal string with at most 8 decimal places
   * and optionally checks against a maximum limit.
   */
  private validateAmount(amount: string, maxAmount?: string): string {
    if (!amount || typeof amount !== 'string' || !AMOUNT_REGEX.test(amount.trim())) {
      throw new BadRequestException({
        message: BALANCES_ERRORS.invalidAmount,
        errorCode: BALANCES_ERROR_CODES.invalidAmount,
      });
    }

    const trimmed = amount.trim();
    const value = new BigNumber(trimmed);

    if (!value.isFinite() || value.lte(0)) {
      throw new BadRequestException({
        message: BALANCES_ERRORS.invalidAmount,
        errorCode: BALANCES_ERROR_CODES.invalidAmount,
      });
    }

    if (maxAmount) {
      const max = new BigNumber(maxAmount);
      if (value.gt(max)) {
        throw new BadRequestException({
          message: BALANCES_ERRORS.depositLimitExceeded(maxAmount),
          errorCode: BALANCES_ERROR_CODES.depositLimitExceeded,
        });
      }
    }

    return value.toFixed();
  }

  private requireIdempotencyKey(idempotencyKey?: string): string {
    const key = idempotencyKey?.trim();
    if (!key) {
      throw new BadRequestException({
        message: BALANCES_ERRORS.idempotencyKeyRequired,
        errorCode: BALANCES_ERROR_CODES.idempotencyKeyRequired,
      });
    }
    return key;
  }

  /**
   * Calculates total balance (available + locked) preserving exact decimal places.
   */
  calculateTotalBalance(available: string, locked: string): string {
    return new BigNumber(available).plus(locked).toFixed(DECIMAL_SCALE);
  }

  /**
   * Retrieves or lazily creates a zero-balance account for the user and currency.
   */
  async getBalance(data: GetBalanceRequest): Promise<Account> {
    const userId = this.validateUserId(data.userId);
    const currency = this.normalizeCurrency(data.currency);

    return await this.balancesRepository.findOrCreate(userId, currency);
  }

  /**
   * Credits virtual sandbox USDT funds to user's available balance.
   */
  async depositSandboxFunds(data: DepositSandboxFundsRequest): Promise<Account> {
    const userId = this.validateUserId(data.userId);
    const currency = this.normalizeCurrency(data.currency);
    const amount = this.validateAmount(data.amount, SANDBOX_DEPOSIT_MAX);
    const idempotencyKey = this.requireIdempotencyKey(data.idempotencyKey);

    this.logger.log(BALANCES_LOGS.depositRequested(userId, amount, currency));

    const result = await this.balancesRepository.deposit({
      userId,
      currency,
      amount,
      idempotencyKey,
    });

    return this.mapMutationResult(result, { amount, userId, currency });
  }

  /**
   * Moves funds from available to locked balance (e.g. order reservation).
   */
  async lockBalance(data: LockBalanceRequest): Promise<Account> {
    const userId = this.validateUserId(data.userId);
    const currency = this.normalizeCurrency(data.currency);
    const amount = this.validateAmount(data.amount);
    const idempotencyKey = this.requireIdempotencyKey(data.idempotencyKey);
    const referenceId = data.referenceId?.trim() || undefined;

    this.logger.log(BALANCES_LOGS.lockRequested(userId, amount, currency));

    const result = await this.balancesRepository.lock({
      userId,
      currency,
      amount,
      idempotencyKey,
      referenceId,
    });

    return this.mapMutationResult(result, { amount, userId, currency });
  }

  /**
   * Releases funds from locked to available balance (e.g. order cancellation).
   */
  async unlockBalance(data: UnlockBalanceRequest): Promise<Account> {
    const userId = this.validateUserId(data.userId);
    const currency = this.normalizeCurrency(data.currency);
    const amount = this.validateAmount(data.amount);
    const idempotencyKey = this.requireIdempotencyKey(data.idempotencyKey);
    const referenceId = data.referenceId?.trim() || undefined;

    this.logger.log(BALANCES_LOGS.unlockRequested(userId, amount, currency));

    const result = await this.balancesRepository.unlock({
      userId,
      currency,
      amount,
      idempotencyKey,
      referenceId,
    });

    return this.mapMutationResult(result, { amount, userId, currency });
  }

  private mapMutationResult(
    result: BalanceMutationResult,
    ctx: { amount: string; userId: string; currency: Currency },
  ): Account {
    switch (result.status) {
      case 'ok':
      case 'idempotent_replay':
        return result.account;
      case 'not_found':
        throw new NotFoundException({
          message: BALANCES_ERRORS.accountNotFound(ctx.userId, ctx.currency),
          errorCode: BALANCES_ERROR_CODES.accountNotFound,
        });
      case 'insufficient_available':
        throw new RpcException({
          code: GrpcStatus.FAILED_PRECONDITION,
          message: BALANCES_ERRORS.insufficientAvailableBalance(result.available, ctx.amount),
          details: serializeErrorDetails(
            BALANCES_ERRORS.insufficientAvailableBalance(result.available, ctx.amount),
            BALANCES_ERROR_CODES.insufficientBalance,
          ),
        });
      case 'insufficient_locked':
        throw new RpcException({
          code: GrpcStatus.FAILED_PRECONDITION,
          message: BALANCES_ERRORS.insufficientLockedBalance(result.locked, ctx.amount),
          details: serializeErrorDetails(
            BALANCES_ERRORS.insufficientLockedBalance(result.locked, ctx.amount),
            BALANCES_ERROR_CODES.insufficientLockedBalance,
          ),
        });
      case 'idempotency_payload_mismatch':
        throw new BadRequestException({
          message: BALANCES_ERRORS.idempotencyKeyPayloadMismatch,
          errorCode: BALANCES_ERROR_CODES.idempotencyKeyPayloadMismatch,
        });
      default: {
        const exhaustive: never = result;
        throw new Error(`Unhandled balance mutation result: ${JSON.stringify(exhaustive)}`);
      }
    }
  }
}
