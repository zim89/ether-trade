import { Metadata } from '@grpc/grpc-js';
import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { authorizeM2MCaller } from '@app/common/utils';
import {
  type GetBalanceRequest,
  type DepositSandboxFundsRequest,
  type LockBalanceRequest,
  type UnlockBalanceRequest,
  type BalanceResponse,
  ACCOUNTS_SERVICE_NAME,
} from '@app/contracts';
import { Account } from '../database/schema/accounts.schema';
import { BALANCES_AUTHORIZED_M2M_CALLERS } from './balances.constants';
import { BalancesService } from './balances.service';

@Controller()
export class BalancesController {
  constructor(private readonly balancesService: BalancesService) {}

  @GrpcMethod(ACCOUNTS_SERVICE_NAME, 'GetBalance')
  async getBalance(data: GetBalanceRequest): Promise<BalanceResponse> {
    const account = await this.balancesService.getBalance(data);
    return this.mapToBalanceResponse(account);
  }

  @GrpcMethod(ACCOUNTS_SERVICE_NAME, 'DepositSandboxFunds')
  async depositSandboxFunds(
    data: DepositSandboxFundsRequest,
    metadata: Metadata,
  ): Promise<BalanceResponse> {
    authorizeM2MCaller(metadata, BALANCES_AUTHORIZED_M2M_CALLERS);
    const account = await this.balancesService.depositSandboxFunds(data);
    return this.mapToBalanceResponse(account);
  }

  @GrpcMethod(ACCOUNTS_SERVICE_NAME, 'LockBalance')
  async lockBalance(data: LockBalanceRequest, metadata: Metadata): Promise<BalanceResponse> {
    authorizeM2MCaller(metadata, BALANCES_AUTHORIZED_M2M_CALLERS);
    const account = await this.balancesService.lockBalance(data);
    return this.mapToBalanceResponse(account);
  }

  @GrpcMethod(ACCOUNTS_SERVICE_NAME, 'UnlockBalance')
  async unlockBalance(data: UnlockBalanceRequest, metadata: Metadata): Promise<BalanceResponse> {
    authorizeM2MCaller(metadata, BALANCES_AUTHORIZED_M2M_CALLERS);
    const account = await this.balancesService.unlockBalance(data);
    return this.mapToBalanceResponse(account);
  }

  private mapToBalanceResponse(account: Account): BalanceResponse {
    return {
      accountId: account.id,
      userId: account.userId,
      currency: account.currency,
      availableBalance: account.availableBalance,
      lockedBalance: account.lockedBalance,
      totalBalance: this.balancesService.calculateTotalBalance(
        account.availableBalance,
        account.lockedBalance,
      ),
      updatedAt: Math.floor(account.updatedAt.getTime() / 1000),
    };
  }
}
