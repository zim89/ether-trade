import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CONFIG_NAMESPACES } from '@app/common/constants';
import type { TransfersServiceClient, WithdrawalItem } from '@app/contracts';
import { PROTO_SERVICES } from '@app/contracts';
import { createGatewayGrpcMetadata } from '../common/constants/grpc.constants';
import { getCorrelationId } from '../common/utils/correlation-context';
import { grpcUnaryCall } from '../common/utils/grpc-call.util';
import type { GatewayConfig } from '../config/config.types';
import {
  DepositAddressResponseDto,
  GetWithdrawalHistoryQueryDto,
  RequestWithdrawalDto,
  WithdrawalListResponseDto,
  WithdrawalResponseDto,
} from './dto';

@Injectable()
export class TransfersService {
  private readonly grpcDeadlineMs: number;

  constructor(
    @Inject(PROTO_SERVICES.transfers)
    private readonly transfersGrpcClient: TransfersServiceClient,
    private readonly configService: ConfigService,
  ) {
    this.grpcDeadlineMs =
      this.configService.get<GatewayConfig>(CONFIG_NAMESPACES.gateway)?.grpcDefaultDeadlineMs ??
      5000;
  }

  /**
   * Retrieves DepositVault address and user's bytes16 representation.
   */
  async getDepositAddress(userId: string): Promise<DepositAddressResponseDto> {
    const metadata = createGatewayGrpcMetadata(getCorrelationId() ?? 'unknown', userId);
    const response = await grpcUnaryCall(
      this.transfersGrpcClient.getDepositAddress({ userId }, metadata),
      this.grpcDeadlineMs,
    );

    return {
      vaultAddress: response.vaultAddress,
      userId: response.userId,
      userIdBytes16: response.userIdBytes16,
    };
  }

  /**
   * Requests a new on-chain withdrawal.
   */
  async requestWithdrawal(
    userId: string,
    dto: RequestWithdrawalDto,
    idempotencyKey?: string,
  ): Promise<WithdrawalResponseDto> {
    if (!idempotencyKey) {
      throw new BadRequestException('x-idempotency-key header is required');
    }

    const metadata = createGatewayGrpcMetadata(getCorrelationId() ?? 'unknown', userId);
    const response = await grpcUnaryCall(
      this.transfersGrpcClient.requestWithdrawal(
        {
          userId,
          currency: dto.currency,
          amount: dto.amount,
          destinationAddress: dto.destinationAddress,
          idempotencyKey,
        },
        metadata,
      ),
      this.grpcDeadlineMs,
    );

    if (!response.withdrawal) {
      throw new BadRequestException('Withdrawal response is empty');
    }

    return this.mapWithdrawalItem(response.withdrawal);
  }

  /**
   * Retrieves withdrawal details by ID.
   */
  async getWithdrawalById(userId: string, id: string): Promise<WithdrawalResponseDto> {
    const metadata = createGatewayGrpcMetadata(getCorrelationId() ?? 'unknown', userId);
    const response = await grpcUnaryCall(
      this.transfersGrpcClient.getWithdrawalById(
        {
          userId,
          withdrawalId: id,
        },
        metadata,
      ),
      this.grpcDeadlineMs,
    );

    if (!response.withdrawal) {
      throw new BadRequestException('Withdrawal not found');
    }

    return this.mapWithdrawalItem(response.withdrawal);
  }

  /**
   * Retrieves user's withdrawal history.
   */
  async getWithdrawalHistory(
    userId: string,
    query: GetWithdrawalHistoryQueryDto,
  ): Promise<WithdrawalListResponseDto> {
    const metadata = createGatewayGrpcMetadata(getCorrelationId() ?? 'unknown', userId);
    const response = await grpcUnaryCall(
      this.transfersGrpcClient.getWithdrawalHistory(
        {
          userId,
          currency: query.currency,
          limit: query.limit ?? 20,
          offset: query.offset ?? 0,
        },
        metadata,
      ),
      this.grpcDeadlineMs,
    );

    return {
      items: (response.withdrawals ?? []).map((item) => this.mapWithdrawalItem(item)),
      total: response.total ?? 0,
    };
  }

  private mapWithdrawalItem(item: WithdrawalItem): WithdrawalResponseDto {
    return {
      id: item.id,
      userId: item.userId,
      currency: item.currency,
      amount: item.amount,
      destinationAddress: item.destinationAddress,
      status: item.status,
      txHash: item.txHash ? item.txHash : undefined,
      errorMessage: item.errorMessage ? item.errorMessage : undefined,
      createdAt: Number(item.createdAt ?? 0),
      updatedAt: Number(item.updatedAt ?? 0),
    };
  }
}
