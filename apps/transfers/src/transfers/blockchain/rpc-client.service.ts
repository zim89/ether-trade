import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createPublicClient,
  createWalletClient,
  http,
  PublicClient,
  WalletClient,
  Transport,
  Chain,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';
import { CONFIG_NAMESPACES } from '@app/common/constants';
import { AppConfig } from '../../config';

@Injectable()
export class RpcClientService {
  private readonly logger = new Logger(RpcClientService.name);
  public readonly publicClient: PublicClient<Transport, Chain>;
  public readonly walletClient: WalletClient<Transport, Chain>;
  public readonly account: ReturnType<typeof privateKeyToAccount>;
  public readonly hotWalletAddress: `0x${string}`;
  public readonly depositVaultAddress: `0x${string}`;
  public readonly usdtTokenAddress: `0x${string}`;
  public readonly confirmations: number;

  constructor(private readonly configService: ConfigService) {
    const appConf = this.configService.getOrThrow<AppConfig>(CONFIG_NAMESPACES.app);

    this.account = privateKeyToAccount(appConf.hotWalletPrivateKey);
    this.hotWalletAddress = this.account.address;
    this.depositVaultAddress = appConf.depositVaultAddress;
    this.usdtTokenAddress = appConf.usdtTokenAddress;
    this.confirmations = appConf.confirmations;

    this.publicClient = createPublicClient({
      chain: foundry,
      transport: http(appConf.evmRpcUrl),
    });

    this.walletClient = createWalletClient({
      account: this.account,
      chain: foundry,
      transport: http(appConf.evmRpcUrl),
    });

    this.logger.log(
      `Blockchain clients initialized. RPC: ${appConf.evmRpcUrl}, Hot Wallet: ${this.hotWalletAddress}, Vault: ${this.depositVaultAddress}`,
    );
  }
}
