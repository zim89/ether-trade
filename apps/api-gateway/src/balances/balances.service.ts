import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CONFIG_NAMESPACES, DEFAULT_CURRENCY } from '@app/common/constants';
import { type AccountsServiceClient, PROTO_SERVICES } from '@app/contracts';
import { createGatewayGrpcMetadata } from '../common/constants/grpc.constants';
import { getCorrelationId } from '../common/utils/correlation-context';
import { grpcUnaryCall } from '../common/utils/grpc-call.util';
import type { GatewayConfig } from '../config/config.types';
import { BalanceResponseDto, GetBalanceQueryDto } from './dto';

/**
 * Service proxying user balance queries to Accounts microservice via gRPC.
 */
@Injectable()
export class BalancesService {
  private readonly grpcDeadlineMs: number;

  constructor(
    @Inject(PROTO_SERVICES.accounts)
    private readonly accountsGrpcClient: AccountsServiceClient,
    private readonly configService: ConfigService,
  ) {
    this.grpcDeadlineMs =
      this.configService.get<GatewayConfig>(CONFIG_NAMESPACES.gateway)?.grpcDefaultDeadlineMs ??
      5000;
  }

  /**
   * Retrieves account balance for a user in the specified currency.
   *
   * @param userId - User UUID
   * @param query - Filter query containing currency code
   */
  async getBalance(userId: string, query: GetBalanceQueryDto): Promise<BalanceResponseDto> {
    const currency = query.currency || DEFAULT_CURRENCY;
    const metadata = createGatewayGrpcMetadata(getCorrelationId() ?? 'unknown', userId);
    const response = await grpcUnaryCall(
      this.accountsGrpcClient.getBalance(
        {
          userId,
          currency,
        },
        metadata,
      ),
      this.grpcDeadlineMs,
    );

    return {
      accountId: response.accountId,
      userId: response.userId,
      currency: response.currency,
      availableBalance: response.availableBalance,
      lockedBalance: response.lockedBalance,
      totalBalance: response.totalBalance,
      updatedAt: Number(response.updatedAt),
    };
  }
}
