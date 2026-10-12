import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { parseAbiItem } from 'viem';
import { DepositProcessorService } from '../processors/deposit-processor.service';
import { MAX_BLOCK_RANGE, TRANSFERS_LOGS } from '../transfers.constants';
import { TransfersRepository } from '../transfers.repository';
import { RpcClientService } from './rpc-client.service';

const NATIVE_DEPOSITED_EVENT = parseAbiItem(
  'event NativeDeposited(bytes16 indexed userId, address indexed sender, uint256 amount)',
);

const TOKEN_DEPOSITED_EVENT = parseAbiItem(
  'event TokenDeposited(bytes16 indexed userId, address indexed sender, address indexed token, uint256 amount)',
);

@Injectable()
export class DepositScannerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DepositScannerService.name);
  private isRunning = false;
  private pollTimeout?: NodeJS.Timeout;
  private chainId = 31337;

  constructor(
    private readonly rpcClient: RpcClientService,
    private readonly depositProcessor: DepositProcessorService,
    private readonly repository: TransfersRepository,
  ) {}

  async onModuleInit() {
    this.chainId = await this.rpcClient.publicClient.getChainId();
    this.startScanner();
  }

  onModuleDestroy() {
    this.stopScanner();
  }

  private startScanner() {
    this.isRunning = true;
    this.logger.log(`Starting block scanner for chain ${this.chainId}...`);
    this.scheduleNextPoll(100);
  }

  private stopScanner() {
    this.isRunning = false;
    if (this.pollTimeout) {
      clearTimeout(this.pollTimeout);
    }
    this.logger.log('Block scanner stopped.');
  }

  private scheduleNextPoll(delayMs = 1500) {
    if (!this.isRunning) return;
    this.pollTimeout = setTimeout(() => {
      void this.pollBlocks();
    }, delayMs);
  }

  private async pollBlocks() {
    if (!this.isRunning) return;

    try {
      const currentBlockBig = await this.rpcClient.publicClient.getBlockNumber();
      const currentBlock = Number(currentBlockBig);

      // Safe target block considering confirmations
      const safeTargetBlock = Math.max(0, currentBlock - this.rpcClient.confirmations);

      let lastScanned = await this.repository.getLastScannedBlock(this.chainId);

      // Node reset detection (e.g. Anvil restarted)
      if (lastScanned !== null && currentBlock < lastScanned) {
        this.logger.warn(TRANSFERS_LOGS.scanner.nodeResetDetected(currentBlock, lastScanned));
        lastScanned = 0;
        await this.repository.updateLastScannedBlock(this.chainId, 0);
      }

      const fromBlock = lastScanned !== null ? lastScanned + 1 : 0;

      if (fromBlock <= safeTargetBlock) {
        const toBlock = Math.min(fromBlock + MAX_BLOCK_RANGE - 1, safeTargetBlock);

        await this.scanRange(BigInt(fromBlock), BigInt(toBlock));
        await this.repository.updateLastScannedBlock(this.chainId, toBlock);
      }
    } catch (err) {
      this.logger.error('Error during block scanning:', err);
    } finally {
      this.scheduleNextPoll(1500);
    }
  }

  private async scanRange(fromBlock: bigint, toBlock: bigint): Promise<void> {
    const vaultAddress = this.rpcClient.depositVaultAddress;

    // Scan NativeDeposited logs
    const nativeLogs = await this.rpcClient.publicClient.getLogs({
      address: vaultAddress,
      event: NATIVE_DEPOSITED_EVENT,
      fromBlock,
      toBlock,
    });

    for (const log of nativeLogs) {
      const { userId, amount } = log.args;
      if (userId && amount !== undefined) {
        await this.depositProcessor.processDepositEvent({
          txHash: log.transactionHash,
          blockNumber: Number(log.blockNumber),
          userBytes16: userId,
          tokenAddress: null,
          rawAmount: amount,
        });
      }
    }

    // Scan TokenDeposited logs
    const tokenLogs = await this.rpcClient.publicClient.getLogs({
      address: vaultAddress,
      event: TOKEN_DEPOSITED_EVENT,
      fromBlock,
      toBlock,
    });

    for (const log of tokenLogs) {
      const { userId, token, amount } = log.args;
      if (userId && token && amount !== undefined) {
        await this.depositProcessor.processDepositEvent({
          txHash: log.transactionHash,
          blockNumber: Number(log.blockNumber),
          userBytes16: userId,
          tokenAddress: token,
          rawAmount: amount,
        });
      }
    }

    const totalLogs = nativeLogs.length + tokenLogs.length;
    if (totalLogs > 0) {
      this.logger.log(
        TRANSFERS_LOGS.scanner.scannedBatch(Number(fromBlock), Number(toBlock), totalLogs),
      );
    }
  }
}
