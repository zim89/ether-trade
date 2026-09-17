import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { validate as isValidUuid } from 'uuid';
import { Currency, DEFAULT_CURRENCY, SUPPORTED_CURRENCIES } from '@app/common/constants';
import type {
  GetBalanceRequest,
  DepositSandboxFundsRequest,
  LockBalanceRequest,
  UnlockBalanceRequest,
} from '@app/contracts';
import { Account } from '../database/schema/accounts.schema';
import {
  BALANCES_ERRORS,
  BALANCES_LOGS,
  SANDBOX_DEPOSIT_MAX,
  DECIMAL_SCALE,
  AMOUNT_REGEX,
} from './balances.constants';
import { BalancesRepository } from './balances.repository';

/**
 * Service orchestrating balance management:
 * - Validation of inputs (UUID, positive decimal amounts, supported currencies).
 * - Safe decimal calculations for total balance.
 * - Calling repository operations for Get, Deposit, Lock, Unlock.
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
      throw new BadRequestException(BALANCES_ERRORS.invalidUserId);
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
      throw new BadRequestException(BALANCES_ERRORS.unsupportedCurrency(currency));
    }

    return normalized;
  }

  /**
   * Validates that the amount is a positive decimal string with at most 8 decimal places
   * and optionally checks against a maximum limit.
   */
  private validateAmount(amount: string, maxAmount?: string): string {
    if (!amount || typeof amount !== 'string' || !AMOUNT_REGEX.test(amount.trim())) {
      throw new BadRequestException(BALANCES_ERRORS.invalidAmount);
    }

    const trimmed = amount.trim();
    const scaled = this.toScaledBigInt(trimmed);

    if (scaled <= 0n) {
      throw new BadRequestException(BALANCES_ERRORS.invalidAmount);
    }

    if (maxAmount) {
      const maxScaled = this.toScaledBigInt(maxAmount);
      if (scaled > maxScaled) {
        throw new BadRequestException(BALANCES_ERRORS.depositLimitExceeded(maxAmount));
      }
    }

    return trimmed;
  }

  /**
   * Calculates total balance (available + locked) preserving exact 8 decimal places.
   */
  calculateTotalBalance(available: string, locked: string): string {
    const sum = this.toScaledBigInt(available) + this.toScaledBigInt(locked);
    const sumStr = sum.toString().padStart(DECIMAL_SCALE + 1, '0');
    const integerPart = sumStr.slice(0, -DECIMAL_SCALE) || '0';
    const fractionPart = sumStr.slice(-DECIMAL_SCALE);
    return `${integerPart}.${fractionPart}`;
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
    const idempotencyKey = data.idempotencyKey?.trim() || undefined;

    this.logger.log(BALANCES_LOGS.depositRequested(userId, amount, currency));

    return await this.balancesRepository.deposit({
      userId,
      currency,
      amount,
      idempotencyKey,
    });
  }

  /**
   * Moves funds from available to locked balance (e.g. order reservation).
   */
  async lockBalance(data: LockBalanceRequest): Promise<Account> {
    const userId = this.validateUserId(data.userId);
    const currency = this.normalizeCurrency(data.currency);
    const amount = this.validateAmount(data.amount);
    const idempotencyKey = data.idempotencyKey?.trim() || undefined;
    const referenceId = data.referenceId?.trim() || undefined;

    this.logger.log(BALANCES_LOGS.lockRequested(userId, amount, currency));

    return await this.balancesRepository.lock({
      userId,
      currency,
      amount,
      idempotencyKey,
      referenceId,
    });
  }

  /**
   * Releases funds from locked to available balance (e.g. order cancellation).
   */
  async unlockBalance(data: UnlockBalanceRequest): Promise<Account> {
    const userId = this.validateUserId(data.userId);
    const currency = this.normalizeCurrency(data.currency);
    const amount = this.validateAmount(data.amount);
    const idempotencyKey = data.idempotencyKey?.trim() || undefined;
    const referenceId = data.referenceId?.trim() || undefined;

    this.logger.log(BALANCES_LOGS.unlockRequested(userId, amount, currency));

    return await this.balancesRepository.unlock({
      userId,
      currency,
      amount,
      idempotencyKey,
      referenceId,
    });
  }

  private toScaledBigInt(val: string): bigint {
    const [intPart = '0', fracPart = ''] = val.split('.');
    const cleanInt = intPart === '' ? '0' : intPart;
    const paddedFrac = fracPart.padEnd(DECIMAL_SCALE, '0').slice(0, DECIMAL_SCALE);
    return BigInt(cleanInt + paddedFrac);
  }
}
