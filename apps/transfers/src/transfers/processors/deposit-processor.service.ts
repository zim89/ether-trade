import { Metadata } from '@grpc/grpc-js';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { Currency } from '@app/common/constants';
import type { AccountsServiceClient } from '@app/contracts';
import { GRPC_METADATA_KEYS, PROTO_SERVICES, SERVICE_CALLER_IDS } from '@app/contracts';
import {
  bytes16ToUuid,
  isAboveMinDepositThreshold,
  scaleEvmAmountToPlatform,
} from '../../common/utils';
import { RpcClientService } from '../blockchain/rpc-client.service';
import { TRANSFERS_LOGS, TRANSFERS_TOKENS, TokenConfig } from '../transfers.constants';
import { TransfersRepository } from '../transfers.repository';

@Injectable()
export class DepositProcessorService {
  private readonly logger = new Logger(DepositProcessorService.name);

  constructor(
    private readonly rpcClient: RpcClientService,
    private readonly repository: TransfersRepository,
    @Inject(PROTO_SERVICES.accounts)
    private readonly accountsClient: AccountsServiceClient,
  ) {}

  /**
   * Resolves supported token config for a token address.
   * If tokenAddress is null or zero-address, resolves native ETH.
   */
  private resolveTokenConfig(tokenAddress: `0x${string}` | null): TokenConfig | null {
    if (
      !tokenAddress ||
      tokenAddress.toLowerCase() === TRANSFERS_TOKENS.NATIVE_ETH_ADDRESS.toLowerCase()
    ) {
      return {
        currency: Currency.ETH,
        decimals: TRANSFERS_TOKENS.NATIVE_ETH_DECIMALS,
      };
    }

    if (tokenAddress.toLowerCase() === this.rpcClient.usdtTokenAddress.toLowerCase()) {
      return {
        currency: Currency.USDT,
        decimals: TRANSFERS_TOKENS.USDT_DECIMALS,
      };
    }

    return null;
  }

  /**
   * Processes a single NativeDeposited or TokenDeposited event log.
   */
  async processDepositEvent(params: {
    txHash: `0x${string}`;
    blockNumber: number;
    userBytes16: `0x${string}`;
    tokenAddress: `0x${string}` | null;
    rawAmount: bigint;
  }): Promise<void> {
    const { txHash, blockNumber, userBytes16, tokenAddress, rawAmount } = params;

    // Check if deposit already recorded (idempotency check)
    const existing = await this.repository.findDepositByTxHash(txHash);
    if (existing) {
      if (existing.status === 'CONFIRMED') {
        // Retry crediting accounts if not yet credited
        await this.creditUserAccount(
          existing.id,
          existing.userId,
          existing.amount,
          existing.currency as Currency,
          txHash,
        );
      }
      return;
    }

    let userId: string;
    try {
      userId = bytes16ToUuid(userBytes16);
    } catch (err) {
      this.logger.error(
        `Failed to decode userId from bytes16 ${userBytes16} in tx ${txHash}:`,
        err,
      );
      return;
    }

    const tokenConfig = this.resolveTokenConfig(tokenAddress);
    if (!tokenConfig) {
      // Fake Token Deposit Attack protection
      this.logger.warn(
        TRANSFERS_LOGS.deposit.rejected(
          txHash,
          tokenAddress ?? 'unknown',
          'Unsupported token address (not whitelisted)',
        ),
      );
      await this.repository.createDeposit({
        userId,
        txHash,
        blockNumber,
        tokenAddress: tokenAddress ?? undefined,
        currency: 'UNKNOWN',
        amount: '0',
        status: 'REJECTED_UNSUPPORTED_TOKEN',
      });
      return;
    }

    const platformAmount = scaleEvmAmountToPlatform(rawAmount, tokenConfig.decimals);
    if (!isAboveMinDepositThreshold(platformAmount)) {
      this.logger.warn(
        TRANSFERS_LOGS.deposit.rejected(
          txHash,
          tokenAddress ?? 'native',
          `Amount ${platformAmount} is below MIN_DEPOSIT_THRESHOLD`,
        ),
      );
      await this.repository.createDeposit({
        userId,
        txHash,
        blockNumber,
        tokenAddress: tokenAddress ?? undefined,
        currency: tokenConfig.currency,
        amount: platformAmount,
        status: 'REJECTED_UNSUPPORTED_TOKEN',
      });
      return;
    }

    // Save as CONFIRMED
    const deposit = await this.repository.createDeposit({
      userId,
      txHash,
      blockNumber,
      tokenAddress: tokenAddress ?? undefined,
      currency: tokenConfig.currency,
      amount: platformAmount,
      status: 'CONFIRMED',
    });

    // Credit in accounts-service
    await this.creditUserAccount(deposit.id, userId, platformAmount, tokenConfig.currency, txHash);
  }

  private async creditUserAccount(
    depositId: string,
    userId: string,
    amount: string,
    currency: Currency,
    txHash: string,
  ): Promise<void> {
    try {
      const metadata = new Metadata();
      metadata.set(GRPC_METADATA_KEYS.serviceId, SERVICE_CALLER_IDS.transfersService);
      metadata.set(GRPC_METADATA_KEYS.callerId, userId);

      await firstValueFrom(
        this.accountsClient.creditDepositFunds(
          {
            userId,
            amount,
            currency,
            idempotencyKey: `deposit:${txHash}`,
            referenceId: depositId,
          },
          metadata,
        ),
      );

      await this.repository.updateDepositStatus(depositId, 'CREDITED');
      this.logger.log(TRANSFERS_LOGS.deposit.processed(txHash, userId, amount, currency));
    } catch (err) {
      this.logger.error(
        `Failed to credit deposit funds in accounts-service for user ${userId}, tx ${txHash}:`,
        err,
      );
    }
  }
}
