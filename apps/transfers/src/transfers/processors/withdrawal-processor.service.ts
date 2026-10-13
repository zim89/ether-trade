import { Metadata } from '@grpc/grpc-js';
import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { v7 as uuidv7 } from 'uuid';
import { Currency } from '@app/common/constants';
import type {
  AccountsServiceClient,
  WithdrawalCompletedEvent,
  WithdrawalFailedEvent,
} from '@app/contracts';
import {
  GRPC_METADATA_KEYS,
  MOCK_USDT_ABI,
  OutboxAggregateType,
  OutboxStatus,
  PROTO_SERVICES,
  SERVICE_CALLER_IDS,
} from '@app/contracts';
import { scalePlatformAmountToEvm } from '../../common/utils';
import { DRIZZLE_CLIENT } from '../../database/database.constants';
import type { DrizzleDB } from '../../database/database.module';
import { TransfersOutboxRepository } from '../../outbox/transfers-outbox.repository';
import { RpcClientService } from '../blockchain/rpc-client.service';
import { TRANSFERS_LOGS, TRANSFERS_TOKENS } from '../transfers.constants';
import { TransfersRepository } from '../transfers.repository';

@Injectable()
export class WithdrawalProcessorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WithdrawalProcessorService.name);
  private isProcessingLoopActive = false;
  private loopTimeout?: NodeJS.Timeout;

  constructor(
    private readonly rpcClient: RpcClientService,
    private readonly repository: TransfersRepository,
    private readonly outboxRepository: TransfersOutboxRepository,
    @Inject(PROTO_SERVICES.accounts)
    private readonly accountsClient: AccountsServiceClient,
    @Inject(DRIZZLE_CLIENT)
    private readonly db: DrizzleDB,
  ) {}

  async onModuleInit() {
    await this.recoverStuckProcessingWithdrawals();
    this.startWorker();
  }

  onModuleDestroy() {
    this.stopWorker();
  }

  /**
   * Crash Recovery: finds PROCESSING withdrawals that have a txHash on startup
   * and queries the chain receipt to either complete or fail them.
   */
  private async recoverStuckProcessingWithdrawals() {
    this.logger.log('Running crash recovery for stuck withdrawal requests...');
    const stuck = await this.repository.findProcessingWithdrawalsWithTxHash();

    for (const req of stuck) {
      if (!req.txHash) continue;
      this.logger.warn(`Recovering processing withdrawal ${req.id} with txHash ${req.txHash}`);
      try {
        const receipt = await this.rpcClient.publicClient.getTransactionReceipt({
          hash: req.txHash as `0x${string}`,
        });

        if (receipt.status === 'success') {
          await this.completeWithdrawal(
            req.id,
            req.userId,
            req.amount,
            req.currency as Currency,
            req.txHash,
          );
        } else {
          await this.failWithdrawal(
            req.id,
            req.userId,
            req.amount,
            req.currency as Currency,
            req.idempotencyKey,
            'Transaction reverted on-chain',
          );
        }
      } catch (err) {
        this.logger.error(`Failed to recover withdrawal ${req.id}:`, err);
      }
    }
  }

  private startWorker() {
    this.isProcessingLoopActive = true;
    this.scheduleNextTick(100);
  }

  private stopWorker() {
    this.isProcessingLoopActive = false;
    if (this.loopTimeout) {
      clearTimeout(this.loopTimeout);
    }
  }

  private scheduleNextTick(delayMs = 2000) {
    if (!this.isProcessingLoopActive) return;
    this.loopTimeout = setTimeout(() => {
      void this.processNextWithdrawal();
    }, delayMs);
  }

  private async processNextWithdrawal() {
    if (!this.isProcessingLoopActive) return;

    try {
      // Pick next PENDING request with SKIP LOCKED
      const req = await this.repository.lockNextPendingWithdrawal();
      if (!req) {
        return; // No pending withdrawals
      }

      await this.executeOnChainWithdrawal(
        req.id,
        req.userId,
        req.amount,
        req.currency as Currency,
        req.destinationAddress as `0x${string}`,
        req.idempotencyKey,
      );
    } catch (err) {
      this.logger.error('Error during withdrawal processing:', err);
    } finally {
      this.scheduleNextTick(2000);
    }
  }

  private async executeOnChainWithdrawal(
    id: string,
    userId: string,
    amount: string,
    currency: Currency,
    destinationAddress: `0x${string}`,
    idempotencyKey: string,
  ): Promise<void> {
    try {
      let txHash: `0x${string}`;

      if (currency === Currency.ETH) {
        const weiAmount = scalePlatformAmountToEvm(amount, TRANSFERS_TOKENS.NATIVE_ETH_DECIMALS);
        txHash = await this.rpcClient.walletClient.sendTransaction({
          account: this.rpcClient.account,
          to: destinationAddress,
          value: weiAmount,
        });
      } else if (currency === Currency.USDT) {
        const tokenUnits = scalePlatformAmountToEvm(amount, TRANSFERS_TOKENS.USDT_DECIMALS);
        txHash = await this.rpcClient.walletClient.writeContract({
          account: this.rpcClient.account,
          address: this.rpcClient.usdtTokenAddress,
          abi: MOCK_USDT_ABI,
          functionName: 'transfer',
          args: [destinationAddress, tokenUnits],
        });
      } else {
        throw new Error(`Unsupported withdrawal currency: ${currency}`);
      }

      // Record txHash
      await this.repository.updateWithdrawalTx(id, txHash, 0);
      this.logger.log(TRANSFERS_LOGS.withdrawal.processing(id, txHash));

      // Wait for receipt
      const receipt = await this.rpcClient.publicClient.waitForTransactionReceipt({
        hash: txHash,
      });

      if (receipt.status === 'success') {
        await this.completeWithdrawal(id, userId, amount, currency, txHash);
      } else {
        await this.failWithdrawal(
          id,
          userId,
          amount,
          currency,
          idempotencyKey,
          'Transaction reverted',
        );
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'On-chain transaction execution failed';
      this.logger.error(`On-chain transaction failed for withdrawal ${id}:`, err);
      await this.failWithdrawal(id, userId, amount, currency, idempotencyKey, errorMsg);
    }
  }

  private async completeWithdrawal(
    id: string,
    userId: string,
    amount: string,
    currency: Currency,
    txHash: string,
  ): Promise<void> {
    const now = Date.now();
    const correlationId = uuidv7();

    try {
      const metadata = new Metadata();
      metadata.set(GRPC_METADATA_KEYS.serviceId, SERVICE_CALLER_IDS.transfersService);
      metadata.set(GRPC_METADATA_KEYS.callerId, userId);

      // Saga Phase 2: Debit locked balance
      await firstValueFrom(
        this.accountsClient.debitWithdrawalFunds(
          {
            userId,
            amount,
            currency,
            idempotencyKey: `withdrawal-debit:${id}`,
            referenceId: id,
          },
          metadata,
        ),
      );

      // Atomically complete withdrawal and record WithdrawalCompletedEvent in outbox
      await this.db.transaction(async (tx) => {
        await this.repository.completeWithdrawal(id, tx);

        const eventPayload: WithdrawalCompletedEvent = {
          withdrawalId: id,
          userId,
          currency,
          amount,
          txHash,
          timestamp: now,
        };

        await this.outboxRepository.insert(
          {
            id: uuidv7(),
            aggregateType: OutboxAggregateType.WITHDRAWAL,
            aggregateId: id,
            partitionKey: userId,
            eventType: 'withdrawal_completed',
            payload: {
              eventId: uuidv7(),
              eventType: 'transfers.withdrawal_completed',
              aggregateId: id,
              partitionKey: userId,
              timestamp: now,
              correlationId,
              payload: eventPayload,
            },
            status: OutboxStatus.PENDING,
            retryCount: 0,
          },
          tx,
        );
      });

      this.logger.log(TRANSFERS_LOGS.withdrawal.completed(id, txHash));
    } catch (err) {
      this.logger.error(`Failed to finalize debit for completed withdrawal ${id}:`, err);
    }
  }

  private async failWithdrawal(
    id: string,
    userId: string,
    amount: string,
    currency: Currency,
    idempotencyKey: string,
    reason: string,
  ): Promise<void> {
    const now = Date.now();
    const correlationId = uuidv7();

    try {
      const metadata = new Metadata();
      metadata.set(GRPC_METADATA_KEYS.serviceId, SERVICE_CALLER_IDS.transfersService);
      metadata.set(GRPC_METADATA_KEYS.callerId, userId);

      // Compensating transaction: unlock balance
      await firstValueFrom(
        this.accountsClient.unlockBalance(
          {
            userId,
            amount,
            currency,
            idempotencyKey: `withdrawal-unlock:${idempotencyKey}`,
            referenceId: id,
          },
          metadata,
        ),
      );
    } catch (err) {
      this.logger.error(`Compensating unlock failed for withdrawal ${id}:`, err);
    }

    try {
      // Atomically fail withdrawal and record WithdrawalFailedEvent in outbox
      await this.db.transaction(async (tx) => {
        await this.repository.failWithdrawal(id, reason.slice(0, 255), tx);

        const eventPayload: WithdrawalFailedEvent = {
          withdrawalId: id,
          userId,
          currency,
          amount,
          txHash: '',
          reason: reason.slice(0, 255),
          timestamp: now,
        };

        await this.outboxRepository.insert(
          {
            id: uuidv7(),
            aggregateType: OutboxAggregateType.WITHDRAWAL,
            aggregateId: id,
            partitionKey: userId,
            eventType: 'withdrawal_failed',
            payload: {
              eventId: uuidv7(),
              eventType: 'transfers.withdrawal_failed',
              aggregateId: id,
              partitionKey: userId,
              timestamp: now,
              correlationId,
              payload: eventPayload,
            },
            status: OutboxStatus.PENDING,
            retryCount: 0,
          },
          tx,
        );
      });

      this.logger.warn(TRANSFERS_LOGS.withdrawal.failed(id, reason));
    } catch (dbErr) {
      this.logger.error(`Failed to record withdrawal failure for ${id}:`, dbErr);
    }
  }
}
