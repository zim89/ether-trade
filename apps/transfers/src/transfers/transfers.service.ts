import { Metadata } from '@grpc/grpc-js';
import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import BigNumber from 'bignumber.js';
import { firstValueFrom } from 'rxjs';
import { validate as isValidUuid } from 'uuid';
import { isAddress } from 'viem';
import { Currency } from '@app/common/constants';
import type {
  AccountsServiceClient,
  GetDepositAddressRequest,
  GetDepositAddressResponse,
  GetWithdrawalByIdRequest,
  GetWithdrawalByIdResponse,
  GetWithdrawalHistoryRequest,
  GetWithdrawalHistoryResponse,
  RequestWithdrawalRequest,
  RequestWithdrawalResponse,
  WithdrawalItem,
} from '@app/contracts';
import { GRPC_METADATA_KEYS, PROTO_SERVICES, SERVICE_CALLER_IDS } from '@app/contracts';
import { uuidToBytes16 } from '../common/utils';
import type { WithdrawalRequest } from '../database/schema';
import { RpcClientService } from './blockchain/rpc-client.service';
import { TRANSFERS_ERRORS, TRANSFERS_LOGS } from './transfers.constants';
import { TransfersRepository } from './transfers.repository';

@Injectable()
export class TransfersService {
  private readonly logger = new Logger(TransfersService.name);

  constructor(
    private readonly rpcClient: RpcClientService,
    private readonly repository: TransfersRepository,
    @Inject(PROTO_SERVICES.accounts)
    private readonly accountsClient: AccountsServiceClient,
  ) {}

  /**
   * Generates deposit address details for user.
   */
  getDepositAddress(data: GetDepositAddressRequest): GetDepositAddressResponse {
    const userId = this.validateUserId(data.userId);
    const userBytes16 = uuidToBytes16(userId);

    return {
      vaultAddress: this.rpcClient.depositVaultAddress,
      userId,
      userIdBytes16: userBytes16,
    };
  }

  /**
   * Saga coordinator: requests a new withdrawal.
   * 1. Idempotency check.
   * 2. Lock balance in accounts-service (Phase 1).
   * 3. Insert withdrawal_requests with PENDING.
   * 4. Compensating unlock on DB insertion error.
   */
  async requestWithdrawal(
    data: RequestWithdrawalRequest,
    _metadata?: unknown,
  ): Promise<RequestWithdrawalResponse> {
    const userId = this.validateUserId(data.userId);
    const currency = this.validateCurrency(data.currency);
    const amount = this.validateAmount(data.amount);
    const destinationAddress = this.validateAddress(data.destinationAddress);
    const idempotencyKey = this.requireIdempotencyKey(data.idempotencyKey);

    // 1. Idempotency check
    const existing = await this.repository.findWithdrawalByIdempotency(userId, idempotencyKey);
    if (existing) {
      return { withdrawal: this.mapToWithdrawalItem(existing) };
    }

    // 2. Lock balance in accounts-service
    const m2mMetadata = new Metadata();
    m2mMetadata.set(GRPC_METADATA_KEYS.serviceId, SERVICE_CALLER_IDS.transfersService);
    m2mMetadata.set(GRPC_METADATA_KEYS.callerId, userId);

    try {
      await firstValueFrom(
        this.accountsClient.lockBalance(
          {
            userId,
            amount,
            currency,
            idempotencyKey: `withdraw-lock:${idempotencyKey}`,
            referenceId: idempotencyKey,
          },
          m2mMetadata,
        ),
      );
    } catch (err: any) {
      this.logger.error(`Failed to lock balance for withdrawal: ${userId}`, err);
      throw err;
    }

    // 3. Insert into transfers_db
    try {
      const created = await this.repository.createWithdrawalRequest({
        userId,
        idempotencyKey,
        destinationAddress,
        currency,
        amount,
        status: 'PENDING',
      });

      this.logger.log(TRANSFERS_LOGS.withdrawal.requested(created.id, userId, amount, currency));
      return { withdrawal: this.mapToWithdrawalItem(created) };
    } catch (err: any) {
      // 4. Compensating unlock
      this.logger.error(`Failed to save withdrawal request, compensating unlock:`, err);
      try {
        await firstValueFrom(
          this.accountsClient.unlockBalance(
            {
              userId,
              amount,
              currency,
              idempotencyKey: `withdraw-lock-compensate:${idempotencyKey}`,
              referenceId: idempotencyKey,
            },
            m2mMetadata,
          ),
        );
      } catch (compErr) {
        this.logger.error('Compensating unlock failed:', compErr);
      }
      throw err;
    }
  }

  async getWithdrawalById(data: GetWithdrawalByIdRequest): Promise<GetWithdrawalByIdResponse> {
    const userId = this.validateUserId(data.userId);
    const withdrawal = await this.repository.findWithdrawalById(data.withdrawalId, userId);

    if (!withdrawal) {
      throw new NotFoundException({
        message: TRANSFERS_ERRORS.withdrawalNotFound(data.withdrawalId),
      });
    }

    return { withdrawal: this.mapToWithdrawalItem(withdrawal) };
  }

  async getWithdrawalHistory(
    data: GetWithdrawalHistoryRequest,
  ): Promise<GetWithdrawalHistoryResponse> {
    const userId = this.validateUserId(data.userId);
    const limit = Math.min(Math.max(data.limit ?? 20, 1), 100);
    const offset = Math.max(data.offset ?? 0, 0);

    const { items, total } = await this.repository.findUserWithdrawals(
      userId,
      data.status,
      limit,
      offset,
    );

    return {
      withdrawals: items.map((w) => this.mapToWithdrawalItem(w)),
      total,
    };
  }

  private mapToWithdrawalItem(row: WithdrawalRequest): WithdrawalItem {
    return {
      id: row.id,
      userId: row.userId,
      destinationAddress: row.destinationAddress,
      currency: row.currency,
      amount: row.amount,
      txHash: row.txHash ?? undefined,
      nonce: row.nonce ?? undefined,
      status: row.status,
      errorMessage: row.errorMessage ?? undefined,
      idempotencyKey: row.idempotencyKey,
      createdAt: Math.floor(row.createdAt.getTime() / 1000),
      updatedAt: row.processedAt
        ? Math.floor(row.processedAt.getTime() / 1000)
        : Math.floor(row.createdAt.getTime() / 1000),
      processedAt: row.processedAt ? Math.floor(row.processedAt.getTime() / 1000) : undefined,
    };
  }

  private validateUserId(userId: string): string {
    if (!userId || !isValidUuid(userId)) {
      throw new BadRequestException({ message: TRANSFERS_ERRORS.invalidUserId });
    }
    return userId;
  }

  private validateCurrency(currency: string): Currency {
    const normalized = (currency || '').trim().toUpperCase() as Currency;
    if (normalized !== Currency.ETH && normalized !== Currency.USDT) {
      throw new BadRequestException({
        message: TRANSFERS_ERRORS.unsupportedCurrency(currency),
      });
    }
    return normalized;
  }

  private validateAmount(amount: string): string {
    const bn = new BigNumber(amount);
    if (!bn.isFinite() || bn.lte(0)) {
      throw new BadRequestException({ message: TRANSFERS_ERRORS.invalidAmount });
    }
    return bn.toFixed(8, BigNumber.ROUND_DOWN);
  }

  private validateAddress(addr: string): `0x${string}` {
    if (!addr || !isAddress(addr)) {
      throw new BadRequestException({
        message: TRANSFERS_ERRORS.invalidDestinationAddress,
      });
    }
    return addr.toLowerCase() as `0x${string}`;
  }

  private requireIdempotencyKey(key?: string): string {
    const trimmed = (key || '').trim();
    if (!trimmed) {
      throw new BadRequestException({ message: TRANSFERS_ERRORS.idempotencyKeyRequired });
    }
    return trimmed;
  }
}
