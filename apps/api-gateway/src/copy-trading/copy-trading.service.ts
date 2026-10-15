import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CONFIG_NAMESPACES } from '@app/common/constants';
import {
  type CopySubscriptionItem,
  type CopyTradingServiceClient,
  type MasterTraderItem,
  PROTO_SERVICES,
} from '@app/contracts';
import { createGatewayGrpcMetadata } from '../common/constants/grpc.constants';
import { getCorrelationId } from '../common/utils/correlation-context';
import { grpcUnaryCall } from '../common/utils/grpc-call.util';
import type { GatewayConfig } from '../config/config.types';
import {
  CancelSubscriptionQueryDto,
  CopySubscriptionResponseDto,
  CopySubscriptionsListResponseDto,
  CreateSubscriptionDto,
  GetMasterTradersQueryDto,
  MasterTraderResponseDto,
  MasterTradersListResponseDto,
  RegisterMasterDto,
} from './dto';

@Injectable()
export class CopyTradingService {
  private readonly grpcDeadlineMs: number;

  constructor(
    @Inject(PROTO_SERVICES.copyTrading)
    private readonly copyTradingGrpcClient: CopyTradingServiceClient,
    private readonly configService: ConfigService,
  ) {
    this.grpcDeadlineMs =
      this.configService.get<GatewayConfig>(CONFIG_NAMESPACES.gateway)?.grpcDefaultDeadlineMs ??
      5000;
  }

  async registerMaster(userId: string, dto: RegisterMasterDto): Promise<MasterTraderResponseDto> {
    const metadata = createGatewayGrpcMetadata(getCorrelationId() ?? 'unknown', userId);
    const response = await grpcUnaryCall(
      this.copyTradingGrpcClient.registerMaster(
        {
          userId,
          displayName: dto.displayName,
          bio: dto.bio,
          minDeposit: dto.minDeposit,
        },
        metadata,
      ),
      this.grpcDeadlineMs,
    );

    if (!response.master) {
      throw new BadRequestException('Failed to register master trader');
    }

    return this.mapMasterToDto(response.master);
  }

  async getMasterTraders(query: GetMasterTradersQueryDto): Promise<MasterTradersListResponseDto> {
    const metadata = createGatewayGrpcMetadata(getCorrelationId() ?? 'unknown');
    const response = await grpcUnaryCall(
      this.copyTradingGrpcClient.getMasterTraders(
        {
          limit: query.limit,
          offset: query.offset,
        },
        metadata,
      ),
      this.grpcDeadlineMs,
    );

    return {
      items: (response.items ?? []).map((item) => this.mapMasterToDto(item)),
      total: response.total ?? 0,
    };
  }

  async createSubscription(
    followerUserId: string,
    dto: CreateSubscriptionDto,
    idempotencyKey?: string,
  ): Promise<CopySubscriptionResponseDto> {
    if (!idempotencyKey) {
      throw new BadRequestException(
        'Header "x-idempotency-key" is required to create a subscription',
      );
    }

    const metadata = createGatewayGrpcMetadata(getCorrelationId() ?? 'unknown', followerUserId);
    const response = await grpcUnaryCall(
      this.copyTradingGrpcClient.createSubscription(
        {
          followerUserId,
          masterId: dto.masterId,
          allocatedBalance: dto.allocatedBalance,
          maxSlippagePercent: dto.maxSlippagePercent,
          idempotencyKey,
        },
        metadata,
      ),
      this.grpcDeadlineMs,
    );

    if (!response.subscription) {
      throw new BadRequestException('Failed to create subscription');
    }

    return this.mapSubscriptionToDto(response.subscription);
  }

  async cancelSubscription(
    followerUserId: string,
    subscriptionId: string,
    query?: CancelSubscriptionQueryDto,
  ): Promise<CopySubscriptionResponseDto> {
    const metadata = createGatewayGrpcMetadata(getCorrelationId() ?? 'unknown', followerUserId);
    const response = await grpcUnaryCall(
      this.copyTradingGrpcClient.cancelSubscription(
        {
          subscriptionId,
          followerUserId,
          closePositions: query?.closePositions ?? false,
        },
        metadata,
      ),
      this.grpcDeadlineMs,
    );

    if (!response.subscription) {
      throw new BadRequestException('Failed to cancel subscription');
    }

    return this.mapSubscriptionToDto(response.subscription);
  }

  async getSubscriptions(followerUserId: string): Promise<CopySubscriptionsListResponseDto> {
    const metadata = createGatewayGrpcMetadata(getCorrelationId() ?? 'unknown', followerUserId);
    const response = await grpcUnaryCall(
      this.copyTradingGrpcClient.getSubscriptions(
        {
          followerUserId,
        },
        metadata,
      ),
      this.grpcDeadlineMs,
    );

    return {
      items: (response.items ?? []).map((item) => this.mapSubscriptionToDto(item)),
    };
  }

  private mapMasterToDto(item: MasterTraderItem): MasterTraderResponseDto {
    return {
      id: item.id,
      userId: item.userId,
      displayName: item.displayName,
      bio: item.bio || undefined,
      totalPnl: item.totalPnl,
      winRate: item.winRate,
      totalCopiers: item.totalCopiers,
      minDeposit: item.minDeposit,
      isActive: item.isActive,
    };
  }

  private mapSubscriptionToDto(item: CopySubscriptionItem): CopySubscriptionResponseDto {
    return {
      id: item.id,
      followerUserId: item.followerUserId,
      masterId: item.masterId,
      allocatedBalance: item.allocatedBalance,
      maxSlippagePercent: item.maxSlippagePercent,
      status: item.status,
      createdAt: Number(item.createdAt),
    };
  }
}
